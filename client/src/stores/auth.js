import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

const api = axios.create({ baseURL: '', withCredentials: true });

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const role = ref(null);
  const theme = ref('aurora');
  const loading = ref(true);

  const themes = [
    { id: 'aurora', label: '赛博极光', icon: '🌌' },
    { id: 'sunset', label: '日落海岸', icon: '🌅' },
    { id: 'forest', label: '森林晨露', icon: '🌿' },
  ];

  const roles = ['admin', 'manager', 'user'];
  const roleLabels = { admin: '管理员', manager: '运营', user: '普通用户' };

  function applyTheme(t) {
    theme.value = t;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('oc_theme', t); } catch {}
  }

  function initTheme() {
    try {
      const saved = localStorage.getItem('oc_theme');
      if (saved && ['aurora', 'sunset', 'forest'].includes(saved)) {
        applyTheme(saved);
        return saved;
      }
    } catch {}
    return null;
  }

  async function checkAuth() {
    try {
      const res = await api.get('/api/me');
      user.value = res.data.username;
      role.value = res.data.role;
      applyTheme(res.data.theme || 'aurora');
      return true;
    } catch {
      user.value = null;
      role.value = null;
      return false;
    } finally { loading.value = false; }
  }

  async function login(username, password) {
    const res = await api.post('/api/login', { username, password });
    if (res.data.ok) {
      user.value = res.data.username;
      role.value = res.data.role;
      applyTheme(res.data.theme || 'aurora');
    }
    return res.data;
  }

  async function saveTheme(t) {
    await api.post('/api/theme', { theme: t });
    applyTheme(t);
  }

  async function logout() {
    await api.post('/api/logout');
    user.value = null;
    role.value = null;
    applyTheme('aurora');
  }

  function hasAccess(minRole) {
    const order = { admin: 3, manager: 2, user: 1 };
    return order[role.value] >= order[minRole];
  }

  return { user, role, theme, loading, themes, roles, roleLabels, checkAuth, login, logout, saveTheme, applyTheme, initTheme, hasAccess };
});
