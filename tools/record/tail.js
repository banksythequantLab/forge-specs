// Summarize a Claude Code stream-json log: tool calls, text, errors. Usage: node tail.js <file> [fromLine]
const fs = require("fs");
const file = process.argv[2];
const from = parseInt(process.argv[3] || "0", 10);
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
let out = [];
for (let i = from; i < lines.length; i++) {
  let j;
  try { j = JSON.parse(lines[i]); } catch { continue; }
  const t = j.type;
  if (t === "system" && j.subtype === "init") out.push(`[${i}] INIT session=${j.session_id} model=${j.model} mcp=${JSON.stringify((j.mcp_servers||[]).map(s=>s.name+':'+s.status))} tools=${(j.tools||[]).length}`);
  else if (t === "assistant") {
    for (const c of (j.message && j.message.content) || []) {
      if (c.type === "text") out.push(`[${i}] TEXT ${c.text.replace(/\s+/g, " ").slice(0, 400)}`);
      else if (c.type === "tool_use") out.push(`[${i}] TOOL ${c.name} ${JSON.stringify(c.input).slice(0, 220)}`);
    }
  } else if (t === "user") {
    for (const c of (j.message && j.message.content) || []) {
      if (c.type === "tool_result") {
        const txt = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
        if (c.is_error || /error|denied|failed/i.test(txt)) out.push(`[${i}] RESULT${c.is_error ? "(ERR)" : ""} ${txt.replace(/\s+/g, " ").slice(0, 260)}`);
      }
    }
  } else if (t === "result") out.push(`[${i}] DONE subtype=${j.subtype} turns=${j.num_turns} cost=$${j.total_cost_usd} dur=${Math.round((j.duration_ms||0)/1000)}s denials=${JSON.stringify(j.permission_denials)} result=${String(j.result||"").replace(/\s+/g," ").slice(0, 1500)}`);
}
console.log(`lines=${lines.length}`);
console.log(out.join("\n"));
