<template>
  <div class="admin-page">
    <div class="top-bar">
      <a href="/" class="btn-back">← 首页</a>
      <span class="user-badge">{{ auth.user }}</span>
      <span class="role-tag">{{ auth.roleLabels[auth.role] }}</span>
      <div class="theme-picker">
        <button v-for="t in auth.themes" :key="t.id" :class="['theme-btn', { active: auth.theme === t.id }]" @click="auth.saveTheme(t.id)" :title="t.label">
          <span class="ti">{{ t.icon }}</span>
          <span class="tl">{{ t.label }}</span>
        </button>
      </div>
      <button @click="handleLogout" class="btn-logout">退出</button>
    </div>

    <div class="container">
      <div class="tabs">
        <button :class="['tab', { active: tab === 'users' }]" @click="tab = 'users'">👥 用户管理</button>
        <button :class="['tab', { active: tab === 'tokens' }]" @click="tab = 'tokens'">🔑 网关令牌</button>
        <button :class="['tab', { active: tab === 'devices' }]" @click="tab = 'devices'">📱 设备管理</button>
      </div>

      <!-- 👥 用户管理 -->
      <div v-if="tab === 'users'" class="tab-content">
        <div class="card">
          <div class="card-header">
            <h2>用户管理</h2>
            <button v-if="isAdmin" class="btn-sm btn-primary" @click="showCreate = true">+ 添加</button>
          </div>
          <div v-if="showCreate && isAdmin" class="form-inline">
            <input v-model="newUser.username" placeholder="用户名" class="input-sm" />
            <input v-model="newUser.password" type="password" placeholder="密码" class="input-sm" />
            <select v-model="newUser.role" class="input-sm">
              <option v-for="r in roles" :key="r" :value="r">{{ roleLabels[r] || r }}</option>
            </select>
            <button class="btn-sm btn-primary" @click="createUser" :disabled="creating">{{ creating ? '创建中…' : '创建' }}</button>
            <button class="btn-sm btn-ghost" @click="showCreate = false">取消</button>
          </div>
          <p v-if="userMsg" :class="userMsgType" class="msg">{{ userMsg }}</p>
          <table class="table">
            <thead><tr>
              <th>ID</th><th>用户名</th><th>角色</th><th>创建时间</th>
              <th v-if="isAdmin">操作</th>
            </tr></thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>{{ u.id }}</td>
                <td>{{ u.username }}</td>
                <td>
                  <span v-if="isAdmin && u.username !== 'admin'" class="role-select-wrap">
                    <select v-model="u.role" @change="changeRole(u)" class="role-select">
                      <option v-for="r in roles" :key="r" :value="r">{{ roleLabels[r] || r }}</option>
                    </select>
                  </span>
                  <span v-else class="role-name">{{ roleLabels[u.role] || u.role }}</span>
                </td>
                <td>{{ u.created_at }}</td>
                <td v-if="isAdmin" class="actions">
                  <button class="btn-sm btn-warning" @click="resetPw(u)">重置密码</button>
                  <button v-if="u.username !== 'admin'" class="btn-sm btn-danger" @click="deleteUser(u)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="resetTarget" class="modal-overlay" @click.self="resetTarget = null">
          <div class="modal">
            <h3>重置 {{ resetTarget.username }} 的密码</h3>
            <input v-model="resetPwVal" type="password" placeholder="新密码（至少6位）" class="input-full" />
            <div class="modal-actions">
              <button class="btn-sm btn-primary" @click="doResetPw">保存</button>
              <button class="btn-sm btn-ghost" @click="resetTarget = null">取消</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 🔑 网关令牌 -->
      <div v-if="tab === 'tokens'" class="tab-content">
        <div class="card">
          <div class="card-header"><h2>当前网关令牌</h2></div>
          <p class="desc">正在被 OpenClaw Gateway 使用的活跃令牌。</p>
          <div class="token-display">
            <code class="token-value">{{ activeToken || '加载中…' }}</code>
          </div>
          <div class="token-actions">
            <button class="btn-sm btn-primary" @click="copy(activeToken)" :disabled="!activeToken">{{ copied === 'active' ? '已复制' : '📋 复制' }}</button>
            <button v-if="isManager" class="btn-sm btn-danger" @click="regenerateActive" :disabled="regenerating">{{ regenerating ? '生成中…' : '🔄 重新生成' }}</button>
          </div>
          <div v-if="isManager" class="warning">⚠️ 修改活跃令牌会断开当前所有连接的设备。</div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>令牌库</h2>
            <button v-if="isManager" class="btn-sm btn-primary" @click="showAddToken = true">+ 新建令牌</button>
          </div>
          <div v-if="showAddToken && isManager" class="form-inline">
            <input v-model="newTokenName" placeholder="令牌名称" class="input-sm" />
            <button class="btn-sm btn-primary" @click="createToken" :disabled="tokenCreating">{{ tokenCreating ? '创建中…' : '创建' }}</button>
            <button class="btn-sm btn-ghost" @click="showAddToken = false">取消</button>
          </div>
          <p v-if="tokenMsg" :class="tokenMsgType" class="msg">{{ tokenMsg }}</p>
          <div v-if="tokens.length === 0" class="empty-state">暂无保存的令牌</div>
          <div v-for="tk in tokens" :key="tk.id" class="token-card">
            <div class="token-info">
              <span class="token-name">{{ tk.name }}</span>
              <span class="token-date">{{ tk.created_at }}</span>
            </div>
            <code class="token-code">{{ tk.token.substring(0, 12) }}…{{ tk.token.slice(-6) }}</code>
            <div class="token-card-actions">
              <button class="btn-sm btn-primary" @click="copy(tk.token)">{{ copied === 't_' + tk.id ? '已复制' : '📋 复制' }}</button>
              <button v-if="isManager" class="btn-sm btn-success" @click="applyToken(tk)" :disabled="applying === tk.id">{{ applying === tk.id ? '应用中…' : '✅ 设为当前' }}</button>
              <button v-if="isManager" class="btn-sm btn-danger" @click="deleteToken(tk)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 📱 设备管理 -->
      <DeviceManager :tab="tab" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';
