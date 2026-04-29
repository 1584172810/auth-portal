
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:3000/api/chat-ws", { headers: { Cookie: "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRoZW1lIjoiYXVyb3JhIiwiaWF0IjoxNzc3NDU2MTc0LCJleHAiOjE3Nzc3MTUzNzR9.BEGi-8rdhs02oFIjUQbvcPQWZh5KfF-WN_1rx44F4NM" } });
ws.on("message", d => console.log("R:" + d.toString().substring(0, 600)));
ws.on("open", () => console.log("O"));
ws.on("error", e => console.log("E:" + e.message));
ws.on("close", c => console.log("C:" + c));
ws.on("unexpected-response", (req, res) => console.log("UR:", res.statusCode, res.statusMessage));
setTimeout(() => process.exit(), 15000);
