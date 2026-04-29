import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const s = [...Array(64)].map(() => Math.random().toString(36)[2]).join('');
  console.log('[warn] AUTH_JWT_SECRET not set, using ephemeral secret');
  return s;
})();
const JWT_EXPIRES = '72h';
const DB_PATH = path.join(__dirname, 'auth.db');
const PORT = 3000;
const OPENCLAW_URL = 'http://127.0.0.1:18789';

let db;

function q1(q, p) { const r = db.exec(q, p); return r.length ? r[0].values[0].reduce((o, v, i) => { o[r[0].columns[i]] = v; return o; }, {}) : null; }
function run(q, p) { db.run(q, p); }
function all(q, p) { const r = db.exec(q, p); return r.length ? r[0].values.map(row => row.reduce((o, v, i) => { o[r[0].columns[i]] = v; return o; }, {})) : []; }

async function initDb() {
  const SQL = await initSqlJs();
  const exists = fs.existsSync(DB_PATH);
  const buf = exists ? fs.readFileSync(DB_PATH) : null;
  db = new SQL.Database(buf);
  db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT DEFAULT "user", theme TEXT DEFAULT "aurora")');
  db.run('CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, token TEXT, note TEXT, created TEXT DEFAULT (datetime("now")))');
  if (!exists || !q1('SELECT id FROM users WHERE username = ?', ['admin'])) {
    const pw = bcrypt.hashSync('admin123', 10);
    db.run('INSERT OR IGNORE INTO users (username, password, role, theme) VALUES (?,?,?,?)', ['admin', pw, 'admin', 'aurora']);
    console.log('[seed] Default admin: admin / admin123');
  }
}

function getU(u) { return q1('SELECT * FROM users WHERE username = ?', [u]); }
function getUById(i) { return q1('SELECT * FROM users WHERE id = ?', [i]); }
function updatePw(i, p) { run('UPDATE users SET password = ? WHERE id = ?', [p, i]); }
function updateTheme(i, t) { run('UPDATE users SET theme = ? WHERE id = ?', [t, i]); }
function deleteToken(i) { run('DELETE FROM tokens WHERE id = ?', [i]); }
function getTokenById(i) { return q1('SELECT * FROM tokens WHERE id = ?', [i]); }
const ROLES = ['admin','manager','user'];
const ROLE_LABELS = { admin:'管理员', manager:'运营', user:'普通用户' };
const GATEWAY_CFG = '/root/.openclaw/openclaw.json';
function getGWToken(){try{const r=fs.readFileSync(GATEWAY_CFG,'utf-8');return JSON.parse(r).gateway?.auth?.token||null}catch{return null}}
function updGWToken(t){try{const r=JSON.parse(fs.readFileSync(GATEWAY_CFG,'utf-8'));if(!r.gateway)r.gateway={};if(!r.gateway.auth)r.gateway.auth={};r.gateway.auth.token=t;r.gateway.auth.mode='token';fs.writeFileSync(GATEWAY_CFG,JSON.stringify(r,null,2));return true}catch{return false}}
function genT(l=48){const c='abcdefghijklmnopqrstuvwxyz0123456789';return[...Array(l)].map(()=>c[Math.floor(Math.random()*c.length)]).join('')}

const app = express();
app.use(cookieParser());
app.use(express.json());
function tokUser(req){const t=req.cookies?.auth_token||(req.headers?.cookie||"").split(";").find(c=>c.trim().startsWith("auth_token="))?.split("=")[1];if(!t)return null;try{return jwt.verify(t,JWT_SECRET)}catch{return null}}
function hasRole(u,min){const order={admin:3,manager:2,user:1};return order[u?.role||'user']>=order[min]}

const ocProxy = createProxyMiddleware({target:OPENCLAW_URL,changeOrigin:true,ws:true,proxyTimeout:86400000,timeout:86400000});
app.use('/_openclaw',(req,res,next)=>{const u=tokUser(req);if(!u)return res.status(401).json({ok:false});req.url=req.url.replace(/^\/_openclaw/,'')||'/';ocProxy(req,res,next)});

