#!/usr/bin/env bash
# Generate the demo voice-over segments on the box with VoxClone (Derek's enrolled 'derek' preset).
# Usage: tools/vo-generate.sh tools/vo-segments.txt /opt/banksy/forge/outbox/vo [preset]
SEGS=${1:?segments file}; OUT=${2:?out dir}; VOICE=${3:-derek}
mkdir -p "$OUT"
while IFS='|' read -r id text; do
  [ -z "$id" ] && continue
  if [ -s "$OUT/$id.wav" ]; then echo "skip $id (exists)"; continue; fi
  t0=$(date +%s)
  code=$(curl -sS -m 900 -o "$OUT/$id.wav" -w '%{http_code}' -X POST http://127.0.0.1:8300/api/clone \
        -F "default_voice=$VOICE" -F "text=$text" -F "lang=en" -F "speed=1.0")
  if [ "$code" = "200" ] && head -c 4 "$OUT/$id.wav" | grep -q RIFF; then
    d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$id.wav")
    echo "OK $id ${d}s audio in $(( $(date +%s) - t0 ))s"
  else
    echo "FAIL $id http=$code"; head -c 300 "$OUT/$id.wav"; echo; rm -f "$OUT/$id.wav"
  fi
done < "$SEGS"
echo "done: $(ls "$OUT"/*.wav 2>/dev/null | wc -l) segments in $OUT"
