# Waits until Lens Studio is the foreground window and the user is idle, then runs take.ps1.
# If the user has been idle for IdleToActivate seconds and Lens Studio is not in front, brings it to front first.
param([string]$Name = "take2", [int]$WaitMinutes = 30, [int]$IdleToActivate = 90)
$T = "D:\Specs\_transfer"
$status = "$T\$Name.status.txt"
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FG { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
 [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e); }
"@
function LsInFront { $h = [FG]::GetForegroundWindow(); $p = 0; [FG]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null; $pr = Get-Process -Id $p -ErrorAction SilentlyContinue; return ($pr -and $pr.ProcessName -eq "Lens Studio") }
function IdleSeconds { $li = New-Object FG+LASTINPUTINFO; $li.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($li); [FG]::GetLastInputInfo([ref]$li) | Out-Null; return ([Environment]::TickCount - $li.dwTime) / 1000.0 }
function BringLsFront { $ls = Get-Process "Lens Studio" | Select-Object -First 1; if (-not $ls) { return }; $h = $ls.MainWindowHandle; if ([FG]::IsIconic($h)) { [FG]::ShowWindow($h, 9) | Out-Null }; [FG]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [FG]::SetForegroundWindow($h) | Out-Null; [FG]::keybd_event(0x12,0,2,[UIntPtr]::Zero); try { (New-Object -ComObject WScript.Shell).AppActivate($ls.Id) | Out-Null } catch {} }
$deadline = (Get-Date).AddMinutes($WaitMinutes)
$streak = 0; $activated = $false
while ((Get-Date) -lt $deadline) {
  $front = LsInFront; $idle = IdleSeconds
  "{0:HH:mm:ss} waiting: lsInFront={1} idle={2:N0}s activated={3}" -f (Get-Date), $front, $idle, $activated | Set-Content $status
  if (-not $front -and $idle -ge $IdleToActivate) { BringLsFront; $activated = $true; Start-Sleep -Seconds 3; continue }
  if ($front -and $idle -ge 8) { $streak++ } else { $streak = 0 }
  if ($streak -ge 2) { break }
  Start-Sleep -Seconds 4
}
if ($streak -lt 2) { "{0:HH:mm:ss} gave up waiting" -f (Get-Date) | Set-Content $status; exit 1 }
"{0:HH:mm:ss} RECORDING" -f (Get-Date) | Set-Content $status
& powershell -NoProfile -ExecutionPolicy Bypass -File "$T\take.ps1" -Name $Name *> "$T\$Name.console.txt"
"{0:HH:mm:ss} DONE" -f (Get-Date) | Add-Content $status
