const WebSocket = require("/root/.openclaw/workspace/auth-portal/server/node_modules/ws");
const ws = new WebSocket("ws://127.0.0.1:3000/api/chat-ws", { headers: { Cookie: "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRoZW1lIjoiYXVyb3JhIiwiaWF0IjoxNzc3NDU3MTcxLCJleHAiOjE3Nzc3MTYzNzF9.9LFR3vEA0Hwu2ViL0mjosyC_PiEkRU43Y_614uMgAEs" } });
ws.on("message", d => console.log("R:", d.toString().substring(0, 600)));
ws.on("open", () => console.log("O"));
ws.on("error", e => console.log("E:", e.message));
ws.on("close", c => console.log("C:", c));
setTimeout(() => { console.log("TIMEOUT", ws.readyState); process.exit(); }, 8000);
