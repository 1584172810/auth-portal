import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

const api = axios.create({ baseURL: '' });

// Token persistence
const TOKEN_KEY = 'oc_token';
function loadToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function saveToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {} }

// Attach token to every request
api.interceptors.request.use(config => {
  const t = loadToken();
  if (t) config.headers['Authorization'] = 'Bearer ' + t;
  return config;
});

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const role = ref(null);
  const theme = ref('aurora');
  const loading = ref(true);

  const themes = [
    { id: 'aurora', label: '\u8D5B\u535A\u6781\u5149', icon: '\uD83C\uDF0C' },
    { id: 'sunset', label: '\u65E5\u843D\u6D77\u5CB8', icon: '\uD83C\uDF05' },
    { id: 'forest', label: '\u68EE\u6797\u6668\u9732', icon: '\uD83C\uDF3F' },
  ];

  const roles = ['admin', 'manager', 'user'];
  const roleLabels = { admin: '\u7BA1\u7406\u5458', manager: '\u8FD0\u8425', user: '\u666E\u901A\u7528\u6237' };

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
    const t = loadToken();
    if (!t) { loading.value = false; return false; }
    try {
      const res = await api.get('/api/me');
      user.value = res.data.username;
      role.value = res.data.role;
      applyTheme(res.data.theme || 'aurora');
      return true;
    } catch {
      user.value = null;
      role.value = null;
      saveToken(null);
      return false;
    } finally { loading.value = false; }
  }

  async function login(username, password) {
    const res = await api.post('/api/login', { username, password });
    if (res.data.ok && res.data.token) {
      saveToken(res.data.token);
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
    saveToken(null);
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
