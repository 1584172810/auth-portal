<template>
  <div class="chat-page">
    <!-- Sidebar -->
    <div class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
      <div class="sidebar-header">
        <span class="sidebar-title">💬 对话历史</span>
        <button class="btn-sidebar-close" @click="sidebarOpen = false">✕</button>
      </div>
      <button class="btn-new-chat" @click="newSession">＋ 新对话</button>
      <div class="session-list" v-if="sessions.length">
        <div v-for="s in sessions" :key="s.id"
          :class="['session-item', { active: currentSessionId === s.id }]"
          @click="switchSession(s.id)">
          <div class="session-title">{{ s.title }}</div>
          <div class="session-meta">{{ formatTime(s.updated) }}</div>
          <button class="btn-del-session" @click.stop="deleteSession(s.id)" title="删除对话">✕</button>
        </div>
      </div>
      <div v-else class="sidebar-empty">暂无对话记录</div>
    </div>
    <!-- Overlay for mobile sidebar -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- Header -->
      <div class="chat-header">
        <button @click="sidebarOpen = true" class="btn-sidebar-toggle">☰</button>
        <button @click="goBack" class="btn-back">← 返回</button>
        <span class="chat-title">{{ currentSessionTitle }}</span>
        <span class="chat-user">{{ auth.user }}</span>
      </div>

      <!-- Messages -->
      <div class="messages" ref="msgContainer">
        <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role === 'user' ? 'msg-user' : 'msg-assistant', { 'msg-streaming': m.streaming }]">
          <div class="msg-role">{{ m.role === 'user' ? '你' : '小爪' }}</div>
          <!-- Files preview in messages -->
          <div v-if="m.files && m.files.length" class="msg-files">
            <div v-for="(f, fi) in m.files" :key="fi" class="file-chip">
              <img v-if="isImage(f.mimetype)" :src="f.url" class="file-img" @click="previewImg(f.url)" />
              <span v-else class="file-icon">📎</span>
              <a :href="f.url" target="_blank" class="file-name">{{ f.originalName }}</a>
              <span class="file-size">{{ formatSize(f.size) }}</span>
            </div>
          </div>
          <div class="msg-text" v-html="renderText(m.text)"></div>
        </div>
        <!-- Loading indicator -->
        <div v-if="loadingHistory" class="connecting">
          <div class="spinner"></div>
          <span>加载历史记录...</span>
        </div>
        <!-- Uploading indicator -->
        <div v-if="uploading" class="msg msg-assistant uploading-indicator">
          <div class="uploading-bar">
            <span class="upload-spinner"></span>
            <span>上传文件中 ({{ uploadProgress }})...</span>
          </div>
        </div>
        <div v-if="connecting && !messages.length" class="connecting">
          <div class="spinner"></div>
          <span>连接中...</span>
        </div>
        <div v-if="!connecting && !loadingHistory && !messages.length" class="empty">
          开始对话吧 ✍️
        </div>
      </div>

      <!-- Input -->
      <div class="input-bar">
        <label class="btn-file" :class="{ 'btn-file-disabled': sending || uploading }">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <input type="file" multiple @change="onFileSelected" ref="fileInput" accept="*/*" />
        </label>
        <div v-if="selectedFiles.length" class="file-badge" @click="clearFiles">
          {{ selectedFiles.length }} 个文件 ✕
        </div>
        <textarea
          v-model="inputText"
          @keydown.enter.exact="sendMessage"
          :disabled="sending || uploading"
          placeholder="输入消息... (Enter 发送)"
          rows="1"
          ref="inputEl"
          class="msg-input"
        ></textarea>
        <button @click="sendMessage" :disabled="sending || uploading || (!inputText.trim() && !selectedFiles.length) || !connected" class="btn-send">
          {{ sending ? '...' : '发送' }}
        </button>
      </div>

      <!-- Status bar -->
      <div class="status-bar" :class="{ 'status-err': !connected }">
        {{ connected ? (uploading ? '上传中...' : (sending ? '回复中...' : '已连接')) : (connecting ? '连接中...' : '连接断开') }}
      </div>
    </div>

    <!-- Image preview modal -->
    <div v-if="previewUrl" class="preview-overlay" @click="previewUrl = ''">
      <img :src="previewUrl" class="preview-img" />
      <span class="preview-close">✕</span>
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
const fileInput = ref(null);
const messages = ref([]);
const connecting = ref(true);
const connected = ref(false);
const sending = ref(false);
const uploading = ref(false);
const uploadProgress = ref('');
const selectedFiles = ref([]);
const previewUrl = ref('');
const sidebarOpen = ref(false);
const sessions = ref([]);
const currentSessionId = ref(null);
const currentSessionTitle = ref('新对话');
const loadingHistory = ref(false);

let ws = null;
let reqId = 0;
const pendingReqs = {};
let sessionKey = '';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'image/svg+xml'];

