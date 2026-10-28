// Holds TCP 50040 so Lens Studio's MCP server binds 50041 instead -- the port
// this coding session's MCP client was configured with at startup.
const net = require("net");
const srv = net.createServer(() => {});
srv.listen(50040, "127.0.0.1", () => console.log("holding 127.0.0.1:50040"));
srv.on("error", (e) => { console.error("could not hold 50040:", e.message); process.exit(1); });
setInterval(() => {}, 1 << 30);
