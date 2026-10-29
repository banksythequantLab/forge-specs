# Runs the LEAF demo_run scenario via the Lens Studio MCP (in-process, no nested shells).
$T = "D:\Specs\_transfer"
. "$T\mcp-lib.ps1"
$json = '{"scenarioId":"demo_run","onDevice":false}'
try { $res = Invoke-LsMcp -Tool run_leaf_scenario -ArgsJson $json -TimeoutSec 180 } catch { $res = "EXC: " + $_.Exception.Message }
$res | Set-Content "$T\run-demo.out"
