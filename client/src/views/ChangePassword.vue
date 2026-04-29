<template>
  <div class="cp-page">
    <div class="cp-card">
      <h2>修改密码</h2>
      <p class="subtitle">为你的账号设置新密码</p>
      <form @submit.prevent="handleChange">
        <div class="field">
          <input v-model="current" type="password" placeholder="当前密码" required />
        </div>
        <div class="field">
          <input v-model="newPw" type="password" placeholder="新密码（至少6位）" required minlength="6" />
        </div>
        <div class="field">
          <input v-model="confirmPw" type="password" placeholder="确认新密码" required />
        </div>

        <p v-if="message" :class="messageType" class="msg">{{ message }}</p>

        <button type="submit" :disabled="submitting" class="btn-primary">
          {{ submitting ? '保存中...' : '修改密码' }}
        </button>
      </form>
      <div class="links">
        <a href="/" class="back-link">← 返回首页</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();

const current = ref('');
const newPw = ref('');
const confirmPw = ref('');
const message = ref('');
const messageType = ref('');
const submitting = ref(false);

onMounted(async () => {
  const authed = await auth.checkAuth();
  if (!authed) window.location.href = '/';
});

async function handleChange() {
  message.value = '';
  if (newPw.value !== confirmPw.value) {
    message.value = '两次输入的密码不一致';
    messageType.value = 'error';
    return;
  }
  if (newPw.value.length < 6) {
    message.value = '密码至少需要6个字符';
    messageType.value = 'error';
    return;
  }
  submitting.value = true;
  try {
    const res = await auth.changePassword(current.value, newPw.value);
    if (res.ok) {
      message.value = '密码修改成功！';
      messageType.value = 'success';
      current.value = '';
      newPw.value = '';
      confirmPw.value = '';
    } else {
      message.value = res.message || '修改密码失败';
      messageType.value = 'error';
    }
  } catch (e) {
    message.value = e.response?.data?.message || '服务器错误';
    messageType.value = 'error';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.cp-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-bg);
  transition: background 0.4s ease;
  padding: 24px;
}
.cp-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 40px;
  width: 420px;
  max-width: 100%;
  box-shadow: var(--card-shadow);
}
.cp-card h2 {
  color: var(--text-primary);
  margin: 0 0 4px;
  font-size: 22px;
}
.subtitle { color: var(--text-secondary); font-size: 14px; margin: 0 0 28px; }
.field { margin-bottom: 16px; }
.field input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  transition: border 0.2s;
  box-sizing: border-box;
}
.field input::placeholder { color: var(--text-muted); }
.field input:focus { border-color: var(--input-focus-border); }
.msg { font-size: 13px; margin: 0 0 16px; }
.error { color: var(--danger); }
.success { color: var(--success); }
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--accent);
  color: var(--btn-text);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.links { margin-top: 20px; text-align: center; }
.back-link { color: var(--text-secondary); font-size: 14px; transition: color 0.2s; }
.back-link:hover { color: var(--text-primary); }

@media (max-width: 480px) {
  .cp-card { padding: 28px 20px; }
  .cp-card h2 { font-size: 19px; }
  .field input { padding: 12px 14px; font-size: 16px; }
  .btn-primary { padding: 12px; font-size: 15px; }
}
</style>
