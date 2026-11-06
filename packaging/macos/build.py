#!/usr/bin/env python3
"""Build an unsigned macOS local-system installer from the git index only.

Run after staging intended release files. No private .env, untracked files,
installed dependencies, development builds or symlinks enter the payload.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]


def build(destination):
    destination.mkdir(parents=True, exist_ok=True)
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    allowed_roots = ('apps/web/', 'packages/', 'packaging/local/')
    allowed_files = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore'}
    payload = []
    for name in filter(None, files):
        p = ROOT / name
        if name not in allowed_files and not name.startswith(allowed_roots):
            continue
        if any(part.startswith('.env') or part in ('node_modules', '.next', '.git') or part.startswith('.build') for part in p.relative_to(ROOT).parts):
            continue
        if p.is_symlink():
            raise RuntimeError(f'Refusing payload symlink: {name}')
        if p.is_file():
            payload.append((name, p))
    digest = hashlib.sha256()
    for name, p in sorted(payload):
        digest.update(name.encode() + b'\0' + p.read_bytes())
    release = digest.hexdigest()[:16]
    stage = destination / 'stage'
    if stage.exists():
        shutil.rmtree(stage)
    app = stage / 'Applications' / 'Whink Ultimate.app'
    resources = app / 'Contents/Resources'
    macos = app / 'Contents/MacOS'
    resources.mkdir(parents=True)
    macos.mkdir(parents=True)
    with tarfile.open(resources / 'source.tar.gz', 'w:gz') as archive:
        for name, p in payload:
            archive.add(p, arcname=name, recursive=False)
    (resources / 'release-id.txt').write_text(release + '\n')
    shutil.copy(ROOT / 'packaging/macos/Start.command', resources / 'Start.command')
    os.chmod(resources / 'Start.command', 0o755)
    launcher = macos / 'WhinkUltimate'
    launcher.write_text('#!/bin/bash\nexec /usr/bin/open -a Terminal "$(dirname "$0")/../Resources/Start.command"\n')
    os.chmod(launcher, 0o755)
    # No replacement brand artwork or generated mark: Finder uses its default app icon.
    with open(app / 'Contents/Info.plist', 'wb') as file:
        plistlib.dump({'CFBundleIdentifier': 'com.whinkgroup.ultimate.local',
                      'CFBundleName': 'Whink Ultimate', 'CFBundleDisplayName': 'Whink Ultimate',
                      'CFBundleExecutable': 'WhinkUltimate', 'CFBundlePackageType': 'APPL',
                      'CFBundleShortVersionString': '0.1.0', 'CFBundleVersion': '1',
                      'LSMinimumSystemVersion': '12.0'}, file)
    shutil.copy(ROOT / 'packaging/README.md', destination / 'READ-ME-FIRST.md')
    package = destination / 'Whink-Ultimate-Local-0.1.0.pkg'
    subprocess.run(['pkgbuild', '--root', str(stage), '--install-location', '/',
                    '--identifier', 'com.whinkgroup.ultimate.local', '--version', '0.1.0',
                    str(package)], check=True)
    metadata = {'payload_id': release, 'source_base': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'package_sha256': hashlib.sha256(package.read_bytes()).hexdigest(),
        'payload_files': len(payload), 'signed': False, 'notarized': False,
        'live_installation_verified': False}
    (destination / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args().output.resolve())
