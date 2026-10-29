# Calls one Lens Studio MCP tool and prints the text result. Usage: .\mcp-call.ps1 -Tool MovePreviewCamera -Args '{"commands":[...]}'
param([Parameter(Mandatory=$true)][string]$Tool, [string]$Args = "{}", [int]$TimeoutSec = 120)
$cfg = Get-Content D:\Specs\forge\.mcp.json -Raw | ConvertFrom-Json
$url = $cfg.mcpServers.'lens-studio'.url
$auth = $cfg.mcpServers.'lens-studio'.headers.Authorization
$h = @{ Authorization = $auth; Accept = "application/json, text/event-stream"; "Content-Type" = "application/json" }
$init = @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2025-03-26"; capabilities = @{}; clientInfo = @{ name = "forge-take"; version = "0.1" } } } | ConvertTo-Json -Depth 6 -Compress
$r = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $init -UseBasicParsing -TimeoutSec 30
$sid = $r.Headers["Mcp-Session-Id"]
if ($sid) { $h["Mcp-Session-Id"] = "$sid" }
$notif = @{ jsonrpc = "2.0"; method = "notifications/initialized" } | ConvertTo-Json -Compress
try { Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $notif -UseBasicParsing -TimeoutSec 30 | Out-Null } catch {}
$argObj = $Args | ConvertFrom-Json
$call = @{ jsonrpc = "2.0"; id = 2; method = "tools/call"; params = @{ name = $Tool; arguments = $argObj } } | ConvertTo-Json -Depth 12 -Compress
$r2 = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $call -UseBasicParsing -TimeoutSec $TimeoutSec
$body = $r2.Content
$json = if ($body -match '(?m)^data:') { ($body -split "`n" | Where-Object { $_ -like 'data:*' } | ForEach-Object { $_.Substring(5).Trim() }) -join "" } else { $body }
$obj = $json | ConvertFrom-Json
if ($obj.error) { "ERROR: " + ($obj.error | ConvertTo-Json -Compress); exit 1 }
foreach ($c in $obj.result.content) { if ($c.type -eq "text") { $c.text } else { "[" + $c.type + "]" } }
if ($obj.result.isError) { exit 1 }
