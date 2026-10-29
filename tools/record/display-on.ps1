# Makes sure the display is on for a recording (Desktop Duplication yields no frames while it is off).
# No input is synthesised: SetThreadExecutionState(ES_DISPLAY_REQUIRED) + SC_MONITORPOWER on, then a dxcam probe.
# Prints "display: fresh frames" or "display: NO frames".
Add-Type -Namespace W -Name M -MemberDefinition @"
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
"@
function Probe {
  $py = @'
import dxcam, time
c = dxcam.create(output_idx=0, output_color="BGR")
n = 0; t = time.time()
while time.time() - t < 3.0:
    if c.grab() is not None: n += 1
    time.sleep(0.02)
print(n)
'@
  $tmp = "$env:TEMP\dxprobe.py"; Set-Content $tmp $py
  $n = & python $tmp 2>$null
  return [int]("$n".Trim())
}
$n = Probe
if ($n -gt 0) { "display: fresh frames ($n in 3 s)"; exit 0 }
[W.M]::SetThreadExecutionState(0x00000002 -bor 0x00000001) | Out-Null   # ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED (one-shot reset)
[W.M]::SendMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr](-1)) | Out-Null   # WM_SYSCOMMAND SC_MONITORPOWER on
Start-Sleep -Seconds 5
$n = Probe
if ($n -gt 0) { "display: fresh frames after wake ($n in 3 s)"; exit 0 } else { "display: NO frames (display off or capture blocked)"; exit 1 }
