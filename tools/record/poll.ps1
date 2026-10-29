# Blocks until a watcher status file leaves the 'waiting' state (or the timeout), then prints the status.
param([string]$Name = "take6", [int]$MaxSeconds = 280)
$f = "D:\Specs\_transfer\$Name.status.txt"
$deadline = (Get-Date).AddSeconds($MaxSeconds)
while ((Get-Date) -lt $deadline) {
  $s = Get-Content $f -Tail 1 -ErrorAction SilentlyContinue
  if ($s -and ($s -notmatch 'waiting')) { break }
  Start-Sleep -Seconds 10
}
Get-Content $f -Tail 2
"now {0:HH:mm:ss}" -f (Get-Date)
