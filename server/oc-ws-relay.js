import WebSocket from "ws";
import jwt from "jsonwebtoken";
import { readFileSync } from "fs";

const GATEWAY_TOKEN_FILE = "/root/.openclaw/openclaw.json";

function getGWToken() {
  try {
    const r = readFileSync(GATEWAY_TOKEN_FILE, "utf-8");
    return JSON.parse(r).gateway?.auth?.token || null;
  } catch { return null; }
}

export function handleOcWs(req, socket) {
  const t = req.cookies?.auth_token;
  if (!t) { socket.destroy(); return; }
  let u;
  try { u = jwt.verify(t, process.env.JWT_SECRET || ""); }
  catch { socket.destroy(); return; }

  const sessionKey = "portal-" + u.username;
  const token = getGWToken();
  if (!token) { socket.destroy(); return; }

  const gwUrl = "ws://127.0.0.1:18789";
  let gwSocket;
  try { gwSocket = new WebSocket(gwUrl); } catch { socket.destroy(); return; }

  let buf = [];

  socket.on("data", (chunk) => {
    if (gwSocket.readyState === WebSocket.OPEN) {
      if (buf.length) { buf.forEach((d) => gwSocket.send(d)); buf = []; }
      gwSocket.send(chunk.toString());
    } else {
      buf.push(chunk.toString());
    }
  });
  socket.on("close", () => { try { gwSocket?.close(); } catch {} });

  gwSocket.on("open", () => {
    const connectFrame = JSON.stringify({
      type: "req",
      id: "c-" + Date.now(),
      method: "connect",
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: "portal-chat", version: "1.0.0", platform: "web", mode: "operator" },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        caps: [], commands: ["chat.send", "chat.history", "chat.abort"],
        auth: { token },
        locale: "zh-CN",
        userAgent: "portal-chat/1.0.0",
        device: { id: "portal-" + u.username, publicKey: "", signature: "", signedAt: Date.now(), nonce: "" }
      }
    });
    gwSocket.send(connectFrame);
    if (buf.length) { buf.forEach((d) => gwSocket.send(d)); buf = []; }
  });

  gwSocket.on("message", (data) => {
    try { socket.write(data.toString() + "\n"); } catch {}
  });
  gwSocket.on("close", () => { try { socket.destroy(); } catch {} });
  gwSocket.on("error", () => { try { socket.destroy(); } catch {} });
}