app.post('/api/login',(req,res)=>{
  const{username,password}=req.body;if(!username||!password)return res.status(400).json({ok:false});
  const user=getU(username);if(!user||!bcrypt.compareSync(password,user.password))return res.status(401).json({ok:false});
  const token=jwt.sign({id:user.id,username:user.username,role:user.role,theme:user.theme||'aurora'},JWT_SECRET,{expiresIn:JWT_EXPIRES});
  res.cookie('auth_token',token,{httpOnly:true,sameSite:'lax',maxAge:72*3600000});
  res.json({ok:true,username:user.username,role:user.role,theme:user.theme||'aurora'});
});
app.post('/api/logout',(_req,res)=>{res.clearCookie('auth_token');res.json({ok:true})});
app.get('/api/me',(req,res)=>{const u=tokUser(req);if(!u)return res.status(401).json({ok:false});res.json({ok:true,username:u.username,role:u.role,theme:u.theme||'aurora'})});
app.post('/api/theme',(req,res)=>{const u=tokUser(req);if(!u)return res.status(401).json({ok:false});const{theme}=req.body;if(!['dark','light','aurora','sunset','forest'].includes(theme))return res.status(400).json({ok:false});updateTheme(u.id,theme);res.json({ok:true})});
app.post('/api/change-password',(req,res)=>{const tu=tokUser(req);if(!tu)return res.status(401).json({ok:false});const{currentPassword,newPassword}=req.body;if(!currentPassword||!newPassword||newPassword.length<6)return res.status(400).json({ok:false});const u=getUById(tu.id);if(!u||!bcrypt.compareSync(currentPassword,u.password))return res.status(401).json({ok:false});updatePw(u.id,bcrypt.hashSync(newPassword,10));res.json({ok:true})});


// Static files
// File upload
import multer from 'multer';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.post('/api/upload', (req, res) => {
  const u = tokUser(req);
  if (!u) return res.status(401).json({ ok: false });
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, error: 'No files uploaded' });
    const files = req.files.map(f => ({
      originalName: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
      url: '/uploads/' + f.filename
    }));
    res.json({ ok: true, files });
  });
});

