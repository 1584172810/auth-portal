const WebSocket = require('ws');
const gw = new WebSocket('ws://127.0.0.1:18789', { headers: { Origin: 'https://117.72.200.3' } });
gw.on('open', () => {
  console.log('GW_OPEN');
});
gw.on('message', d => {
  const p = JSON.parse(d.toString());
  console.log('GW_MSG:', p.type, p.event || '', Object.keys(p).join(','));
  if (p.type === 'event' && p.event === 'connect.challenge') {
    console.log('CHALLENGE RECEIVED');
  }
});
gw.on('error', e => console.log('GW_ERR:', e.message));
gw.on('close', c => console.log('GW_CLOSE:', c));
setTimeout(() => process.exit(), 5000);