function isImage(mime) { return IMAGE_TYPES.includes(mime); }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t + 'Z');
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return d.toLocaleDateString('zh-CN');
}

function previewImg(url) { previewUrl.value = url; }

function clearFiles() {
  selectedFiles.value = [];
  if (fileInput.value) fileInput.value.value = '';
}

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
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="msg-link">$1</a>');
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
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

async function uploadFiles(files) {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  uploading.value = true;
  uploadProgress.value = `0/${files.length}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = `${Math.round(e.loaded / e.total * 100)}%`;
      }
    };

    xhr.onload = () => {
      uploading.value = false;
      if (xhr.status === 200) {
        try {
          const resp = JSON.parse(xhr.responseText);
          if (resp.ok) {
            resolve(resp.files);
          } else {
            reject(new Error(resp.error || 'Upload failed'));
          }
        } catch (e) {
          reject(new Error('Invalid response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      uploading.value = false;
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

async function onFileSelected(e) {
  const files = e.target.files;
  if (!files.length) return;
  selectedFiles.value = Array.from(files);
  e.target.value = '';
  if (inputEl.value) inputEl.value.focus();
}

// --- Session API calls ---

async function fetchSessions() {
  try {
    const res = await fetch('/api/chat-sessions');
    const data = await res.json();
    if (data.ok) {
      sessions.value = data.sessions;
    }
  } catch (e) {
    console.error('Failed to fetch sessions:', e);
  }
}

async function createSession() {
  if (!currentSessionId.value) {
    // Create a session if none exists
    try {
      const res = await fetch('/api/chat-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新对话' })
      });
      const data = await res.json();
      if (data.ok) {
        currentSessionId.value = data.session.id;
        currentSessionTitle.value = '新对话';
        await fetchSessions();
      }
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }
}

async function saveMessageToSession(role, text, files) {
  if (!currentSessionId.value) return;
  try {
    await fetch(`/api/chat-sessions/${currentSessionId.value}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text, files })
    });
    await fetchSessions();
  } catch (e) {
    console.error('Failed to save message:', e);
  }
}

async function deleteSession(id) {
  if (!confirm('确定删除该对话吗？消息将永久丢失。')) return;
  try {
    const res = await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      if (currentSessionId.value === id) {
        currentSessionId.value = null;
        currentSessionTitle.value = '新对话';
        messages.value = [];
      }
      await fetchSessions();
    }
  } catch (e) {
    console.error('Failed to delete session:', e);
  }
}

async function loadSessionMessages(id) {
  loadingHistory.value = true;
  try {
    const res = await fetch(`/api/chat-sessions/${id}`);
    const data = await res.json();
    if (data.ok) {
      messages.value = data.messages.map(m => ({
        role: m.role,
        text: m.text || '',
        streaming: false,
        files: m.files ? JSON.parse(m.files) : []
      }));
      currentSessionTitle.value = data.session.title;
      currentSessionId.value = data.session.id;
      scrollBottom();
    }
  } catch (e) {
    console.error('Failed to load messages:', e);
  }
  loadingHistory.value = false;
}

async function switchSession(id) {
  if (ws) {
    // Create a new GW session key for this chat session
    sessionKey = 'portal-' + auth.user + '-' + id;
  }
  await loadSessionMessages(id);
  sidebarOpen.value = false;
}

async function newSession() {
  if (ws) {
    sessionKey = 'portal-' + auth.user + '-' + Date.now();
  }
  currentSessionId.value = null;
  currentSessionTitle.value = '新对话';
  messages.value = [];
  inputText.value = '';
  selectedFiles.value = [];
}

async function sendMessage() {
  const text = inputText.value.trim();
  const files = selectedFiles.value;

  if ((!text && !files.length) || sending.value || uploading.value || !ws || ws.readyState !== WebSocket.OPEN) return;

  // Ensure we have a session
  await createSession();

  // Upload files first
  let uploadedFiles = [];
  if (files.length) {
    try {
      uploadedFiles = await uploadFiles(files);
      selectedFiles.value = [];
    } catch (e) {
      addMessage('user', '', { files: files.map(f => ({
        originalName: f.name,
        size: f.size,
        mimetype: f.type,
        url: ''
      })) });
      const errMsg = findOrCreateStreamMsg();
      errMsg.text = '⚠️ 上传失败: ' + e.message;
      errMsg.streaming = false;
      scrollBottom();
      return;
    }
  }

  inputText.value = '';
  sending.value = true;

  // Build message
  let msgText = text;
  if (uploadedFiles.length) {
    const fileLines = uploadedFiles.map(f => {
      const isImg = isImage(f.mimetype);
      return isImg ? `[图片: ${f.originalName}](${f.url})` : `[文件: ${f.originalName}](${f.url})`;
    });
    msgText = msgText ? fileLines.join('\n') + '\n' + msgText : fileLines.join('\n');
  }

  addMessage('user', msgText, { files: uploadedFiles });
  saveMessageToSession('user', msgText, uploadedFiles);

  const streamMsg = findOrCreateStreamMsg();

  try {
    const res = await sendWS('chat.send', {
      sessionKey,
      message: msgText,
      idempotencyKey: genUuid()
    });
    if (!res.ok) {
      streamMsg.text = '发送失败: ' + (res.error?.message || 'unknown');
      streamMsg.streaming = false;
      scrollBottom();
      sending.value = false;
      return;
    }
  } catch (e) {
    streamMsg.text = '发送失败: ' + e.message;
    streamMsg.streaming = false;
    scrollBottom();
    sending.value = false;
  }
}

