"""Narrow loopback relay from the web network namespace to VoiceStudio on the Mac.

No arbitrary destination, redirects, public listener, credential logging, or retries.
The app must still enforce account, admission and lockdown policy before calling.
"""
import hmac
import http.client
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_REQUEST = 10 * 1024 * 1024
MAX_RESPONSE = 16 * 1024 * 1024
PATHS = {
    "POST": {"/v1/audio/transcriptions", "/v1/audio/speech"},
    "GET": {"/.well-known/voicestudio-speech", "/v1/audio/voices"},
}


class SpeechBridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 4

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(4)
        super().__init__(*args, **kwargs)

    def get_request(self):
        connection, address = super().get_request()
        # Applies before parsing headers, including unauthenticated partial requests.
        connection.settimeout(10)
        return connection, address

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, _request, _address):
        pass  # Never dump request/provider details through a handler traceback.


def upstream_port(value):
    port = int(value)
    if not 1024 <= port <= 65535:
        raise ValueError("VoiceStudio port must be between 1024 and 65535")
    return port


def make_handler(token, port):
    if len(token) < 16 or not token.isascii():
        raise ValueError("VoiceStudio API token must contain at least 16 characters")

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def log_message(self, *_args):
            pass  # No paths, payloads, credentials, or upstream error bodies in logs.

        def reply(self, status, body=b"", content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def forward(self):
            self.connection.settimeout(20)
            if self.headers.get("Origin") or self.headers.get("Sec-Fetch-Site"):
                return self.reply(403, b'{"error":"Browser access forbidden"}')
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + token).encode()):
                return self.reply(401, b'{"error":"Unauthorized"}')
            if self.path not in PATHS.get(self.command, set()):
                return self.reply(404, b'{"error":"Unsupported speech endpoint"}')
            if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
                return self.reply(400, b'{"error":"Invalid body framing"}')
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, b'{"error":"Invalid body length"}')
            if length < 0 or length > MAX_REQUEST:
                return self.reply(413, b'{"error":"Speech input too large"}')
            if self.command == "GET" and length:
                return self.reply(400, b'{"error":"Unexpected body"}')
            conn = None
            try:
                body = self.rfile.read(length)
                if len(body) != length:
                    return self.reply(400, b'{"error":"Incomplete body"}')
                # This host is deliberately fixed. Environment controls only its port.
                conn = http.client.HTTPConnection("host.docker.internal", port, timeout=20)
                conn.request(self.command, self.path, body=body, headers={
                    "Authorization": "Bearer " + token,
                    "Content-Type": self.headers.get("Content-Type", "application/json"),
                    "Content-Length": str(length),
                })
                response = conn.getresponse()
                if not 200 <= response.status < 300:
                    # Do not relay redirects or provider error text, which may contain secrets.
                    status = 401 if response.status in (401, 403) else 503
                    return self.reply(status, b'{"error":"VoiceStudio unavailable or not authorized"}')
                content = response.read(MAX_RESPONSE + 1)
                if len(content) > MAX_RESPONSE:
                    return self.reply(502, b'{"error":"Speech response too large"}')
                kind = response.getheader("Content-Type", "application/octet-stream").split(";")[0]
                allowed = {"audio/wav", "audio/x-wav", "application/json"}
                if kind not in allowed:
                    return self.reply(502, b'{"error":"Unsupported speech response"}')
                self.reply(200, content, kind)
            except (OSError, TimeoutError, http.client.HTTPException):
                self.reply(503, b'{"error":"VoiceStudio connection unavailable"}')
            finally:
                if conn:
                    conn.close()

        do_GET = forward
        do_POST = forward

    return Handler


if __name__ == "__main__":
    handler = make_handler(os.environ.get("VOICESTUDIO_API_KEY", ""), upstream_port(os.environ.get("VOICESTUDIO_HOST_PORT", "3900")))
    server = SpeechBridgeServer(("127.0.0.1", 8766), handler)
    server.serve_forever()
