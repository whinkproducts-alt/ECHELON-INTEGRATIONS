import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare_models import KOKORO_FILES, prepare, verify_assets


class PrepareModelsTests(unittest.TestCase):
    def test_manifest_is_written_only_after_complete_verified_snapshots(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            model_cache = root / 'whisper-small.en'
            kokoro = root / 'hf' / 'hub' / 'models--hexgrad--Kokoro-82M' / 'snapshots' / ('a' * 40)
            def download(*, repo_id, revision, allow_patterns, local_dir=None):
                if local_dir:
                    self.assertEqual(revision, 'a' * 40)
                    model_cache.mkdir()
                    for name in ('config.json', 'model.bin', 'tokenizer.json'):
                        (model_cache / name).write_bytes(b'asset')
                    return str(model_cache)
                self.assertEqual(revision, 'main')
                for name in KOKORO_FILES:
                    path = kokoro / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'asset')
                return str(kokoro)
            hub = types.SimpleNamespace(
                HfApi=lambda: types.SimpleNamespace(model_info=lambda repo, revision: types.SimpleNamespace(sha='a' * 40)),
                snapshot_download=download,
            )
            with patch.dict(sys.modules, {'huggingface_hub': hub}), patch('prepare_models.shutil.disk_usage', return_value=types.SimpleNamespace(free=4 * 1024 ** 3)):
                prepare(root)
                manifest = json.loads((root / 'speech-assets.json').read_text())
                self.assertEqual(len(manifest['kokoro']['files']), len(KOKORO_FILES))
                self.assertEqual(manifest['whisper']['revision'], 'a' * 40)
                prepare(root)
                self.assertEqual(verify_assets(root)['kokoro']['revision'], 'a' * 40)
                (kokoro / KOKORO_FILES[0]).write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'modified'):
                    verify_assets(root)

    def test_changed_snapshot_is_rejected_without_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def download(*, repo_id, revision, allow_patterns, local_dir=None):
                if local_dir:
                    path = Path(local_dir)
                    path.mkdir()
                    for name in ('config.json', 'model.bin', 'tokenizer.json'):
                        (path / name).write_bytes(b'asset')
                    return str(path)
                wrong = root / ('b' * 40)
                wrong.mkdir()
                return str(wrong)
            hub = types.SimpleNamespace(
                HfApi=lambda: types.SimpleNamespace(model_info=lambda repo, revision: types.SimpleNamespace(sha='a' * 40)),
                snapshot_download=download,
            )
            with patch.dict(sys.modules, {'huggingface_hub': hub}), patch('prepare_models.shutil.disk_usage', return_value=types.SimpleNamespace(free=4 * 1024 ** 3)):
                with self.assertRaisesRegex(RuntimeError, 'changed during preparation'):
                    prepare(root)
                self.assertFalse((root / 'speech-assets.json').exists())


if __name__ == '__main__':
    unittest.main()
