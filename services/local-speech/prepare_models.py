"""Explicit, online preparation of official speech assets; normal startup is offline."""
import hashlib
import json
import os
import shutil
from pathlib import Path

WHISPER_REPO = 'Systran/faster-whisper-small.en'
KOKORO_REPO = 'hexgrad/Kokoro-82M'
VOICES = ('af_heart', 'af_bella', 'af_sky', 'af_nova', 'am_adam', 'am_michael')
KOKORO_FILES = ('config.json', 'kokoro-v1_0.pth', *(f'voices/{name}.pt' for name in VOICES))
MIN_FREE_BYTES = 3 * 1024 ** 3


def _sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_assets(models_dir=Path('/models')):
    """Reject incomplete or changed local model files before inference or reuse."""
    root = Path(models_dir).resolve()
    manifest = root / 'speech-assets.json'
    data = json.loads(manifest.read_text())
    if data['whisper']['repo'] != WHISPER_REPO or data['kokoro']['repo'] != KOKORO_REPO:
        raise ValueError('Unexpected speech asset repository')
    for kind, required in (('whisper', {'config.json', 'model.bin', 'tokenizer.json'}),
                           ('kokoro', set(KOKORO_FILES))):
        entry = data[kind]
        revision = entry['revision']
        if len(revision) != 40 or any(char not in '0123456789abcdef' for char in revision):
            raise ValueError('Invalid speech asset revision')
        files = entry['files']
        if not required.issubset(files):
            raise ValueError('Speech asset manifest is incomplete')
        base = root / 'whisper-small.en' if kind == 'whisper' else root / 'hf' / 'hub' / 'models--hexgrad--Kokoro-82M' / 'snapshots' / revision
        for name, digest in files.items():
            path = (base / name).resolve()
            if not path.is_relative_to(root) or not path.is_file() or _sha256(path) != digest:
                raise ValueError('Speech asset missing or modified')
    return data


def prepare(models_dir=Path('/models')):
    models_dir = Path(models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)
    manifest = models_dir / 'speech-assets.json'
    if manifest.exists():
        verify_assets(models_dir)
        print('Existing speech assets verified; reusing private model volume.')
        return
    if shutil.disk_usage(models_dir).free < MIN_FREE_BYTES:
        raise RuntimeError('At least 3 GiB free storage is required before downloading speech assets')

    # Only this explicit helper is permitted to contact model hosting.
    os.environ.pop('HF_HUB_OFFLINE', None)
    os.environ.pop('TRANSFORMERS_OFFLINE', None)
    from huggingface_hub import HfApi, snapshot_download

    api = HfApi()
    whisper_sha = api.model_info(WHISPER_REPO, revision='main').sha
    kokoro_sha = api.model_info(KOKORO_REPO, revision='main').sha
    if not all(len(sha) == 40 and all(c in '0123456789abcdef' for c in sha) for sha in (whisper_sha, kokoro_sha)):
        raise RuntimeError('Model host did not return immutable commit IDs')

    whisper_path = models_dir / 'whisper-small.en'
    snapshot_download(repo_id=WHISPER_REPO, revision=whisper_sha,
                      allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.*', 'README.md', 'LICENSE*', 'NOTICE*'],
                      local_dir=str(whisper_path))
    for filename in ('config.json', 'model.bin', 'tokenizer.json'):
        if not (whisper_path / filename).is_file():
            raise RuntimeError(f'Whisper asset missing: {filename}')

    # Kokoro's library calls hf_hub_download without a revision at runtime.
    # Resolve main once, download only the required files, then verify the
    # snapshot commit matches the ID fetched above before writing the lock.
    kokoro_path = Path(snapshot_download(repo_id=KOKORO_REPO, revision='main',
                                        allow_patterns=[*KOKORO_FILES, 'README.md', 'LICENSE*', 'NOTICE*']))
    if kokoro_path.name != kokoro_sha:
        raise RuntimeError('Kokoro changed during preparation; rerun on a fresh model volume')
    for filename in KOKORO_FILES:
        if not (kokoro_path / filename).is_file():
            raise RuntimeError(f'Kokoro asset missing: {filename}')

    assets = {
        'whisper': {'repo': WHISPER_REPO, 'revision': whisper_sha,
                    'files': {p.name: _sha256(p) for p in whisper_path.iterdir() if p.is_file()}},
        'kokoro': {'repo': KOKORO_REPO, 'revision': kokoro_sha,
                   'files': {name: _sha256(kokoro_path / name) for name in KOKORO_FILES}},
    }
    temporary = manifest.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(assets, indent=2, sort_keys=True) + '\n')
    temporary.replace(manifest)
    verify_assets(models_dir)
    print('Speech assets prepared and locked. Runtime will use this cache offline.')


if __name__ == '__main__':
    prepare()
