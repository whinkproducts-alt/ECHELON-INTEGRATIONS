"""Portable checks for the Mac-only launchd packaging contract."""
from io import BytesIO
from pathlib import Path
from tarfile import open as open_tar
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import plistlib
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
MACOS = ROOT / 'packaging/macos'


class SandboxPackageTests(unittest.TestCase):
    def test_launch_agents_have_the_expected_scope(self):
        source = (MACOS / 'Enable Sandbox Always On.command').read_text()
        documents = re.findall(r"cat > \"\$[a-z]+\.tmp\" <<'EOF'\n(.*?)\nEOF", source, re.S)
        self.assertEqual(len(documents), 2)
        watchdog, awake = (plistlib.loads(document.encode()) for document in documents)
        self.assertEqual(watchdog['StartInterval'], 120)
        self.assertTrue(watchdog['RunAtLoad'])
        self.assertEqual(watchdog['ProgramArguments'][1],
                         '/Applications/ECHELON Integrations Sandbox.app/Contents/Resources/Keep Sandbox Running.command')
        self.assertEqual(awake['ProgramArguments'], ['/usr/bin/caffeinate', '-s'])
        self.assertTrue(awake['KeepAlive'])

    def test_unsigned_zip_contains_recovery_scripts_and_only_source(self):
        for script in MACOS.glob('*.command'):
            subprocess.run(['bash', '-n', str(script)], check=True)
        with TemporaryDirectory() as folder:
            subprocess.run([sys.executable, str(MACOS / 'build.py'), '--sandbox',
                            '--output', folder, '--format', 'zip'], check=True, capture_output=True)
            with ZipFile(Path(folder) / 'ECHELON-Integrations-Sandbox-0.1.2.zip') as archive:
                app = 'ECHELON Integrations Sandbox.app/Contents/Resources/'
                for command in ('Start Sandbox.command', 'Enable Sandbox Always On.command',
                                'Disable Sandbox Always On.command', 'Keep Sandbox Running.command'):
                    member = app + command
                    self.assertIn(member, archive.namelist())
                    self.assertTrue(archive.getinfo(member).external_attr >> 16 & 0o111)
                self.assertIn('/Applications/ECHELON Integrations Sandbox.app',
                              archive.read('Start Sandbox.command').decode())
                with open_tar(fileobj=BytesIO(archive.read(app + 'source.tar.gz')), mode='r:gz') as source:
                    files = {entry.name for entry in source.getmembers()}
                    self.assertIn('packaging/local/compose.yaml', files)
                    self.assertIn('apps/web/lib/auth/sandbox-cookies.ts', files)
                    self.assertFalse(any('.env' in Path(name).name or 'node_modules' in name for name in files))


if __name__ == '__main__':
    unittest.main()
