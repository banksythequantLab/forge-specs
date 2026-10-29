# Contact sheet of a take: one frame every $Every seconds, stamped with its time, tiled.
# Usage: powershell -File sheet.ps1 -In take6.mp4 -Out take6.sheet.jpg [-Every 5] [-Tile 4x4] [-W 320] [-Start 0]
param([string]$In, [string]$Out, [int]$Every = 5, [string]$Tile = "4x4", [int]$W = 320, [double]$Start = 0)
$vf = "fps=1/$Every,scale=${W}:-1,drawtext=fontfile='C\:/Windows/Fonts/consola.ttf':text='%{pts\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.5,tile=$Tile"
& ffmpeg -hide_banner -loglevel error -y -ss $Start -i $In -vf $vf -frames:v 1 -q:v 3 $Out
if (Test-Path $Out) { "wrote $Out $((Get-Item $Out).Length) bytes" } else { "FAILED" }
