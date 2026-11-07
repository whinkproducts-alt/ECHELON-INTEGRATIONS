using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Windows.Forms;

// Per-user self-extracting wrapper. No downloads, elevation or policy changes.
internal static class Installer
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = Array.Exists(args, value => value.Equals("/Q", StringComparison.OrdinalIgnoreCase));
        string temporary = Path.Combine(Path.GetTempPath(), "WhinkInstall-" + Guid.NewGuid().ToString("N"));
        try
        {
            DirectorySecurity acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            foreach (SecurityIdentifier sid in new[] { WindowsIdentity.GetCurrent().User, new SecurityIdentifier("S-1-5-18") })
                acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            Directory.CreateDirectory(temporary, acl);
            string archivePath = Path.Combine(temporary, "embedded.zip");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Whink.Payload"))
            using (FileStream file = File.Create(archivePath))
            {
                if (resource == null) throw new InvalidDataException("Installer payload absent.");
                resource.CopyTo(file);
            }
            HashSet<string> allowed = new HashSet<string>(StringComparer.Ordinal) {
                "Install.cmd", "Install.ps1", "Start.cmd", "Start.ps1", "Uninstall.ps1",
                "Runtime.psm1", "source.zip", "release.json", "README.md"
            };
            HashSet<string> extracted = new HashSet<string>(StringComparer.Ordinal);
            using (ZipArchive archive = ZipFile.OpenRead(archivePath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (!allowed.Contains(entry.FullName) || !extracted.Add(entry.FullName))
                        throw new InvalidDataException("Unexpected or duplicate payload entry.");
                    entry.ExtractToFile(Path.Combine(temporary, entry.FullName), false);
                }
            }
            if (!allowed.SetEquals(extracted)) throw new InvalidDataException("Installer payload incomplete.");
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                @"WindowsPowerShell\v1.0\powershell.exe");
            ProcessStartInfo start = new ProcessStartInfo(powershell,
                "-NoProfile -File \"" + Path.Combine(temporary, "Install.ps1") + "\"");
            start.UseShellExecute = false;
            start.WorkingDirectory = temporary;
            using (Process process = Process.Start(start))
            {
                process.WaitForExit();
                if (process.ExitCode != 0) throw new InvalidOperationException("Installation failed. Windows PowerShell policy still applies; no bypass was attempted.");
            }
            Console.WriteLine("Installed Whink Ultimate. Open it from the Start Menu.");
            if (!quiet) MessageBox.Show("Installed Whink Ultimate. Open it from the Start Menu.\n\nDocker Desktop with WSL2 is required to start the local system.", "Whink Ultimate", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            if (!quiet) MessageBox.Show(error.Message, "Whink installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            // Only the random private directory created by this process, never app/user state.
            try { if (Directory.Exists(temporary)) Directory.Delete(temporary, true); } catch { }
        }
    }
}
