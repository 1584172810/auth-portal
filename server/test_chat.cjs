const WebSocket = require("/root/.openclaw/workspace/auth-portal/server/node_modules/ws");
const ws = new WebSocket("ws://127.0.0.1:3000/api/chat-ws", { headers: { Cookie: "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRoZW1lIjoiYXVyb3JhIiwiaWF0IjoxNzc3NDU3MTg3LCJleHAiOjE3Nzc3MTYzODd9.9Y-ZdiWnikqtcJevp1Lq_EEnmlXqF3vPDjbZfRv0vz8" } });
let count = 0;
const msgs = [];
ws.on("message", d => {
  count++;
  const s = d.toString();
  console.log(count + ":", s.substring(0, 200));
  msgs.push(s);
  if (count >= 6) {
    ws.close();
    process.exit();
  }
});
ws.on("open", () => {
  console.log("O");
  ws.send(JSON.stringify({ type: "req", id: "chat1", method: "chat.send", params: { sessionKey: "portal-chat-test", message: "你好，世界！", idempotencyKey: "t-" + Date.now() } }));
});
ws.on("error", e => console.log("E:", e.message));
ws.on("close", c => { console.log("C:", c, "total:", count); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(); }, 15000);
