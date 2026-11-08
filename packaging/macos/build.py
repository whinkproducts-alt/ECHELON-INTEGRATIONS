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
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def build(destination, output_format='auto'):
    destination.mkdir(parents=True, exist_ok=True)
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    allowed_roots = ('apps/web/', 'packages/', 'packaging/local/', 'services/local-speech/', 'services/voicestudio-bridge/')
    allowed_files = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore',
                     'services/openclaw/upstreams/social/src/tools.ts',
                     'docs/product/ECHELON-MEDIA-SPEECH-PERFORMANCE-BUILD-PLAN.md',
                     'docs/HIGGSFIELD-CONNECTOR.md',
                     'docs/releases/2026-11-08-media-speech-performance.md'}
    payload = []
    for name in filter(None, files):
        p = ROOT / name
        if name not in allowed_files and not name.startswith(allowed_roots):
            continue
        if any(part.startswith('.env') or part in ('node_modules', '.next', '.git', '__pycache__', '.venv') or part.startswith('.build') for part in p.relative_to(ROOT).parts):
            continue
        if p.is_symlink():
            raise RuntimeError(f'Refusing payload symlink: {name}')
        if p.is_file():
            payload.append((name, p))
    digest = hashlib.sha256()
    for name, p in sorted(payload):
        digest.update(name.encode() + b'\0' + p.read_bytes())
    # Launcher changes must produce a new release even when application source is unchanged.
    for name in ('packaging/macos/Start.command', 'packaging/macos/Configure Speech.command', 'packaging/README.md'):
        digest.update(name.encode() + b'\0' + (ROOT / name).read_bytes())
    release = digest.hexdigest()[:16]
    stage = destination / 'stage'
    if stage.exists():
        shutil.rmtree(stage)
    app = stage / 'Applications' / 'Whink Ultimate.app'
    resources = app / 'Contents/Resources'
    macos = app / 'Contents/MacOS'
    resources.mkdir(parents=True)
    macos.mkdir(parents=True)
    stage.chmod(0o755)
    app.parent.chmod(0o755)
    with tarfile.open(resources / 'source.tar.gz', 'w:gz') as archive:
        for name, p in payload:
            archive.add(p, arcname=name, recursive=False)
    (resources / 'release-id.txt').write_text(release + '\n')
    shutil.copy(ROOT / 'packaging/macos/Start.command', resources / 'Start.command')
    os.chmod(resources / 'Start.command', 0o755)
    shutil.copy(ROOT / 'packaging/macos/Configure Speech.command', resources / 'Configure Speech.command')
    os.chmod(resources / 'Configure Speech.command', 0o755)
    launcher = macos / 'WhinkUltimate'
    launcher.write_text('#!/bin/bash\nexec /usr/bin/open -a Terminal "$(dirname "$0")/../Resources/Start.command"\n')
    os.chmod(launcher, 0o755)
    # No replacement brand artwork or generated mark: Finder uses its default app icon.
    with open(app / 'Contents/Info.plist', 'wb') as file:
        plistlib.dump({'CFBundleIdentifier': 'com.whinkgroup.ultimate.local',
                      'CFBundleName': 'Whink Ultimate', 'CFBundleDisplayName': 'Whink Ultimate',
                      'CFBundleExecutable': 'WhinkUltimate', 'CFBundlePackageType': 'APPL',
                      'CFBundleShortVersionString': '0.2.0', 'CFBundleVersion': '2',
                      'LSMinimumSystemVersion': '12.0'}, file)
    # A pkg is installed by root; restrictive build-host umask must not make
    # Applications/Whink Ultimate.app unreadable to the actual Mac user.
    for path in [app, *app.rglob('*')]:
        executable = path.is_dir() or path == launcher or path.suffix == '.command'
        path.chmod(0o755 if executable else 0o644)
    shutil.copy(ROOT / 'packaging/README.md', destination / 'READ-ME-FIRST.md')
    shutil.copy(ROOT / 'docs/product/ECHELON-MEDIA-SPEECH-PERFORMANCE-BUILD-PLAN.md', destination / 'ARCHITECTURE.md')
    if output_format == 'auto':
        output_format = 'pkg' if shutil.which('pkgbuild') else 'zip'
    if output_format == 'pkg':
        package = destination / 'Whink-Ultimate-Local-0.2.0.pkg'
        subprocess.run(['pkgbuild', '--root', str(stage), '--install-location', '/',
                        '--identifier', 'com.whinkgroup.ultimate.local', '--version', '0.2.0',
                        str(package)], check=True)
    else:
        # A portable candidate can be prepared on Linux without pretending pkgbuild ran.
        package = destination / 'Whink-Ultimate-Local-0.2.0.zip'
        with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(app.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(app.parent))
            archive.write(destination / 'READ-ME-FIRST.md', 'READ-ME-FIRST.md')
            archive.write(destination / 'ARCHITECTURE.md', 'ARCHITECTURE.md')
            for title, command in (
                ('Start.command', 'Start.command'),
                ('Configure Speech.command', 'Configure Speech.command'),
            ):
                info = zipfile.ZipInfo(title)
                info.create_system = 3
                info.external_attr = 0o100755 << 16
                script = '#!/bin/bash\nexec bash "$(cd "$(dirname "$0")" && pwd)/Whink Ultimate.app/Contents/Resources/' + command + '"\n'
                archive.writestr(info, script)
    metadata = {'payload_id': release, 'source_base': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'package_sha256': hashlib.sha256(package.read_bytes()).hexdigest(),
        'format': output_format, 'payload_files': len(payload), 'signed': False, 'notarized': False,
        'live_installation_verified': False}
    (destination / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--format', choices=('auto', 'pkg', 'zip'), default='auto')
    args = parser.parse_args()
    build(args.output.resolve(), args.format)