app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/', express.static(path.join(__dirname, '../client/dist')));
app.use('/portal-assets', express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

function reqAdmin(req,res,next){const u=tokUser(req);if(!u)return res.status(401).json({ok:false});if(!hasRole(u,'admin'))return res.status(403).json({ok:false,role:u.role});req.tokU=u;next()}
function reqManager(req,res,next){const u=tokUser(req);if(!u)return res.status(401).json({ok:false});if(!hasRole(u,'manager'))return res.status(403).json({ok:false,role:u.role});req.tokU=u;next()}

// Admin user management
app.get('/api/admin/users',reqAdmin,(req,res)=>{res.json(all('SELECT id,username,role,theme FROM users ORDER BY id'))});
app.post('/api/admin/users',reqAdmin,(req,res)=>{const{username,password,role}=req.body;if(!username||!password)return res.status(400).json({ok:false});if(getU(username))return res.status(409).json({ok:false});run('INSERT INTO users (username,password,role,theme) VALUES(?,?,?,?)',[username,bcrypt.hashSync(password,10),role||'user','aurora']);res.json({ok:true})});
app.put('/api/admin/users/:id',reqAdmin,(req,res)=>{const{password,role}=req.body;const u=getUById(req.params.id);if(!u)return res.status(404).json({ok:false});if(password)run('UPDATE users SET password=? WHERE id=?',[bcrypt.hashSync(password,10),req.params.id]);if(role)run('UPDATE users SET role=? WHERE id=?',[role,req.params.id]);res.json({ok:true})});
app.delete('/api/admin/users/:id',reqAdmin,(req,res)=>{const u=getUById(req.params.id);if(!u)return res.status(404).json({ok:false});if(u.role==='admin'&&all('SELECT id FROM users WHERE role="admin"').length<2)return res.status(400).json({ok:false});if(u.username==='admin')return res.status(400).json({ok:false});run('DELETE FROM users WHERE id=?',[req.params.id]);res.json({ok:true})});

// Token management (manager+)
app.get('/api/tokens',reqManager,(req,res)=>{res.json(all('SELECT id,name,note,created FROM tokens ORDER BY id'))});
app.post('/api/tokens',reqManager,(req,res)=>{const{name,note}=req.body;const t=genT();run('INSERT INTO tokens(name,token,note) VALUES(?,?,?)',[name||'Unnamed',t,note||'']);res.json({ok:true,token:t})});
app.delete('/api/tokens/:id',reqManager,(req,res)=>{deleteToken(req.params.id);res.json({ok:true})});

// Gateway token
let GATEWAY_TOKEN = getGWToken();
function refreshGWToken() { GATEWAY_TOKEN = getGWToken(); }
try { const t = execSync('openclaw gateway token', { encoding: 'utf-8' }).trim(); if (t) GATEWAY_TOKEN = t; }
catch(e) { console.error('Failed to read gateway token:', e.message); }
refreshGWToken();

// Load or create device identity
const IDENT_PATH = path.join(__dirname, 'portal-device-id.json');
function loadIdentity() {
  try { return JSON.parse(fs.readFileSync(IDENT_PATH, 'utf8')); } catch {}
  const kp = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const der = crypto.createPublicKey(kp.publicKey).export({ type: 'spki', format: 'der' });
  const deviceId = crypto.createHash('sha256').update(der.subarray(12)).digest('hex');
  const identity = { deviceId, publicKeyPem: kp.publicKey, privateKeyPem: kp.privateKey };
  fs.writeFileSync(IDENT_PATH, JSON.stringify(identity, null, 2));
  return identity;
}
const DEVICE_IDENTITY = loadIdentity();

function handleChatWs(req, socket, head) {
  const u = tokUser(req);
  if (!u) { socket.destroy(); return; }

  const gwSocket = new WebSocket('ws://127.0.0.1:18789', { headers: { Origin: 'https://117.72.200.3' } });
  let authDone = false;
  let portalWs = null;

  const forwardGw = (data) => {
    if (portalWs && portalWs.readyState === WebSocket.OPEN) {
      try { portalWs.send(data.toString()); } catch {}
    }
  };

  gwSocket.on('message', (data) => {
    const msg = data.toString();
    try {
      const p = JSON.parse(msg);

      // connect.challenge
      if (p.type === 'event' && p.event === 'connect.challenge' && !authDone) {
        const nonce = p.payload.nonce;
        if (!GATEWAY_TOKEN) refreshGWToken();
        const st = Date.now();
        const scopes = 'operator.read,operator.write';
        const payload = ['v2', DEVICE_IDENTITY.deviceId, 'openclaw-control-ui', 'ui', 'operator', scopes, String(st), GATEWAY_TOKEN, nonce].join('|');
        const privKeyObj = crypto.createPrivateKey({ key: DEVICE_IDENTITY.privateKeyPem, format: 'pem', type: 'pkcs8' });
        const sig = crypto.sign(null, Buffer.from(payload, 'utf-8'), privKeyObj).toString('base64');

        gwSocket.send(JSON.stringify({
          type: 'req', id: 'c-' + Date.now(), method: 'connect',
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: ['chat.send', 'chat.history', 'chat.abort'],
            auth: { token: GATEWAY_TOKEN },
            locale: 'zh-CN', userAgent: 'portal-chat/1.0.0',
            device: { id: DEVICE_IDENTITY.deviceId, publicKey: DEVICE_IDENTITY.publicKeyPem, signature: sig, signedAt: st, nonce }
          }
        }));
        return;
      }

      // connect success → upgrade portal client
      if (p.type === 'res' && p.id && p.id.startsWith('c-') && p.ok === true && !authDone) {
        authDone = true;
        const wss = new WebSocketServer({ noServer: true });
        wss.handleUpgrade(req, socket, head, (ws) => {
          portalWs = ws;
          ws.on('message', (d) => {
            if (gwSocket.readyState === WebSocket.OPEN) gwSocket.send(d.toString());
          });
          ws.on('close', () => { try { gwSocket.close(); } catch {} });
          // Now send the connect response and any queued Gateway msgs
          try { ws.send(msg); } catch {}
        });
        return;
      }

      // After auth: forward everything to portal
      if (authDone) {
        forwardGw(data);
      }
    } catch (e) {
      console.error('GW err:', e.message);
    }
  });

  gwSocket.on('error', (e) => {
    console.error('GWC err:', e.message);
    socket.destroy();
  });
}

async function start() {
  await initDb();
  const server = app.listen(PORT, () => console.log('Auth Portal on :' + PORT + ' | chat-ws endpoint ready'));

  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/_openclaw/')) {
      const u = tokUser(req);
      if (!u) { socket.destroy(); return; }
      ocProxy.upgrade(req, socket, head);
    } else if (req.url === '/api/chat-ws') {
      handleChatWs(req, socket, head);
    } else {
      ocProxy.upgrade(req, socket, head);
    }
  });
}

start();
