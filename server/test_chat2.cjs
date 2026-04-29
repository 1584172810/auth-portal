const WebSocket = require("/root/.openclaw/workspace/auth-portal/server/node_modules/ws");
const ws = new WebSocket("ws://127.0.0.1:3000/api/chat-ws", { headers: { Cookie: "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRoZW1lIjoiYXVyb3JhIiwiaWF0IjoxNzc3NDU3MTg3LCJleHAiOjE3Nzc3MTYzODd9.9Y-ZdiWnikqtcJevp1Lq_EEnmlXqF3vPDjbZfRv0vz8" } });
let authDone = false;
ws.on("message", d => {
  const s = d.toString();
  try {
    const p = JSON.parse(s);
    if (p.type === "res" && p.id === "c-") authDone = true;
    if (p.type === "event" && p.event === "chat") {
      console.log("CHAT:", JSON.stringify(p.payload).substring(0, 500));
      if (p.payload.state === "completed") { ws.close(); process.exit(0); }
    }
    if (p.type === "event" && p.event === "agent") {
      console.log("AGENT:", JSON.stringify(p.payload).substring(0, 200));
    }
    if (p.type === "res" && p.ok === true && p.id && p.id.startsWith("chat")) {
      console.log("SEND_OK:", JSON.stringify(p.payload).substring(0, 200));
    }
  } catch(e) { console.log("RAW:", s.substring(0, 100)); }
});
ws.on("open", () => {
  console.log("O");
  ws.send(JSON.stringify({ type: "req", id: "chat-" + Date.now(), method: "chat.send", params: { sessionKey: "portal-chat-e2e", message: "你叫什么名字？", idempotencyKey: "ik-" + Date.now() } }));
});
ws.on("error", e => console.log("E:", e.message));
ws.on("close", c => console.log("C:", c));
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 25000);