import DeviceManager from './DeviceManager.vue';

const auth = useAuthStore();
const api = axios.create({ withCredentials: true });
const isAdmin = computed(() => auth.role === 'admin');
const isManager = computed(() => auth.hasAccess('manager'));
const roles = ['admin', 'manager', 'user'];
const roleLabels = { admin: '管理员', manager: '运营', user: '普通用户' };
const tab = ref('users');
const users = ref([]);
const showCreate = ref(false);
const creating = ref(false);
const newUser = ref({ username: '', password: '', role: 'user' });
const userMsg = ref('');
const userMsgType = ref('');
const resetTarget = ref(null);
const resetPwVal = ref('');
const activeToken = ref('');
const regenerating = ref(false);
const tokens = ref([]);
const showAddToken = ref(false);
const newTokenName = ref('');
const tokenCreating = ref(false);
const tokenMsg = ref('');
const tokenMsgType = ref('');
const applying = ref(null);
const copied = ref('');

onMounted(async () => {
  try {
    const res = await api.get('/api/me');
    if (!res.data.ok) { window.location.href = '/login'; return; }
    auth.user = res.data.username;
    auth.role = res.data.role;
    auth.applyTheme(res.data.theme || 'aurora');
    if (!auth.hasAccess('manager')) { window.location.href = '/'; return; }
    loadUsers(); loadActiveToken(); loadTokens();
  } catch { window.location.href = '/login'; }
});

