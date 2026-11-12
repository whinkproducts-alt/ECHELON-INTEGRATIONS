import io
import unittest
import wave
import array
from fastapi.testclient import TestClient
from app import create_app, decode_wav, encode_wav
TOKEN = 'test-only-' + 'x' * 32
class Engine:
    ready = True
    def transcribe(self, samples):
        assert isinstance(samples, array.array) and samples.typecode == 'f'
        return 'hello'
    def speak(self, text, voice): return encode_wav([0.0]*240)
class SpeechContract(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(Engine(), TOKEN))
        self.headers = {'Authorization': 'Bearer ' + TOKEN}
    def test_auth_and_browser_block(self):
        self.assertEqual(self.client.get('/health').status_code, 401)
        self.assertEqual(self.client.get('/health', headers={**self.headers, 'origin': 'http://localhost:3000'}).status_code, 403)
        self.assertEqual(self.client.get('/health', headers=self.headers).status_code, 200)
    def test_offline_readiness(self):
        engine = Engine(); engine.ready = False
        client = TestClient(create_app(engine, TOKEN))
        self.assertEqual(client.get('/health', headers=self.headers).status_code, 503)
        self.assertEqual(client.post('/audio/speech', headers=self.headers, json={'input': 'Hello'}).status_code, 503)
    def test_transcribe_wav_without_confidence(self):
        data = encode_wav([0.0]*160, 16000)
        response = self.client.post('/audio/transcriptions', headers=self.headers, files={'file': ('input.wav', data, 'audio/wav')})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'text': 'hello'})
    def test_reject_compressed_and_long_audio(self):
        response = self.client.post('/audio/transcriptions', headers=self.headers, files={'file': ('fake.webm', b'not WAV', 'audio/webm')})
        self.assertEqual(response.status_code, 415)
        with self.assertRaises(ValueError): decode_wav(encode_wav([0.0]*(16000*61), 16000))
    def test_output_wav_mime_and_frames(self):
        response = self.client.post('/audio/speech', headers=self.headers, json={'input': 'Hello', 'voice': 'af_heart'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'audio/wav')
        self.assertEqual(response.headers['cache-control'], 'no-store')
        with wave.open(io.BytesIO(response.content)) as audio:
            self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (1, 2, 24000))
    def test_reject_paths_formats_extra_fields(self):
        for body in ({'input':'Hello','voice':'../../secret'}, {'input':'Hello','response_format':'mp3'}, {'input':'Hello','url':'https://remote'}):
            self.assertIn(self.client.post('/tts', headers=self.headers, json=body).status_code, (400, 422))
    def test_actual_body_cap(self):
        self.assertEqual(self.client.post('/tts', headers=self.headers, content=b'x'*(10*1024*1024+1)).status_code, 413)
    def test_token_required_at_start(self):
        with self.assertRaises(RuntimeError): create_app(Engine(), '')
if __name__ == '__main__': unittest.main()
