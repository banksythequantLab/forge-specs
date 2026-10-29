# One recorded take of the Forge demo in the Lens Studio preview.
# Usage: .\take.ps1 -Name take3   (Lens Studio must be in front, nobody touching Vesper)
# Rect = the preview viewport on screen (measured from a screenshot with the LS window at 0,0).
param([string]$Name = "take3", [int]$OpeningSeconds = 6, [int]$MaxSeconds = 110, [int]$X = 186, [int]$Y = 190, [int]$W = 1096, [int]$H = 694)
$ErrorActionPreference = "Continue"
$T = "D:\Specs\_transfer"
. "$T\mcp-lib.ps1"
$out = "$T\$Name.mp4"
$log = @()
function Log($m) { $script:log += ("{0:HH:mm:ss.f} {1}" -f (Get-Date), $m); Write-Host $m }
function MCP($tool, $json) { try { return (Invoke-LsMcp -Tool $tool -ArgsJson $json) } catch { return "EXC: " + $_.Exception.Message } }
$seated = '{"commands":[{"action":"setPosition","x":0,"y":-35,"z":20},{"action":"lookAt","x":0,"y":-75,"z":-40}]}'
$leanIn = '{"commands":[{"action":"setPosition","x":0,"y":-45,"z":5},{"action":"lookAt","x":0,"y":-75,"z":-40}]}'

# 1. reset the lens to the chips state, seated pose
Log ("refresh: " + (MCP PreviewPanelTool '{"action":"refresh","waitForReady":true}'))
Log ("seated: " + (MCP MovePreviewCamera $seated))
Start-Sleep -Seconds 2

# 2. start the recorder (interactive session via WMI so Desktop Duplication works)
Remove-Item $out, "$out.log", "$out.stop", "$T\run-demo.out" -ErrorAction SilentlyContinue
# Start-Process with a hidden window: a cmd.exe console launched via WMI pops up IN FRONT of Lens Studio and gets recorded instead.
$rp = Start-Process -FilePath python -ArgumentList "$T\rec.py $MaxSeconds $out $X $Y $W $H 30" -WindowStyle Hidden -RedirectStandardOutput "$T\$Name.rec.out" -RedirectStandardError "$T\$Name.rec.err" -PassThru
Log "recorder pid $($rp.Id) rect $X,$Y ${W}x$H"
Start-Sleep -Seconds 2

# 3. the take: opening frame, lean in, demo_run (pinches + waits are inside the scenario)
Start-Sleep -Seconds $OpeningSeconds
Log ("lean-in: " + (MCP MovePreviewCamera $leanIn))
Start-Sleep -Milliseconds 800
Log "demo_run start"
$p = Start-Process -FilePath powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File $T\run-demo.ps1" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 52   # demo_run runs ~41 s inside the preview; the MCP call may time out before that, the scenario keeps going
Log ("demo_run call: " + ((Get-Content "$T\run-demo.out" -ErrorAction SilentlyContinue) -join " ").Trim())
Start-Sleep -Seconds 3

# 4. stop
New-Item -ItemType File -Path "$out.stop" | Out-Null
Start-Sleep -Seconds 4
Log ("recorder log: " + (Get-Content "$out.log" -ErrorAction SilentlyContinue))
Log ("ffprobe: " + (& ffprobe -v error -show_entries stream=width,height,nb_frames,duration -of csv=p=0 $out))
$log | Set-Content "$T\$Name.take.log"
