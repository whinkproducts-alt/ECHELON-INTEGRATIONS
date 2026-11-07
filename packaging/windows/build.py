#!/usr/bin/env python3
"""Stage a secret-free local-system payload and compile it with Windows IExpress."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def build(output: Path, stage_only: bool):
    output.mkdir(parents=True, exist_ok=True)
    stage = output / 'stage'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    selected = []
    for name in filter(None, tracked):
        if name not in {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore'} and not name.startswith(('apps/web/', 'packages/', 'packaging/local/')):
            continue
        parts = Path(name).parts
        if any(p.startswith(('.env', '.build')) or p in {'node_modules', '.next', '.git'} for p in parts):
            continue
        path = ROOT / name
        if path.is_symlink():
            raise RuntimeError(f'Refusing symlink: {name}')
        if path.is_file():
            selected.append((name, path))
    with zipfile.ZipFile(stage / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, path in selected:
            archive.write(path, name)
    payload_hash = hashlib.sha256((stage / 'source.zip').read_bytes()).hexdigest()
    metadata = {'source_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                'payload_id': payload_hash[:16], 'payload_sha256': payload_hash, 'payload_files': len(selected),
                'signed': False, 'full_docker_runtime_verified': False}
    (stage / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    for name in ['Install.ps1', 'Start.ps1', 'Uninstall.ps1', 'Runtime.psm1', 'README.md']:
        shutil.copy(ROOT / 'packaging/windows' / name, stage / name)
    # No execution-policy override or elevation. Enterprise policies continue to apply.
    (stage / 'Install.cmd').write_bytes(b'@echo off\r\npowershell.exe -NoProfile -File "%~dp0Install.ps1"\r\nexit /b %errorlevel%\r\n')
    (stage / 'Start.cmd').write_bytes(b'@echo off\r\npowershell.exe -NoProfile -File "%~dp0Start.ps1" %*\r\nif errorlevel 1 pause\r\n')
    if stage_only:
        print(json.dumps(metadata, indent=2))
        return
    if os.name != 'nt':
        raise RuntimeError('The EXE compiler requires Windows; use --stage-only for source/payload verification elsewhere.')
    executable = output / 'Whink-Ultimate-Windows-Setup.exe'
    files = sorted(p.name for p in stage.iterdir() if p.is_file())
    lines = ['[Version]', 'Class=IEXPRESS', 'SEDVersion=3', '[Options]', 'PackagePurpose=InstallApp',
             'ShowInstallProgramWindow=1', 'HideExtractAnimation=0', 'UseLongFileName=1',
             'InsideCompressed=0', 'CAB_FixedSize=0', 'CAB_ResvCodeSigning=0', 'RebootMode=N',
             'InstallPrompt=', 'DisplayLicense=', 'FinishMessage=',
             'FriendlyName=Whink Ultimate Local System', 'TargetName=' + str(executable),
             'AppLaunched=cmd.exe /d /c Install.cmd', 'PostInstallCmd=<None>', 'AdminQuietInstCmd=', 'UserQuietInstCmd=',
             'SourceFiles=SourceFiles', '[Strings]']
    lines += [f'FILE{i}="{name}"' for i, name in enumerate(files)]
    lines += ['[SourceFiles]', 'SourceFiles0=' + str(stage) + '\\', '[SourceFiles0]']
    lines += [f'%FILE{i}%=' for i in range(len(files))]
    sed = output / 'installer.sed'
    sed.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    compiler = Path(os.environ['WINDIR']) / 'System32/iexpress.exe'
    subprocess.run([str(compiler), '/N', '/Q', str(sed)], check=True, timeout=180)
    if not executable.exists() or executable.stat().st_size < 100000:
        raise RuntimeError('IExpress did not produce an installer.')
    metadata['installer_sha256'] = hashlib.sha256(executable.read_bytes()).hexdigest()
    (output / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    shutil.copy(ROOT / 'packaging/windows/README.md', output / 'README.md')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stage-only', action='store_true')
    args = parser.parse_args()
    build(args.output.resolve(), args.stage_only)
