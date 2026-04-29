<template>
  <div class="chat-page">
    <!-- Header -->
    <div class="chat-header">
      <button @click="goBack" class="btn-back">← 返回</button>
      <span class="chat-title">💬 OpenClaw 对话</span>
      <span class="chat-user">{{ auth.user }}</span>
    </div>

    <!-- Messages -->
    <div class="messages" ref="msgContainer">
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role === 'user' ? 'msg-user' : 'msg-assistant', { 'msg-streaming': m.streaming }]">
        <div class="msg-role">{{ m.role === 'user' ? '你' : '小爪' }}</div>
        <div class="msg-text" v-html="renderText(m.text)"></div>
      </div>
      <div v-if="connecting && !messages.length" class="connecting">
        <div class="spinner"></div>
        <span>连接中...</span>
      </div>
      <div v-if="!connecting && !messages.length" class="empty">
        开始对话吧 ✍️
      </div>
    </div>

    <!-- Input -->
    <div class="input-bar">
      <textarea
        v-model="inputText"
        @keydown.enter.exact="sendMessage"
        :disabled="sending"
        placeholder="输入消息... (Enter 发送)"
        rows="1"
        ref="inputEl"
        class="msg-input"
      ></textarea>
      <button @click="sendMessage" :disabled="sending || !inputText.trim() || !connected" class="btn-send">
        {{ sending ? '...' : '发送' }}
      </button>
    </div>

    <!-- Status bar -->
    <div class="status-bar" :class="{ 'status-err': !connected }">
      {{ connected ? (sending ? '回复中...' : '已连接') : (connecting ? '连接中...' : '连接断开') }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const msgContainer = ref(null);
const inputEl = ref(null);
const inputText = ref('');
const messages = ref([]);
const connecting = ref(true);
const connected = ref(false);
const sending = ref(false);

let ws = null;
let reqId = 0;
const pendingReqs = {};
let sessionKey = '';

function nextId() {
  return 'r' + (++reqId) + '-' + Date.now();
}

function genUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function renderText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function scrollBottom() {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight;
    }
  });
}

function findOrCreateStreamMsg() {
  const last = messages.value[messages.value.length - 1];
  if (last && last.streaming) return last;
  const msg = { role: 'assistant', text: '', streaming: true };
  messages.value.push(msg);
  scrollBottom();
  return msg;
}

function addMessage(role, text, opts = {}) {
  const last = messages.value[messages.value.length - 1];
  if (opts.streaming && last && last.role === role && last.streaming) {
    last.text += text;
    scrollBottom();
    return last;
  }
  const msg = { role, text: text || '', streaming: !!opts.streaming };
  messages.value.push(msg);
  scrollBottom();
  return msg;
}

function sendWS(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('not connected'));
      return;
    }
    const id = nextId();
    pendingReqs[id] = { resolve, reject };
    const frame = JSON.stringify({ type: 'req', id, method, params });
    ws.send(frame);
  });
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value || !ws || ws.readyState !== WebSocket.OPEN) return;

  inputText.value = '';
  sending.value = true;

  addMessage('user', text);
  const streamMsg = findOrCreateStreamMsg();

  try {
    const res = await sendWS('chat.send', {
      sessionKey,
      message: text,
      idempotencyKey: genUuid()
    });
    if (!res.ok) {
      streamMsg.text = '发送失败: ' + (res.error?.message || 'unknown');
      streamMsg.streaming = false;
      scrollBottom();
      sending.value = false;
      return;
    }
    // Wait for chat event to finish
    return;
  } catch (e) {
    streamMsg.text = '发送失败: ' + e.message;
    streamMsg.streaming = false;
    scrollBottom();
    sending.value = false;
  }
}

async function fetchHistory() {
  try {
    const res = await sendWS('chat.history', { sessionKey, limit: 50, maxChars: 5000 });
    if (res.ok && res.payload?.rows) {
      messages.value = [];
      for (const row of res.payload.rows) {
        if (row.role === 'user' || row.role === 'assistant') {
          if (row.role === 'assistant' && (!row.text || /^(NO_REPLY|no_reply)$/i.test(row.text.trim()))) continue;
          messages.value.push({
            role: row.role,
            text: row.text || '',
            streaming: false,
          });
        }
      }
      scrollBottom();
    }
  } catch (e) {
    console.error('history fetch failed:', e);
  }
}

