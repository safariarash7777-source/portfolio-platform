# coninject.ps1 -Pid <pid> -TextFile <path>
# Types the text in TextFile (plus Enter) into the console that process <pid>
# is attached to, by writing key events into that console's input buffer.
# No window focus involved, so keystrokes cannot land in another application.
# Test harness only (synthetic data). The text file is deleted after reading.
param([int]$TargetPid, [string]$TextFile)
$text = [System.IO.File]::ReadAllText($TextFile).TrimEnd("`r", "`n")
Remove-Item -LiteralPath $TextFile -Force
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ConInject {
  [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
  public struct KEY_EVENT_RECORD {
    [FieldOffset(0)] public int bKeyDown;
    [FieldOffset(4)] public ushort wRepeatCount;
    [FieldOffset(6)] public ushort wVirtualKeyCode;
    [FieldOffset(8)] public ushort wVirtualScanCode;
    [FieldOffset(10)] public char UnicodeChar;
    [FieldOffset(12)] public uint dwControlKeyState;
  }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUT_RECORD {
    [FieldOffset(0)] public ushort EventType;
    [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
  }
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool WriteConsoleInputW(IntPtr h, INPUT_RECORD[] buf, uint len, out uint written);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  static INPUT_RECORD Rec(char c, ushort vk, bool down) {
    var r = new INPUT_RECORD(); r.EventType = 1;
    r.KeyEvent.bKeyDown = down ? 1 : 0; r.KeyEvent.wRepeatCount = 1;
    r.KeyEvent.wVirtualKeyCode = vk; r.KeyEvent.UnicodeChar = c; return r;
  }
  public static string Send(uint pid, string text) {
    FreeConsole();
    if (!AttachConsole(pid)) return "attach failed " + Marshal.GetLastWin32Error();
    IntPtr h = CreateFileW("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == new IntPtr(-1)) return "conin failed " + Marshal.GetLastWin32Error();
    var recs = new System.Collections.Generic.List<INPUT_RECORD>();
    foreach (char c in text) { recs.Add(Rec(c, 0, true)); recs.Add(Rec(c, 0, false)); }
    recs.Add(Rec('\r', 0x0D, true)); recs.Add(Rec('\r', 0x0D, false));
    uint w; bool ok = WriteConsoleInputW(h, recs.ToArray(), (uint)recs.Count, out w);
    CloseHandle(h); FreeConsole();
    return ok ? ("ok " + w + " events") : ("write failed " + Marshal.GetLastWin32Error());
  }
}
'@
$result = [ConInject]::Send([uint32]$TargetPid, $text)
[System.IO.File]::WriteAllText("$TextFile.result", $result)
