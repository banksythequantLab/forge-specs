# Records takes until one is clean. Waits until the user has been idle IdleToActivate seconds, brings Lens Studio
# to the front (SetForegroundWindow only - no mouse, no clicks), waits for 8 s of quiet twice, runs take.ps1.
# A take is "clean" when Lens Studio was still in front at the end and nobody touched mouse/keyboard during it.
# Usage: auto-take.ps1 -First 6 -MaxTakes 4 -WaitMinutes 720 -IdleToActivate 120   (status: auto.status.txt)
param([string]$Base = "take", [int]$First = 6, [int]$MaxTakes = 4, [int]$WaitMinutes = 720, [int]$IdleToActivate = 120)
$T = "D:\Specs\_transfer"
$status = "$T\auto.status.txt"
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
function Status($s) { "{0:HH:mm:ss} {1}" -f (Get-Date), $s | Add-Content $status }
Set-Content $status ("{0:HH:mm:ss} armed: takes {1}{2}.. idleToActivate={3}s" -f (Get-Date), $Base, $First, $IdleToActivate)
$deadline = (Get-Date).AddMinutes($WaitMinutes)
for ($n = $First; $n -lt $First + $MaxTakes; $n++) {
  $Name = "$Base$n"; $streak = 0; $activated = $false; $ok = $false
  while ((Get-Date) -lt $deadline) {
    $front = LsInFront; $idle = IdleSeconds
    $lines = Get-Content $status | Select-Object -Last 12
    Set-Content $status $lines; Status ("waiting {0}: lsInFront={1} idle={2:N0}s activated={3}" -f $Name, $front, $idle, $activated)
    if (-not $front -and $idle -ge $IdleToActivate) { BringLsFront; $activated = $true; Start-Sleep -Seconds 3; continue }
    if ($front -and $idle -ge 8) { $streak++ } else { $streak = 0 }
    if ($streak -ge 2) { $ok = $true; break }
    Start-Sleep -Seconds 4
  }
  if (-not $ok) { Status "gave up waiting"; exit 1 }
  # The display must be on (AC timeout 5 min): Desktop Duplication records nothing once it is off (take7 was black).
  $d = & powershell -NoProfile -ExecutionPolicy Bypass -File "$T\display-on.ps1" 2>&1 | Select-Object -Last 1
  Status ("display check: " + $d)
  if ($LASTEXITCODE -ne 0) { Status "display off - waiting for it to come back"; Start-Sleep -Seconds 30; $n--; continue }
  Status "RECORDING $Name"
  $t0 = Get-Date
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$T\take.ps1" -Name $Name *> "$T\$Name.console.txt"
  $elapsed = ((Get-Date) - $t0).TotalSeconds; $idleAfter = IdleSeconds; $frontAfter = LsInFront
  if ($frontAfter -and ($idleAfter -ge ($elapsed - 2))) { Status ("DONE {0} clean (untouched {1:N0}s, lsInFront)" -f $Name, $idleAfter); exit 0 }
  Status ("DIRTY {0} (idle={1:N0}s of {2:N0}s, lsInFront={3}) - rearming" -f $Name, $idleAfter, $elapsed, $frontAfter)
  Start-Sleep -Seconds 20
}
Status "gave up: all takes dirty"; exit 2