function handleMessage(data) {
  try {
    const msg = JSON.parse(data);

    if (msg.type === 'res') {
      const handler = pendingReqs[msg.id];
      if (handler) {
        delete pendingReqs[msg.id];
        if (msg.ok) {
          handler.resolve(msg);
        } else {
          handler.reject(new Error(msg.error?.message || 'RPC error'));
        }
      }

      // First successful response = connected
      if (connecting.value && msg.ok) {
        connecting.value = false;
        connected.value = true;
        setTimeout(fetchHistory, 100);
      }
    } else if (msg.type === 'event') {
      if (msg.event === 'chat') {
        const p = msg.payload || {};
        const m = p.message || {};
        if (m.role === 'assistant' && m.content) {
          const text = m.content.map(c => c.type === 'text' ? c.text : '').join('');
          const sm = findOrCreateStreamMsg();
          if (p.state === 'delta') {
            sm.text += text;
          } else {
            sm.text = text;
          }
          scrollBottom();
        }
        if (p.state === 'completed' || p.state === 'finished' || p.state === 'final' || p.done) {
          const sm = messages.value[messages.value.length - 1];
          if (sm && sm.streaming) {
            sm.streaming = false;
          }
          sending.value = false;
          scrollBottom();
        }
      } else if (msg.event === 'session.message') {
        const p = msg.payload || {};
        if (p.final || p.status === 'completed') {
          sending.value = false;
        }
        if (p.text && p.role === 'assistant') {
          const sm = findOrCreateStreamMsg();
          sm.text += p.text;
          scrollBottom();
        }
      } else if (msg.event === 'agent') {
        // agent lifecycle events - not needed for UI
      }
    }
  } catch (e) {
    console.error('parse error:', e);
  }
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/api/chat-ws`;

  connecting.value = true;
  connected.value = false;

  ws = new WebSocket(url);
  ws.onopen = () => {
    // Portal backend handles challenge and auth. Just wait for events.
  };

  ws.onmessage = (evt) => {
    handleMessage(evt.data);
  };

  ws.onclose = () => {
    connected.value = false;
    connecting.value = false;
    if (!closedIntentionally) {
      setTimeout(connect, 3000);
    }
  };

  ws.onerror = () => {
    connecting.value = false;
  };
}

let closedIntentionally = false;

function goBack() {
  closedIntentionally = true;
  if (ws) { ws.close(); ws = null; }
  window.location.href = '/';
}

onMounted(async () => {
  const authed = await auth.checkAuth();
  if (!authed) {
    window.location.href = '/login';
    return;
  }
  sessionKey = 'portal-' + auth.user;
  connect();
});

onUnmounted(() => {
  closedIntentionally = true;
  if (ws) { ws.close(); ws = null; }
});

watch(messages, () => {
  scrollBottom();
}, { deep: true });
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--page-bg);
  color: var(--text-primary);
}
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--card-border);
  flex-shrink: 0;
}
.btn-back {
  background: none;
  border: 1px solid var(--card-border);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.btn-back:hover { border-color: var(--accent); color: var(--text-primary); }
.chat-title { font-size: 16px; font-weight: 600; flex: 1; }
.chat-user { font-size: 13px; color: var(--text-secondary); background: var(--badge-bg); padding: 4px 10px; border-radius: 8px; }
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.connecting, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--text-muted);
  font-size: 15px;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--card-border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.msg {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 14px;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.msg-user {
  align-self: flex-end;
  background: var(--accent);
  color: var(--btn-text);
  border-bottom-right-radius: 4px;
}
.msg-assistant {
  align-self: flex-start;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-bottom-left-radius: 4px;
}
.msg-streaming { border-color: var(--accent); }
.msg-role { font-size: 11px; font-weight: 600; opacity: 0.6; margin-bottom: 6px; letter-spacing: 0.5px; }
.msg-text { font-size: 15px; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
.input-bar {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
}
.msg-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  max-height: 120px;
}
.msg-input:focus { border-color: var(--input-focus-border); }
.msg-input::placeholder { color: var(--text-muted); }
.btn-send {
  padding: 10px 22px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: var(--btn-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-send:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
.btn-send:disabled { opacity: 0.35; cursor: not-allowed; }
.status-bar {
  padding: 6px 20px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  text-align: center;
  flex-shrink: 0;
}
.status-err { color: var(--danger); background: rgba(255,84,112,0.08); }
</style>