function addMessage(role, text, opts = {}) {
  const msg = { role, text: text || '', streaming: !!opts.streaming, files: opts.files || [] };
  messages.value.push(msg);
  scrollBottom();
  return msg;
}

async function fetchHistory() {
  try {
    const res = await sendWS('chat.history', { sessionKey, limit: 50, maxChars: 5000 });
    if (res.ok && res.payload?.rows) {
      // Don't replace messages if we already loaded from local session
      if (messages.value.length === 0) {
        for (const row of res.payload.rows) {
          if (row.role === 'user' || row.role === 'assistant') {
            if (row.role === 'assistant' && (!row.text || /^(NO_REPLY|no_reply)$/i.test(row.text.trim()))) continue;
            messages.value.push({
              role: row.role,
              text: row.text || '',
              streaming: false,
              files: [],
            });
          }
        }
        scrollBottom();
      }
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

      if (connecting.value && msg.ok) {
        connecting.value = false;
        connected.value = true;
        // Fetch sessions and load latest
        fetchSessions().then(() => {
          if (sessions.value.length > 0 && !currentSessionId.value) {
            switchSession(sessions.value[0].id);
          }
        });
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
            saveMessageToSession('assistant', sm.text, []);
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
  ws.onopen = () => {};

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
  sessionKey = 'portal-' + auth.user + '-' + Date.now();
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
  height: 100vh;
  background: var(--page-bg);
  color: var(--text-primary);
}

/* === Sidebar === */
.sidebar {
  width: 260px;
  background: var(--card-bg);
  border-right: 1px solid var(--card-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  transition: transform 0.25s ease;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--card-border);
}
.sidebar-title { font-size: 15px; font-weight: 600; }
.btn-sidebar-close { display: none; background: none; border: none; color: var(--text-secondary); font-size: 18px; cursor: pointer; padding: 4px; }
.btn-new-chat {
  margin: 10px 12px;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed var(--card-border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.btn-new-chat:hover { border-color: var(--accent); color: var(--text-primary); background: rgba(255,255,255,0.03); }
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}
.session-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  margin-bottom: 2px;
}
.session-item:hover { background: rgba(255,255,255,0.05); }
.session-item.active { background: rgba(255,255,255,0.08); border-left: 3px solid var(--accent); }
.session-title { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.session-meta { font-size: 11px; color: var(--text-muted); }
.btn-del-session {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.session-item:hover .btn-del-session { display: flex; }
.btn-del-session:hover { background: rgba(255,84,112,0.15); color: var(--danger); }
.sidebar-empty { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; }
.sidebar-overlay { display: none; }

/* === Chat main === */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
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
.btn-sidebar-toggle { display: none; background: none; border: none; color: var(--text-secondary); font-size: 20px; cursor: pointer; padding: 4px; }
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
.chat-title { font-size: 16px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-user { font-size: 13px; color: var(--text-secondary); background: var(--badge-bg); padding: 4px 10px; border-radius: 8px; flex-shrink: 0; }
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
.spinner, .upload-spinner {
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
.msg-text :deep(.msg-link) { color: var(--accent); text-decoration: underline; }
.msg-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 4px 10px 4px 4px;
  font-size: 13px;
}
.file-img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s;
}
.file-img:hover { transform: scale(1.1); }
.file-icon { font-size: 18px; }
.file-name {
  color: var(--text-primary);
  text-decoration: none;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name:hover { text-decoration: underline; }
.file-size {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.uploading-indicator { align-self: flex-start; }
.uploading-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text-secondary);
}
.input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
  align-items: center;
}
.btn-file {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 6px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-file:hover { background: var(--badge-bg); color: var(--text-primary); }
.btn-file-disabled { opacity: 0.35; cursor: not-allowed; }
.btn-file input[type="file"] { display: none; }
.file-badge {
  font-size: 12px;
  background: var(--badge-bg);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
}
.file-badge:hover { background: var(--danger); color: white; }
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

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
}
.preview-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}
.preview-close {
  position: fixed;
  top: 20px;
  right: 24px;
  font-size: 28px;
  color: white;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.preview-close:hover { opacity: 1; }

/* === Responsive === */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
  }
  .sidebar.sidebar-open { transform: translateX(0); }
  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 99;
  }
  .btn-sidebar-toggle { display: block; }
  .btn-sidebar-close { display: block; }
}
</style>
