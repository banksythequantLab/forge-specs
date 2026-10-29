# Lists the Lens Studio MCP tool names (tools/list). Usage: .\mcp-tools.ps1 [filter]
param([string]$Filter = "")
$cfg = Get-Content D:\Specs\forge\.mcp.json -Raw | ConvertFrom-Json
$url = $cfg.mcpServers.'lens-studio'.url
$auth = $cfg.mcpServers.'lens-studio'.headers.Authorization
$h = @{ Authorization = $auth; Accept = "application/json, text/event-stream"; "Content-Type" = "application/json" }
$init = @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2025-03-26"; capabilities = @{}; clientInfo = @{ name = "tool-list"; version = "0.1" } } } | ConvertTo-Json -Depth 6 -Compress
$r = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $init -UseBasicParsing
$sid = $r.Headers["Mcp-Session-Id"]
if ($sid) { $h["Mcp-Session-Id"] = "$sid" }
$notif = @{ jsonrpc = "2.0"; method = "notifications/initialized" } | ConvertTo-Json -Compress
try { Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $notif -UseBasicParsing | Out-Null } catch {}
$call = @{ jsonrpc = "2.0"; id = 2; method = "tools/list"; params = @{} } | ConvertTo-Json -Compress
$r2 = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $call -UseBasicParsing
$body = $r2.Content
$json = if ($body -match '(?m)^data:') { ($body -split "`n" | Where-Object { $_ -like 'data:*' } | ForEach-Object { $_.Substring(5).Trim() }) -join "" } else { $body }
$obj = $json | ConvertFrom-Json
$obj.result.tools | Where-Object { $_.name -like "*$Filter*" } | ForEach-Object { $_.name + "  -  " + ($_.description -replace "`n", " ").Substring(0, [Math]::Min(90, ($_.description -replace "`n", " ").Length)) }
