// MathStudio for Word, Windows setup (current user, no administrator rights).
//
// Installs into %LOCALAPPDATA%\MathStudio:
//   - the add-in manifest, registered with Word (Office 16.0+: 2016, 2019, 2021, 2024, Microsoft 365)
//     through HKCU\Software\Microsoft\Office\16.0\Wef\Developer; the add-in itself is served from
//     the address in the manifest (GitHub Pages), so Word gets updates by itself;
//   - the math fonts (per-user fonts);
//   - the double-click / keyboard shortcut helper, started at sign-in;
//   - an entry in Settings > Apps to remove it all.
//
// MathStudioSetup.exe            install (or update)
// MathStudioSetup.exe /uninstall remove
// /quiet                         no questions, no messages
//
// Build: powershell -File installer/windows/build.ps1 (see there).
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("MathStudio Setup")]
[assembly: AssemblyProduct("MathStudio")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace MathStudio
{
    internal static class Setup
    {
        private const string Title = "MathStudio cho Word";
        private const string WefKey = @"Software\Microsoft\Office\16.0\Wef\Developer";
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MathStudio";
        private const string FontsKey = @"Software\Microsoft\Windows NT\CurrentVersion\Fonts";
        private const string HelperName = "MathStudioHotkeys";

        /** Embedded font file -> name registered with Windows. */
        private static readonly string[,] Fonts =
        {
            { "STIXTwoMath-Regular.otf", "STIX Two Math (OpenType)" },
            { "texgyretermes-math.otf", "TeX Gyre Termes Math (OpenType)" },
            { "latinmodern-math.otf", "Latin Modern Math (OpenType)" },
        };

        private static bool _quiet;

        private static string InstallDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MathStudio"); }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            bool uninstall = false;
            foreach (var a in args)
            {
                var s = a.ToLowerInvariant();
                if (s == "/uninstall" || s == "-uninstall" || s == "--uninstall") uninstall = true;
                if (s == "/quiet" || s == "-quiet" || s == "--quiet") _quiet = true;
            }
            Application.EnableVisualStyles();
            try
            {
                return uninstall ? Uninstall() : Install();
            }
            catch (Exception ex)
            {
                Show("Có lỗi khi " + (uninstall ? "gỡ" : "cài") + " MathStudio:\n\n" + ex.Message, MessageBoxIcon.Error);
                return 1;
            }
        }

        /* ------------------------------------------------------------------ install */

        private static int Install()
        {
            string manifest = Resource("manifest.xml");
            string id = Regex.Match(manifest, @"<Id>\s*([^<\s]+)\s*</Id>").Groups[1].Value;
            string version = Regex.Match(manifest, @"<Version>\s*([^<\s]+)\s*</Version>").Groups[1].Value;
            if (id.Length == 0) throw new InvalidDataException("manifest without <Id>");

            if (!_quiet && MessageBox.Show(
                    "Cài MathStudio vào Microsoft Word?\n\n" +
                    "• Tab MathStudio trên Word: soạn công thức, vẽ hình, nhận diện từ ảnh.\n" +
                    "• Phông chữ toán học (STIX Two Math, TeX Gyre Termes Math, Latin Modern Math).\n" +
                    "• Nhấp đúp vào công thức / hình để sửa, phím tắt như MathType.\n\n" +
                    "Không cần quyền quản trị. Cần Word 2016 trở lên (khuyên dùng Microsoft 365) và kết nối mạng khi mở Word.",
                    Title, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK)
                return 2;
            if (!WordClosed("cài đặt")) return 2;

            string dir = InstallDir;
            Directory.CreateDirectory(dir);
            StopHelper();

            // the add-in, registered with Word
            string manifestPath = Path.Combine(dir, "manifest.xml");
            File.WriteAllText(manifestPath, manifest, new System.Text.UTF8Encoding(false));
            using (var k = Registry.CurrentUser.CreateSubKey(WefKey)) k.SetValue(id, manifestPath);

            // the math fonts, for this user
            string fontDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Windows\Fonts");
            Directory.CreateDirectory(fontDir);
            for (int i = 0; i < Fonts.GetLength(0); i++)
            {
                string file = Path.Combine(fontDir, Fonts[i, 0]);
                try
                {
                    WriteResource(Fonts[i, 0], file);
                    using (var k = Registry.CurrentUser.CreateSubKey(FontsKey)) k.SetValue(Fonts[i, 1], file);
                    Native.AddFontResource(file);
                }
                catch (IOException) { /* in use by an open program: already installed */ }
            }
            Native.BroadcastFontChange();

            // the double-click helper, started at sign-in
            string helper = Path.Combine(dir, HelperName + ".exe");
            WriteResource(HelperName + ".exe", helper);
            WriteResource("mathstudio.ico", Path.Combine(dir, "mathstudio.ico"));
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey)) k.SetValue(HelperName, "\"" + helper + "\" --quiet");
            Process.Start(new ProcessStartInfo(helper, "--quiet") { UseShellExecute = false, WorkingDirectory = dir });

            // this setup stays, to remove MathStudio from Settings > Apps
            string self = Assembly.GetExecutingAssembly().Location;
            string kept = Path.Combine(dir, "MathStudioSetup.exe");
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(kept), StringComparison.OrdinalIgnoreCase)) File.Copy(self, kept, true);
            using (var k = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                k.SetValue("DisplayName", "MathStudio cho Word");
                k.SetValue("DisplayVersion", version);
                k.SetValue("Publisher", "MathStudio");
                k.SetValue("DisplayIcon", Path.Combine(dir, "mathstudio.ico"));
                k.SetValue("InstallLocation", dir);
                k.SetValue("UninstallString", "\"" + kept + "\" /uninstall");
                k.SetValue("QuietUninstallString", "\"" + kept + "\" /uninstall /quiet");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                k.SetValue("EstimatedSize", 2600, RegistryValueKind.DWord);
            }

            Show("Đã cài xong MathStudio.\n\n" +
                 "Mở Word: tab MathStudio nằm trên thanh công cụ (nếu chưa thấy, vào Chèn → Bổ trợ của tôi → Bổ trợ dành cho nhà phát triển → MathStudio).\n\n" +
                 "Gỡ cài đặt: Cài đặt Windows → Ứng dụng → MathStudio cho Word.", MessageBoxIcon.Information);
            return 0;
        }

        /* ------------------------------------------------------------------ uninstall */

        private static int Uninstall()
        {
            if (!_quiet && MessageBox.Show("Gỡ MathStudio khỏi Word?\n\nCông thức và hình đã chèn trong tài liệu vẫn giữ nguyên.",
                    Title, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK)
                return 2;
            if (!WordClosed("gỡ cài đặt")) return 2;

            StopHelper();
            string dir = InstallDir;
            using (var k = Registry.CurrentUser.OpenSubKey(RunKey, true)) if (k != null) k.DeleteValue(HelperName, false);
            using (var k = Registry.CurrentUser.OpenSubKey(WefKey, true))
            {
                // every registration of a MathStudio manifest installed here
                if (k != null)
                    foreach (var name in k.GetValueNames())
                    {
                        var v = k.GetValue(name) as string;
                        if (v != null && v.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) k.DeleteValue(name, false);
                    }
            }
            // the fonts stay registered only if they are not ours
            string fontDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Windows\Fonts");
            for (int i = 0; i < Fonts.GetLength(0); i++)
            {
                string file = Path.Combine(fontDir, Fonts[i, 0]);
                using (var k = Registry.CurrentUser.OpenSubKey(FontsKey, true)) if (k != null) k.DeleteValue(Fonts[i, 1], false);
                Native.RemoveFontResource(file);
                try { File.Delete(file); } catch { /* in use: removed at next sign-in by Windows if left */ }
            }
            Native.BroadcastFontChange();
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

            // the folder (with this program in it) goes once this program has exited
            Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + dir + "\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WorkingDirectory = Path.GetTempPath(),
            });
            Show("Đã gỡ MathStudio.", MessageBoxIcon.Information);
            return 0;
        }

        /* ------------------------------------------------------------------ helpers */

        /** Word must be closed so it picks the add-in up; asks the user to close it. */
        private static bool WordClosed(string what)
        {
            for (;;)
            {
                if (Process.GetProcessesByName("WINWORD").Length == 0) return true;
                if (_quiet) return true; // registered anyway: Word sees it next time it starts
                var r = MessageBox.Show("Word đang mở. Hãy lưu tài liệu và đóng Word rồi bấm Thử lại để " + what + ".",
                    Title, MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning);
                if (r != DialogResult.Retry) return false;
            }
        }

        private static void StopHelper()
        {
            foreach (var p in Process.GetProcessesByName(HelperName))
            {
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
            Thread.Sleep(200);
        }

        private static Stream Open(string name)
        {
            var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
            if (s == null) throw new FileNotFoundException("missing in setup: " + name);
            return s;
        }

        private static string Resource(string name)
        {
            using (var r = new StreamReader(Open(name))) return r.ReadToEnd();
        }

        private static void WriteResource(string name, string path)
        {
            using (var s = Open(name))
            using (var f = File.Create(path)) s.CopyTo(f);
        }

        private static void Show(string message, MessageBoxIcon icon)
        {
            if (!_quiet) MessageBox.Show(message, Title, MessageBoxButtons.OK, icon);
        }
    }

    internal static class Native
    {
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResource(string file);
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool RemoveFontResource(string file);
        [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);

        /** Tells running programs the list of fonts changed. */
        public static void BroadcastFontChange()
        {
            IntPtr r;
            SendMessageTimeout((IntPtr)0xffff, 0x001D /* WM_FONTCHANGE */, IntPtr.Zero, IntPtr.Zero, 2 /* SMTO_ABORTIFHUNG */, 1000, out r);
        }
    }
}
