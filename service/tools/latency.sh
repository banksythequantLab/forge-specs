#!/usr/bin/env bash
# Forge latency check (run on the box): /health, /warm, then the three demo-chip prompts.
# Usage: tools/latency.sh [base_url]   e.g. tools/latency.sh https://forge.banksyai.com
BASE=${1:-http://127.0.0.1:8400}
echo "== $BASE"
curl -s -m 5 "$BASE/health"; echo
curl -s -m 5 "$BASE/warm"; echo
sleep "${WARM_WAIT:-0}"
for p in "Headphone hook for my 30 mm desk edge" "Cable clip for a 6 mm USB-C cable" "Keychain tag that says SPECS"; do
  t0=$(date +%s.%N)
  out=$(curl -s -m 40 -H 'content-type: application/json' -d "{\"prompt\":\"$p\"}" "$BASE/design")
  t1=$(date +%s.%N)
  python3 - "$out" "$t0" "$t1" <<'EOF'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("bad response:", sys.argv[1][:200]); sys.exit(0)
dt = float(sys.argv[3]) - float(sys.argv[2])
p = d.get("part", {})
print(f"{dt:5.1f}s total | llm {d.get('llm_seconds')} render {d.get('render_seconds')} | {p.get('source',''):>16} | {p.get('name')!r} {d.get('dims_mm')}")
EOF
done
