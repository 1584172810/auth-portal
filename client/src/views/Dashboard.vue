<template>
  <div class="dashboard">
    <div class="theme-picker">
      <button v-for="t in auth.themes" :key="t.id" :class="['theme-btn', { active: auth.theme === t.id }]" @click="auth.saveTheme(t.id)" :title="t.label">
        <span class="theme-icon">{{ t.icon }}</span>
        <span class="theme-label">{{ t.label }}</span>
      </button>
    </div>

    <div class="content">
      <div class="logo">🦞</div>
      <h1>OpenClaw</h1>
      <p class="greeting">{{ auth.user }}<span v-if="auth.role" class="role-badge">{{ auth.roleLabels[auth.role] }}</span></p>

      <div class="button-row">
        <a href="/chat" target="_blank" class="btn-entry">
          <span class="btn-icon">💬</span>
          <span class="btn-label">进入 OpenClaw</span>
        </a>
        <a v-if="auth.hasAccess('manager')" href="/admin" class="btn-entry">
          <span class="btn-icon">⚙️</span>
          <span class="btn-label">后台管理</span>
        </a>
      </div>
    </div>

    <button @click="handleLogout" class="btn-logout">退出登录</button>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();

onMounted(async () => {
  const authed = await auth.checkAuth();
  if (!authed) window.location.href = '/login';
});

async function handleLogout() {
  await auth.logout();
  window.location.href = '/login';
}
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--gradient-bg);
  transition: background 0.4s ease;
  position: relative;
}
.content { text-align: center; }
.logo { font-size: 72px; margin-bottom: 4px; }
h1 { color: var(--text-primary); font-size: 30px; font-weight: 700; margin: 8px 0 4px; }
.greeting { color: var(--text-secondary); font-size: 15px; margin-bottom: 44px; }
.role-badge { display: inline-block; font-size: 11px; background: var(--badge-bg); color: var(--badge-text); padding: 2px 8px; border-radius: 6px; margin-left: 8px; vertical-align: middle; }
.button-row { display: flex; justify-content: center; gap: 24px; }
.btn-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 170px;
  height: 150px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 18px;
  box-shadow: var(--card-shadow);
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
  transition: all 0.25s;
}
.btn-entry:hover {
  border-color: var(--accent);
  box-shadow: var(--card-shadow), var(--accent-glow);
  transform: translateY(-4px);
}
.btn-icon { font-size: 38px; }
.btn-label { font-size: 16px; font-weight: 600; }
.theme-picker {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  gap: 6px;
  padding: 6px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
}
.theme-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.theme-btn:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
.theme-btn.active { background: var(--accent); color: var(--btn-text); box-shadow: var(--accent-glow); }
.theme-icon { font-size: 16px; }
.theme-label { font-size: 12px; white-space: nowrap; }
.btn-logout {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 20px;
  border-radius: 12px;
  border: 1px solid rgba(255,107,107,0.3);
  background: rgba(255,107,107,0.1);
  color: var(--danger);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.btn-logout:hover { background: rgba(255,107,107,0.2); transform: translateY(-1px); }
</style>
