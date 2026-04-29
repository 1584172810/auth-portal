<template>
  <div class="cp-page">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo-text">🦞 OpenClaw</span>
      </div>
      <nav class="nav-links">
        <a href="/" class="nav-item">💬 Chat</a>
        <a href="/change-password" class="nav-item active">🔑 Change Password</a>
      </nav>
      <div class="sidebar-footer">
        <span class="user-badge">{{ auth.user }}</span>
        <button @click="handleLogout" class="btn-logout">Sign Out</button>
      </div>
    </aside>
    <main class="main-content">
      <div class="cp-card">
        <h2>Change Password</h2>
        <form @submit.prevent="handleChange">
          <div class="field">
            <input v-model="current" type="password" placeholder="Current password" required />
          </div>
          <div class="field">
            <input v-model="newPw" type="password" placeholder="New password" required minlength="6" />
          </div>
          <div class="field">
            <input v-model="confirmPw" type="password" placeholder="Confirm new password" required />
          </div>

          <p v-if="message" :class="messageType">{{ message }}</p>

          <button type="submit" :disabled="submitting" class="btn-primary">
            {{ submitting ? 'Saving...' : 'Change Password' }}
          </button>
        </form>
      </div>
    </main>
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
    message.value = 'Passwords do not match';
    messageType.value = 'error';
    return;
  }
  if (newPw.value.length < 6) {
    message.value = 'Password must be at least 6 characters';
    messageType.value = 'error';
    return;
  }
  submitting.value = true;
  try {
    const res = await auth.changePassword(current.value, newPw.value);
    if (res.ok) {
      message.value = 'Password changed successfully!';
      messageType.value = 'success';
      current.value = '';
      newPw.value = '';
      confirmPw.value = '';
    } else {
      message.value = res.message || 'Failed to change password';
      messageType.value = 'error';
    }
  } catch (e) {
    message.value = e.response?.data?.message || 'Server error';
    messageType.value = 'error';
  } finally {
    submitting.value = false;
  }
}

async function handleLogout() {
  await auth.logout();
  window.location.href = '/';
}
</script>

<style scoped>
.cp-page {
  display: flex;
  height: 100vh;
  background: #1a1a2e;
}
.sidebar {
  width: 220px;
  background: rgba(255,255,255,0.03);
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
}
.sidebar-header {
  margin-bottom: 24px;
}
.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}
.nav-links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  color: rgba(255,255,255,0.5);
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  transition: all 0.2s;
}
.nav-item:hover,
.nav-item.active {
  background: rgba(255,255,255,0.08);
  color: #fff;
}
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.user-badge {
  color: rgba(255,255,255,0.6);
  font-size: 13px;
}
.btn-logout {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: #ff6b6b;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.btn-logout:hover {
  background: rgba(255,107,107,0.15);
}
.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.cp-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  padding: 40px;
  width: 420px;
  max-width: 100%;
}
.cp-card h2 {
  color: #fff;
  margin: 0 0 24px;
  font-size: 22px;
}
.field {
  margin-bottom: 16px;
}
.field input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #fff;
  font-size: 15px;
  outline: none;
  transition: border 0.2s;
  box-sizing: border-box;
}
.field input::placeholder {
  color: rgba(255,255,255,0.3);
}
.field input:focus {
  border-color: #6c63ff;
}
.message {
  font-size: 13px;
  margin: 0 0 16px;
}
.error {
  color: #ff6b6b;
}
.success {
  color: #4ade80;
}
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #6c63ff, #a855f7);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
