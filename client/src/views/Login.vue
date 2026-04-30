<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">🦞</div>
      <h1>OpenClaw</h1>
      <p class="subtitle">请登录</p>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <input v-model="username" type="text" placeholder="用户名" autocomplete="username" :disabled="submitting" required />
        </div>
        <div class="field">
          <input v-model="password" type="password" placeholder="密码" autocomplete="current-password" :disabled="submitting" required />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="submitting" class="btn-primary">{{ submitting ? '登录中…' : '登录' }}</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const username = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);

onMounted(() => {
  auth.initTheme();
});

async function handleLogin() {
  error.value = ''; submitting.value = true;
  try {
    const result = await auth.login(username.value, password.value);
    if (result.ok) { window.location.href = 'http://117.72.200.3/'; }
    else { error.value = result.message || '登录失败'; }
  } catch (e) { error.value = '连接失败'; }
  finally { submitting.value = false; }
}
</script>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--gradient-bg); transition: background 0.4s ease; }
.login-card { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 24px; padding: 48px 40px; width: 380px; max-width: 90vw; text-align: center; box-shadow: var(--card-shadow); }
.logo { font-size: 64px; margin-bottom: 8px; }
h1 { color: var(--text-primary); font-size: 28px; margin: 0 0 4px; font-weight: 600; }
.subtitle { color: var(--text-secondary); font-size: 14px; margin: 0 0 32px; }
.field { margin-bottom: 16px; }
.field input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary); font-size: 15px; outline: none; transition: border 0.2s; box-sizing: border-box; }
.field input::placeholder { color: var(--text-muted); }
.field input:focus { border-color: var(--input-focus-border); }
.error { color: var(--danger); font-size: 13px; margin: 0 0 16px; }
.btn-primary { width: 100%; padding: 14px; border: none; border-radius: 12px; background: var(--accent); color: var(--btn-text); font-size: 16px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
