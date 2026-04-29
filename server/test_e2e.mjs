import WebSocket from 'ws';
const token = process.argv[2];
const ws = new WebSocket('ws://127.0.0.1:3000/api/chat-ws', { headers: { Cookie: 'auth_token=' + token } });
ws.on('message', d => console.log('R:' + d.toString().substring(0, 600)));
ws.on('open', () => console.log('O'));
ws.on('error', e => console.log('E:' + e.message));
ws.on('close', c => console.log('C:' + c));
setTimeout(() => { console.log('TIMEOUT'); process.exit(); }, 10000);