async function loadUsers() { try { const r = await api.get('/api/admin/users'); users.value = r.data.users; } catch { userMsg.value = '加载失败'; userMsgType.value = 'error'; } }
async function loadActiveToken() { try { const r = await api.get('/api/admin/gateway-token'); activeToken.value = r.data.tokenFull; } catch {} }
async function loadTokens() { try { const r = await api.get('/api/admin/tokens'); tokens.value = r.data.tokens; } catch {} }
async function createUser() { if (!newUser.value.username || !newUser.value.password) return; creating.value = true; try { await api.post('/api/admin/users', newUser.value); userMsg.value = '创建成功'; userMsgType.value = 'success'; newUser.value = { username: '', password: '', role: 'user' }; showCreate.value = false; loadUsers(); } catch (e) { userMsg.value = e.response?.data?.message || '失败'; userMsgType.value = 'error'; } finally { creating.value = false; } }
async function deleteUser(u) { if (!confirm('删除用户 ' + u.username + '？')) return; try { await api.delete('/api/admin/users/' + u.id); userMsg.value = '已删除'; userMsgType.value = 'success'; loadUsers(); } catch (e) { userMsg.value = e.response?.data?.message || '失败'; userMsgType.value = 'error'; } }
function resetPw(u) { resetTarget.value = u; resetPwVal.value = ''; }
async function doResetPw() { if (!resetPwVal.value || resetPwVal.value.length < 6) return; try { await api.post('/api/admin/users/' + resetTarget.value.id + '/reset-password', { password: resetPwVal.value }); userMsg.value = '密码已重置'; userMsgType.value = 'success'; resetTarget.value = null; } catch (e) { userMsg.value = e.response?.data?.message || '失败'; userMsgType.value = 'error'; } }
async function changeRole(u) { try { await api.post('/api/admin/users/' + u.id + '/role', { role: u.role }); userMsg.value = '角色已更新'; userMsgType.value = 'success'; } catch { userMsg.value = '更新失败'; userMsgType.value = 'error'; } }
async function copy(val) { if (!val) return; try { await navigator.clipboard.writeText(val); } catch { const ta = document.createElement('textarea'); ta.value = val; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } copied.value = val; setTimeout(() => copied.value = '', 2000); }
async function regenerateActive() { if (!confirm('重新生成当前网关令牌？')) return; regenerating.value = true; try { const r = await api.post('/api/admin/gateway-token/regenerate'); activeToken.value = r.data.tokenFull; tokenMsg.value = '已重新生成'; tokenMsgType.value = 'success'; } catch (e) { tokenMsg.value = e.response?.data?.message || '失败'; tokenMsgType.value = 'error'; } finally { regenerating.value = false; } }
async function createToken() { if (!newTokenName.value.trim()) return; tokenCreating.value = true; try { await api.post('/api/admin/tokens', { name: newTokenName.value.trim() }); tokenMsg.value = '令牌已创建'; tokenMsgType.value = 'success'; newTokenName.value = ''; showAddToken.value = false; loadTokens(); } catch (e) { tokenMsg.value = e.response?.data?.message || '失败'; tokenMsgType.value = 'error'; } finally { tokenCreating.value = false; } }
async function deleteToken(tk) { if (!confirm('删除令牌「' + tk.name + '」？')) return; try { await api.delete('/api/admin/tokens/' + tk.id); tokenMsg.value = '已删除'; tokenMsgType.value = 'success'; loadTokens(); } catch (e) { tokenMsg.value = e.response?.data?.message || '失败'; tokenMsgType.value = 'error'; } }
async function applyToken(tk) { applying.value = tk.id; try { const r = await api.post('/api/admin/tokens/' + tk.id + '/apply'); activeToken.value = r.data.token; tokenMsg.value = '已切换为「' + tk.name + '」'; tokenMsgType.value = 'success'; } catch (e) { tokenMsg.value = e.response?.data?.message || '失败'; tokenMsgType.value = 'error'; } finally { applying.value = null; } }
async function handleLogout() { await auth.logout(); window.location.href = '/'; }
</script>

