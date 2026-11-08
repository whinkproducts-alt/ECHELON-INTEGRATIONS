import http.client
import threading
import unittest
from unittest.mock import patch

from bridge import MAX_REQUEST, SpeechBridgeServer, make_handler, upstream_port

TOKEN = "test-only-" + "b" * 24


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.server = SpeechBridgeServer(("127.0.0.1", 0), make_handler(TOKEN, 3900))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, headers=None, method="POST"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        result = (response.status, response.read())
        conn.close()
        return result

    def test_requires_auth_without_contacting_upstream(self):
        with patch("bridge.http.client.HTTPConnection") as upstream:
            # Use the original connection class for the local test request.
            real_conn = _HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
            real_conn.request("POST", "/v1/audio/speech")
            self.assertEqual(real_conn.getresponse().status, 401)
            real_conn.close()
            upstream.assert_not_called()

    def test_arbitrary_paths_and_querystrings_are_denied(self):
        for path in ["/admin", "http://example.com/", "/v1/audio/speech?target=remote"]:
            self.assertEqual(self.request(path, {"Authorization": "Bearer " + TOKEN})[0], 404)

    def test_payload_cap_applies_before_read(self):
        status, _ = self.request("/v1/audio/transcriptions", {"Authorization": "Bearer " + TOKEN, "Content-Length": str(MAX_REQUEST + 1)})
        self.assertEqual(status, 413)

    def test_port_and_token_validation(self):
        for port in ["0", "80", "65536", "https://remote"]:
            with self.assertRaises(ValueError):
                upstream_port(port)
        with self.assertRaises(ValueError):
            make_handler("short", 3900)

    def test_browser_origin_is_forbidden(self):
        status, _ = self.request("/v1/audio/speech", {"Authorization": "Bearer " + TOKEN, "Origin": "http://localhost:3000"})
        self.assertEqual(status, 403)

    def test_authenticated_upstream_response_and_redirect_safety(self):
        with patch("bridge.http.client.HTTPConnection") as upstream:
            result = upstream.return_value.getresponse.return_value
            result.status = 200
            result.read.return_value = b'RIFFtestWAVE'
            result.getheader.return_value = 'audio/wav'
            conn = _HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
            conn.request("POST", "/v1/audio/speech", body=b'{}', headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
            response = conn.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'RIFFtestWAVE')
            conn.close()
            upstream.assert_called_with("host.docker.internal", 3900, timeout=20)
            self.assertEqual(upstream.return_value.request.call_args.kwargs['headers']['Authorization'], 'Bearer ' + TOKEN)

            result.status = 302
            result.read.return_value = b'secret-provider-error'
            conn = _HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
            conn.request("GET", "/.well-known/voicestudio-speech", headers={"Authorization": "Bearer " + TOKEN})
            response = conn.getresponse()
            self.assertEqual(response.status, 503)
            self.assertNotIn(b'secret-provider-error', response.read())
            conn.close()

    def test_capacity_is_bounded_and_extra_connections_close(self):
        # Exhaust the server's admission slots; the next unauthenticated connection
        # is closed before any parsing/forwarding, without creating another thread.
        for _ in range(4):
            self.assertTrue(self.server.slots.acquire(blocking=False))
        try:
            conn = _HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
            conn.request("GET", "/.well-known/voicestudio-speech")
            with self.assertRaises((http.client.RemoteDisconnected, ConnectionResetError)):
                conn.getresponse()
            conn.close()
        finally:
            for _ in range(4):
                self.server.slots.release()


_HTTPConnection = http.client.HTTPConnection
if __name__ == "__main__":
    unittest.main()
