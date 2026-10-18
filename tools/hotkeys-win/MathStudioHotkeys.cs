// MathStudio keyboard shortcuts for Word on Windows (tray helper).
//
// Office 2019 does not let add-ins register keyboard shortcuts, so this small helper
// gives Word the MathType shortcuts. It only reacts while Word is the foreground window
// and then clicks the matching MathStudio ribbon button through UI Automation:
//
//   Ctrl+Alt+Q        Inline equation
//   Alt+Q             Display equation
//   Alt+Shift+Q       Right-numbered equation
//   Ctrl+Alt+Shift+Q  Left-numbered equation
//   Ctrl+Alt+E        Edit equation
//   Double-click      Edit the MathStudio equation under the cursor (picture or Word equation)
//
// Build: powershell -File tools/hotkeys-win/build.ps1
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("MathStudio Hotkeys")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

namespace MathStudio
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            bool created;
            using (var mutex = new Mutex(true, "MathStudio.Hotkeys.SingleInstance", out created))
            {
                if (!created) return; // already running
                Application.EnableVisualStyles();
                Application.Run(new TrayContext(args.Length > 0 && args[0] == "--quiet"));
            }
        }
    }

    internal sealed class Shortcut
    {
        public bool Ctrl, Alt, Shift;
        public int Vk;
        /** Ribbon button names to look for, Vietnamese then English. */
        public string[] Buttons;
        public string Description;
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private static readonly Shortcut[] Shortcuts =
        {
            new Shortcut { Ctrl = true, Alt = true, Vk = 0x51, Buttons = new[] { "Trong dòng", "Công thức trong dòng", "Inline", "Inline Equation" }, Description = "Ctrl+Alt+Q  Công thức trong dòng" },
            new Shortcut { Alt = true, Vk = 0x51, Buttons = new[] { "Riêng dòng", "Công thức riêng dòng", "Display", "Display Equation" }, Description = "Alt+Q  Công thức riêng dòng" },
            new Shortcut { Alt = true, Shift = true, Vk = 0x51, Buttons = new[] { "Đánh số phải", "Right Numbered" }, Description = "Alt+Shift+Q  Đánh số phải" },
            new Shortcut { Ctrl = true, Alt = true, Shift = true, Vk = 0x51, Buttons = new[] { "Đánh số trái", "Left Numbered" }, Description = "Ctrl+Alt+Shift+Q  Đánh số trái" },
            new Shortcut { Ctrl = true, Alt = true, Vk = 0x45, Buttons = new[] { "Sửa công thức", "Edit Equation" }, Description = "Ctrl+Alt+E  Sửa công thức" },
        };
        private static readonly string[] TabNames = { "MathStudio" };

        private readonly NotifyIcon _tray;
        private static readonly string[] EditButtons = { "Sửa công thức", "Edit Equation" };

        private readonly Native.LowLevelKeyboardProc _proc; // keep references so the GC does not collect them
        private readonly Native.LowLevelKeyboardProc _mouseProc;
        private IntPtr _hook = IntPtr.Zero;
        private IntPtr _mouseHook = IntPtr.Zero;
        private uint _lastClickTime;
        private Point _lastClickPos;
        private bool _enabled = true;
        private int _busy; // 1 while a ribbon click is in progress

        public TrayContext(bool quiet)
        {
            _proc = HookCallback;
            _mouseProc = MouseCallback;
            var menu = new ContextMenuStrip();
            var toggle = new ToolStripMenuItem("Bật phím tắt MathStudio") { Checked = true, CheckOnClick = true };
            toggle.CheckedChanged += (s, e) => _enabled = toggle.Checked;
            menu.Items.Add(toggle);
            menu.Items.Add(new ToolStripSeparator());
            foreach (var sc in Shortcuts) menu.Items.Add(new ToolStripMenuItem(sc.Description) { Enabled = false });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Thoát", null, (s, e) => ExitThread());

            _tray = new NotifyIcon
            {
                Icon = LoadIcon(),
                Text = "MathStudio – phím tắt cho Word",
                ContextMenuStrip = menu,
                Visible = true,
            };
            _hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, _proc, Native.GetModuleHandle(null), 0);
            _mouseHook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, _mouseProc, Native.GetModuleHandle(null), 0);
            if (!quiet)
                _tray.ShowBalloonTip(3000, "MathStudio", "Phím tắt đã bật: Ctrl+Alt+Q (trong dòng), Alt+Q (riêng dòng).", ToolTipIcon.Info);
        }

        private static Icon LoadIcon()
        {
            try
            {
                var path = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mathstudio.ico");
                if (System.IO.File.Exists(path)) return new Icon(path);
            }
            catch { }
            return SystemIcons.Application;
        }

        protected override void ExitThreadCore()
        {
            if (_hook != IntPtr.Zero) Native.UnhookWindowsHookEx(_hook);
            if (_mouseHook != IntPtr.Zero) Native.UnhookWindowsHookEx(_mouseHook);
            _tray.Visible = false;
            _tray.Dispose();
            base.ExitThreadCore();
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && _enabled && (wParam == (IntPtr)Native.WM_KEYDOWN || wParam == (IntPtr)Native.WM_SYSKEYDOWN))
            {
                var info = (Native.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
                {
                    bool ctrl = Native.IsDown(Native.VK_CONTROL), alt = Native.IsDown(Native.VK_MENU), shift = Native.IsDown(Native.VK_SHIFT);
                    foreach (var sc in Shortcuts)
                    {
                        if (sc.Vk != (int)info.vkCode || sc.Ctrl != ctrl || sc.Alt != alt || sc.Shift != shift) continue;
                        IntPtr wordWindow = Native.ForegroundWordWindow();
                        if (wordWindow == IntPtr.Zero) break; // not in Word: let the key through
                        if (alt) Native.CancelAltMenu(); // otherwise releasing Alt would show Word's KeyTips
                        if (Interlocked.CompareExchange(ref _busy, 1, 0) == 0)
                        {
                            var target = sc;
                            new Thread(() => Click(wordWindow, target)) { IsBackground = true }.Start();
                        }
                        return (IntPtr)1; // swallow the key
                    }
                }
            }
            return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
        }

        /** Detects a double-click in Word (low-level hooks only see single button-downs). */
        private IntPtr MouseCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && _enabled && wParam == (IntPtr)Native.WM_LBUTTONDOWN)
            {
                var info = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                var pos = new Point(info.x, info.y);
                uint elapsed = unchecked(info.time - _lastClickTime);
                bool isDouble = elapsed <= Native.GetDoubleClickTime()
                    && Math.Abs(pos.X - _lastClickPos.X) <= SystemInformation.DoubleClickSize.Width
                    && Math.Abs(pos.Y - _lastClickPos.Y) <= SystemInformation.DoubleClickSize.Height;
                _lastClickTime = isDouble ? 0 : info.time;
                _lastClickPos = pos;
                if (isDouble)
                {
                    IntPtr wordWindow = Native.ForegroundWordWindow();
                    if (wordWindow != IntPtr.Zero && Interlocked.CompareExchange(ref _busy, 1, 0) == 0)
                        new Thread(() => EditIfEquation(wordWindow)) { IsBackground = true }.Start();
                }
            }
            return Native.CallNextHookEx(_mouseHook, nCode, wParam, lParam);
        }

        /** After a double-click, asks Word whether the selection is a MathStudio equation and, if so, edits it. */
        private void EditIfEquation(IntPtr wordWindow)
        {
            try
            {
                Thread.Sleep(200); // let Word finish selecting
                if (!WordSelectionIsEquation()) return;
                Click(wordWindow, new Shortcut { Buttons = EditButtons }, releaseBusy: false);
            }
            catch { }
            finally
            {
                Interlocked.Exchange(ref _busy, 0);
            }
        }

        /** True when Word's selection is inside a content control tagged by MathStudio. */
        private static bool WordSelectionIsEquation()
        {
            object word = null;
            try
            {
                word = Marshal.GetActiveObject("Word.Application");
                object selection = Get(word, "Selection");
                object range = Get(selection, "Range");
                object cc = Get(range, "ParentContentControl");
                if (cc == null)
                {
                    // An inline picture selected on its own: look at the content controls it sits in.
                    object ccs = Get(range, "ContentControls");
                    if (ccs != null && Convert.ToInt32(Get(ccs, "Count")) > 0)
                        cc = ccs.GetType().InvokeMember("Item", System.Reflection.BindingFlags.InvokeMethod, null, ccs, new object[] { 1 });
                }
                string tag = cc == null ? null : Get(cc, "Tag") as string;
                // "mt2|…" = equation, "mt2g|…" = geometry figure; the Edit button handles both.
                if (tag != null && tag.StartsWith("mt2", StringComparison.Ordinal)) return true;
                // A MathStudio picture dragged elsewhere leaves its content control behind:
                // it is still recognised by its name ("MathStudio Figure n" / "MathStudio Equation n").
                object shapes = Get(range, "InlineShapes");
                if (shapes == null || Convert.ToInt32(Get(shapes, "Count")) == 0) return false;
                string xml = Get(range, "WordOpenXML") as string;
                return xml != null && (xml.Contains("name=\"MathStudio Figure") || xml.Contains("name=\"MathStudio Equation"));
            }
            catch { return false; }
            finally
            {
                if (word != null) Marshal.ReleaseComObject(word);
            }
        }

        private static object Get(object target, string property)
        {
            return target == null ? null
                : target.GetType().InvokeMember(property, System.Reflection.BindingFlags.GetProperty, null, target, null);
        }

        /** Selects the MathStudio ribbon tab, invokes the button, then restores the previous tab. */
        private void Click(IntPtr wordWindow, Shortcut sc, bool releaseBusy = true)
        {
            try
            {
                var root = AutomationElement.FromHandle(wordWindow);
                AutomationElement button = FindButton(root, sc.Buttons);
                AutomationElement previousTab = null;
                if (button == null)
                {
                    var tab = FindByNames(root, TabNames, ControlType.TabItem);
                    if (tab == null) { Notify("Chưa thấy tab MathStudio trong Word. Hãy kiểm tra add-in đã được nạp."); return; }
                    previousTab = SelectedTab(root);
                    Select(tab);
                    for (int i = 0; i < 20 && button == null; i++)
                    {
                        Thread.Sleep(50);
                        button = FindButton(root, sc.Buttons);
                    }
                }
                if (button == null) { Notify("Không tìm thấy nút \"" + sc.Buttons[0] + "\" trên tab MathStudio."); return; }
                ((InvokePattern)button.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                if (previousTab != null) Select(previousTab);
            }
            catch (Exception ex)
            {
                Notify("Không thực hiện được phím tắt: " + ex.Message);
            }
            finally
            {
                if (releaseBusy) Interlocked.Exchange(ref _busy, 0);
            }
        }

        private static AutomationElement FindButton(AutomationElement root, string[] names)
        {
            return FindByNames(root, names, ControlType.Button);
        }

        private static AutomationElement FindByNames(AutomationElement root, string[] names, ControlType type)
        {
            var conds = new List<Condition>();
            foreach (var n in names) conds.Add(new PropertyCondition(AutomationElement.NameProperty, n));
            var nameCond = conds.Count == 1 ? conds[0] : new OrCondition(conds.ToArray());
            var cond = new AndCondition(nameCond, new PropertyCondition(AutomationElement.ControlTypeProperty, type));
            return root.FindFirst(TreeScope.Descendants, cond);
        }

        private static AutomationElement SelectedTab(AutomationElement root)
        {
            var tabs = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
            foreach (AutomationElement t in tabs)
            {
                object p;
                if (t.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p) && ((SelectionItemPattern)p).Current.IsSelected) return t;
            }
            return null;
        }

        private static void Select(AutomationElement tab)
        {
            object p;
            if (tab.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) ((SelectionItemPattern)p).Select();
            else if (tab.TryGetCurrentPattern(InvokePattern.Pattern, out p)) ((InvokePattern)p).Invoke();
        }

        private void Notify(string message)
        {
            try { _tray.ShowBalloonTip(4000, "MathStudio", message, ToolTipIcon.Warning); } catch { }
        }
    }

    internal static class Native
    {
        public const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14;
        public const int WM_KEYDOWN = 0x0100, WM_SYSKEYDOWN = 0x0104, WM_LBUTTONDOWN = 0x0201;
        public const int VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12;

        public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)]
        public struct MSLLHOOKSTRUCT { public int x, y; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }

        [DllImport("user32.dll")] public static extern uint GetDoubleClickTime();
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc fn, IntPtr hMod, uint threadId);
        [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hhk);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll")] public static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

        public static bool IsDown(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

        /** The top-level Word window if Word is in the foreground, else IntPtr.Zero. */
        public static IntPtr ForegroundWordWindow()
        {
            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero) return IntPtr.Zero;
            IntPtr top = GetAncestor(fg, 2 /* GA_ROOT */);
            uint pid;
            GetWindowThreadProcessId(top, out pid);
            try
            {
                using (var p = Process.GetProcessById((int)pid))
                    return string.Equals(p.ProcessName, "WINWORD", StringComparison.OrdinalIgnoreCase) ? top : IntPtr.Zero;
            }
            catch { return IntPtr.Zero; }
        }

        /** Taps an unassigned virtual key so that releasing Alt does not activate the ribbon KeyTips. */
        public static void CancelAltMenu()
        {
            keybd_event(0xFF, 0, 0, UIntPtr.Zero);
            keybd_event(0xFF, 0, 2 /* KEYEVENTF_KEYUP */, UIntPtr.Zero);
        }
    }
}
