// Extract the latest base64 image returned by a tool_result in a Claude Code stream-json log.
// Usage: node lastshot.js <log.jsonl> <out.png>
const fs = require("fs");
const [file, out] = process.argv.slice(2);
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
let found = null, idx = -1;
for (let i = lines.length - 1; i >= 0 && !found; i--) {
  let j; try { j = JSON.parse(lines[i]); } catch { continue; }
  if (j.type !== "user") continue;
  for (const c of (j.message && j.message.content) || []) {
    if (c.type !== "tool_result" || !Array.isArray(c.content)) continue;
    for (const part of c.content) {
      if (part.type === "image" && part.source && part.source.data) { found = part.source; idx = i; }
    }
  }
}
if (!found) { console.log("no image found"); process.exit(1); }
fs.writeFileSync(out, Buffer.from(found.data, "base64"));
console.log(`line ${idx}: ${found.media_type} ${Math.round(found.data.length * 0.75 / 1024)} KB -> ${out}`);
