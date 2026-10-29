// Extract every image returned by a tool_result in a Claude Code stream-json log.
// Usage: node allshots.js <log.jsonl> <outDir> [fromLine]
const fs = require("fs");
const path = require("path");
const [file, outDir, fromArg] = process.argv.slice(2);
const from = parseInt(fromArg || "0", 10);
fs.mkdirSync(outDir, { recursive: true });
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
let n = 0;
for (let i = from; i < lines.length; i++) {
  let j; try { j = JSON.parse(lines[i]); } catch { continue; }
  if (j.type !== "user") continue;
  for (const c of (j.message && j.message.content) || []) {
    if (c.type !== "tool_result" || !Array.isArray(c.content)) continue;
    for (const part of c.content) {
      if (part.type === "image" && part.source && part.source.data) {
        const ext = (part.source.media_type || "image/png").split("/")[1].replace("jpeg", "jpg");
        const out = path.join(outDir, `line${String(i).padStart(5, "0")}.${ext}`);
        fs.writeFileSync(out, Buffer.from(part.source.data, "base64"));
        n++;
        console.log(`${out}  ${Math.round(part.source.data.length * 0.75 / 1024)} KB`);
      }
    }
  }
}
console.log(`${n} images`);
