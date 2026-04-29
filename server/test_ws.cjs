const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:3000/api/chat-ws", { headers: { Cookie: "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRoZW1lIjoiYXVyb3JhIiwiaWF0IjoxNzc3NDU2MzYxLCJleHAiOjE3Nzc3MTU1NjF9.oq5ImPUPoW07s5AzCQ1wys1ZVedHSZoMmTCyF2tAB3Y" } });
ws.on("message", d => console.log("R:" + d.toString().substring(0, 600)));
ws.on("open", () => console.log("O"));
ws.on("error", e => console.log("E:" + e.message));
ws.on("close", c => console.log("C:" + c));
ws.on("unexpected-response", (req, res) => console.log("UR:", res.statusCode, res.statusMessage));
setTimeout(() => process.exit(), 15000);
