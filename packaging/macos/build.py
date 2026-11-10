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


def build(destination, output_format='auto', sandbox=False):
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
    for name in ('packaging/macos/Start.command', 'packaging/macos/Configure Speech.command', 'packaging/macos/Prepare Speech.command', 'packaging/README.md'):
        digest.update(name.encode() + b'\0' + (ROOT / name).read_bytes())
    if sandbox:
        digest.update(b'echelon-integrations-sandbox-v1')
    release = digest.hexdigest()[:16]
    app_name = 'ECHELON Integrations Sandbox' if sandbox else 'Whink Ultimate'
    executable_name = 'EchelonIntegrationsSandbox' if sandbox else 'WhinkUltimate'
    identifier = 'com.whinkgroup.echelon.integrations.sandbox' if sandbox else 'com.whinkgroup.ultimate.local'
    version = '0.1.0' if sandbox else '0.3.0'
    filename = 'ECHELON-Integrations-Sandbox' if sandbox else 'Whink-Ultimate-Local'
    stage = destination / 'stage'
    if stage.exists():
        shutil.rmtree(stage)
    app = stage / 'Applications' / f'{app_name}.app'
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
    shutil.copy(ROOT / 'packaging/macos/Prepare Speech.command', resources / 'Prepare Speech.command')
    os.chmod(resources / 'Prepare Speech.command', 0o755)
    if sandbox:
        command_names = {
            'Start Sandbox.command': 'Start.command',
            'Prepare Sandbox Speech.command': 'Prepare Speech.command',
            'Configure Sandbox VoiceStudio.command': 'Configure Speech.command',
        }
        for title, target in command_names.items():
            helper = resources / title
            helper.write_text('#!/bin/bash\nexport WHINK_INSTALL_KIND=sandbox\nexec bash "$(cd "$(dirname "$0")" && pwd)/' + target + '" "$@"\n')
            helper.chmod(0o755)
    else:
        command_names = {
            'Start.command': 'Start.command',
            'Prepare Speech.command': 'Prepare Speech.command',
            'Configure Speech.command': 'Configure Speech.command',
        }
    launcher = macos / executable_name
    launch_command = 'Start Sandbox.command' if sandbox else 'Start.command'
    launcher.write_text('#!/bin/bash\nexec /usr/bin/open -a Terminal "$(dirname "$0")/../Resources/' + launch_command + '"\n')
    os.chmod(launcher, 0o755)
    # No replacement brand artwork or generated mark: Finder uses its default app icon.
    with open(app / 'Contents/Info.plist', 'wb') as file:
        plistlib.dump({'CFBundleIdentifier': identifier,
                      'CFBundleName': app_name, 'CFBundleDisplayName': app_name,
                      'CFBundleExecutable': executable_name, 'CFBundlePackageType': 'APPL',
                      'CFBundleShortVersionString': version, 'CFBundleVersion': '1' if sandbox else '3',
                      'LSMinimumSystemVersion': '12.0'}, file)
    # A pkg is installed by root; restrictive build-host umask must not make
    # Applications/Whink Ultimate.app unreadable to the actual Mac user.
    for path in [app, *app.rglob('*')]:
        executable = path.is_dir() or path == launcher or path.suffix == '.command'
        path.chmod(0o755 if executable else 0o644)
    shutil.copy(ROOT / ('docs/product/ECHELON-INTEGRATIONS-SANDBOX.md' if sandbox else 'packaging/README.md'), destination / 'READ-ME-FIRST.md')
    shutil.copy(ROOT / 'docs/product/ECHELON-MEDIA-SPEECH-PERFORMANCE-BUILD-PLAN.md', destination / 'ARCHITECTURE.md')
    if output_format == 'auto':
        output_format = 'pkg' if shutil.which('pkgbuild') else 'zip'
    if output_format == 'pkg':
        package = destination / f'{filename}-{version}.pkg'
        subprocess.run(['pkgbuild', '--root', str(stage), '--install-location', '/',
                        '--identifier', identifier, '--version', version,
                        str(package)], check=True)
    else:
        # A portable candidate can be prepared on Linux without pretending pkgbuild ran.
        package = destination / f'{filename}-{version}.zip'
        with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(app.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(app.parent))
            archive.write(destination / 'READ-ME-FIRST.md', 'READ-ME-FIRST.md')
            archive.write(destination / 'ARCHITECTURE.md', 'ARCHITECTURE.md')
            for title, command in command_names.items():
                info = zipfile.ZipInfo(title)
                info.create_system = 3
                info.external_attr = 0o100755 << 16
                script = '#!/bin/bash\nexec bash "$(cd "$(dirname "$0")" && pwd)/' + app_name + '.app/Contents/Resources/' + title + '" "$@"\n'
                archive.writestr(info, script)
    metadata = {'payload_id': release, 'kind': 'sandbox' if sandbox else 'personal', 'source_base': subprocess.check_output(
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
    parser.add_argument('--sandbox', action='store_true', help='Build a fully isolated ECHELON-INTEGRATIONS test app')
    args = parser.parse_args()
    build(args.output.resolve(), args.format, args.sandbox)