<style scoped>
.admin-page { min-height: 100vh; background: var(--page-bg); color: var(--text-primary); padding: 24px; transition: background 0.4s ease, color 0.3s ease; }
.top-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.btn-back { color: var(--text-secondary); text-decoration: none; font-size: 14px; padding: 6px 12px; border-radius: 8px; transition: all 0.2s; }
.btn-back:hover { background: var(--card-bg); color: var(--text-primary); }
.user-badge { color: var(--text-primary); font-size: 14px; font-weight: 600; }
.role-tag { font-size: 11px; background: var(--badge-bg); color: var(--badge-text); padding: 2px 8px; border-radius: 6px; }
.theme-picker { display: flex; gap: 4px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 4px; margin-left: auto; }
.theme-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; transition: all 0.2s; }
.theme-btn:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
.theme-btn.active { background: var(--accent); color: var(--btn-text); }
.ti { font-size: 14px; } .tl { font-size: 11px; white-space: nowrap; }
.btn-logout { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); color: var(--danger); padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
.btn-logout:hover { background: rgba(255,107,107,0.2); }
.container { max-width: 860px; margin: 0 auto; }
.tabs { display: flex; gap: 8px; margin-bottom: 24px; }
.tab { padding: 10px 20px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-secondary); border-radius: 10px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.tab.active { background: var(--accent); color: var(--btn-text); border-color: transparent; }
.tab:hover:not(.active) { background: var(--card-bg); opacity: 0.8; }
.card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: var(--card-shadow); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h2 { color: var(--text-primary); font-size: 18px; margin: 0; }
.desc { color: var(--text-secondary); font-size: 13px; margin: 0 0 16px; }
.empty-state { color: var(--text-muted); text-align: center; padding: 24px; font-size: 14px; }
.form-inline { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.input-sm { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary); font-size: 13px; outline: none; min-width: 120px; }
.input-sm:focus, .input-full:focus { border-color: var(--input-focus-border); }
.input-full { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary); font-size: 14px; outline: none; box-sizing: border-box; margin-bottom: 12px; }
select.input-sm { cursor: pointer; min-width: 100px; }
.table { width: 100%; border-collapse: collapse; }
.table th { text-align: left; color: var(--text-muted); font-size: 12px; padding: 8px 12px; border-bottom: 1px solid var(--card-border); }
.table td { padding: 10px 12px; border-bottom: 1px solid var(--card-border); font-size: 14px; }
.table tr:hover td { background: rgba(255,255,255,0.02); }
.actions { display: flex; gap: 6px; }
.role-name { color: var(--text-secondary); font-size: 13px; }
.role-select-wrap { display: inline-block; }
.role-select { padding: 3px 6px; border-radius: 6px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary); font-size: 12px; cursor: pointer; outline: none; }
.btn-sm { padding: 6px 12px; border-radius: 8px; border: none; font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--btn-text); }
.btn-primary:hover { opacity: 0.85; }
.btn-success { background: var(--accent); color: var(--btn-text); opacity: 0.85; }
.btn-success:hover { opacity: 1; }
.btn-warning { background: rgba(234,179,8,0.2); color: var(--warning); border: 1px solid rgba(234,179,8,0.3); }
.btn-warning:hover { background: rgba(234,179,8,0.3); }
.btn-danger { background: rgba(255,107,107,0.2); color: var(--danger); border: 1px solid rgba(255,107,107,0.3); }
.btn-danger:hover { background: rgba(255,107,107,0.3); }
.btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--input-border); }
.btn-ghost:hover { background: var(--card-bg); }
.msg { font-size: 13px; margin: 0 0 12px; }
.error { color: var(--danger); } .success { color: var(--success); }
.token-display { margin: 16px 0; }
.token-value { display: block; background: var(--input-bg); padding: 14px 16px; border-radius: 10px; font-family: 'SF Mono','Fira Code',monospace; font-size: 13px; color: var(--success); word-break: break-all; border: 1px solid var(--input-border); }
.token-actions { display: flex; gap: 8px; margin: 16px 0; }
.warning { background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.2); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--warning); }
.token-card { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--card-border); border-radius: 12px; margin-bottom: 10px; background: rgba(255,255,255,0.02); }
.token-card:hover { background: rgba(255,255,255,0.04); }
.token-info { flex: 1; min-width: 120px; }
.token-name { color: var(--text-primary); font-size: 14px; font-weight: 600; display: block; }
.token-date { color: var(--text-muted); font-size: 11px; }
.token-code { font-family: 'SF Mono','Fira Code',monospace; font-size: 12px; color: var(--text-secondary); background: var(--input-bg); padding: 6px 10px; border-radius: 6px; }
.token-card-actions { display: flex; gap: 6px; }
.modal-overlay { position: fixed; inset: 0; background: var(--modal-overlay); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px; width: 360px; max-width: 90vw; box-shadow: var(--card-shadow); }
.modal h3 { color: var(--text-primary); margin: 0 0 16px; font-size: 16px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
