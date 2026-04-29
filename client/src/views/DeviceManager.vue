<template>
  <div v-if="tab === 'devices'" class="tab-panel">
    <h2 class="tab-title">📱 设备管理</h2>

    <!-- 待批准列表 -->
    <section v-if="pending.length > 0" class="device-section">
      <h3 class="section-title">待批准的设备</h3>
      <div v-for="d in pending" :key="d.requestId || d.deviceId" class="device-card pending">
        <div class="device-info">
          <span class="device-platform">{{ d.platform || d.clientId || '未知设备' }}</span>
          <span class="device-id">{{ d.deviceId?.slice(0, 12) }}...</span>
          <span class="badge badge-pending">待批准</span>
        </div>
        <button class="btn-sm btn-approve" @click="approve(d.requestId)">✅ 批准</button>
      </div>
    </section>

    <!-- 已配对列表 -->
    <section class="device-section">
      <h3 class="section-title">已配对的设备 <span class="count">{{ paired.length }}</span></h3>
      <div v-for="d in paired" :key="d.deviceId" class="device-card">
        <div class="device-info">
          <span class="device-platform">{{ d.platform || d.clientId || '未知' }}</span>
          <span class="device-id">{{ d.deviceId?.slice(0, 12) }}...</span>
          <span class="badge badge-paired">已配对</span>
          <span class="badge badge-role">{{ d.role || 'operator' }}</span>
        </div>
        <button class="btn-sm btn-remove" @click="removeDevice(d.deviceId)">🗑️ 移除</button>
      </div>
    </section>

    <p v-if="loading" class="loading-text">加载中...</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';

const props = defineProps({ tab: String });
const pending = ref([]);
const paired = ref([]);
const loading = ref(false);
const error = ref('');

const api = axios.create({ baseURL: '', withCredentials: true });

async function loadDevices() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/api/admin/devices');
    pending.value = res.data.pending || [];
    paired.value = res.data.paired || [];
  } catch (e) {
    error.value = '加载设备列表失败';
  } finally {
    loading.value = false;
  }
}

async function approve(requestId) {
  try {
    await api.post('/api/admin/devices/approve', { requestId });
    await loadDevices();
  } catch (e) {
    error.value = '批准失败';
  }
}

async function removeDevice(deviceId) {
  if (!confirm('确定移除该设备？')) return;
  try {
    await api.post('/api/admin/devices/remove', { deviceId });
    await loadDevices();
  } catch (e) {
    error.value = '移除失败';
  }
}

watch(() => props.tab, (val) => { if (val === 'devices') loadDevices(); });
onMounted(() => { if (props.tab === 'devices') loadDevices(); });
</script>

<style scoped>
.device-section { margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; }
.count { color: var(--text-muted); font-size: 12px; margin-left: 6px; }
.device-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  transition: border-color 0.2s;
}
.device-card.pending { border-color: var(--warning); }
.device-info { display: flex; align-items: center; gap: 10px; }
.device-platform { color: var(--text-primary); font-size: 14px; }
.device-id { color: var(--text-muted); font-size: 11px; font-family: monospace; }
.badge {
  font-size: 10px; padding: 2px 8px; border-radius: 6px; font-weight: 500;
}
.badge-pending { background: rgba(255, 189, 89, 0.18); color: var(--warning); }
.badge-paired { background: var(--badge-bg); color: var(--badge-text); }
.badge-role { background: rgba(100, 120, 255, 0.15); color: #8898ff; }
.btn-sm {
  padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 12px; transition: all 0.2s;
}
.btn-approve { background: var(--success); color: #0a0b1e; }
.btn-approve:hover { filter: brightness(1.15); }
.btn-remove { background: rgba(255, 107, 107, 0.12); color: var(--danger); }
.btn-remove:hover { background: rgba(255, 107, 107, 0.22); }
.loading-text { color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px; }
.error-text { color: var(--danger); font-size: 13px; }

@media (max-width: 600px) {
  .device-card { flex-direction: column; align-items: flex-start; gap: 10px; }
  .device-info { flex-wrap: wrap; }
  .device-info .btn-sm { align-self: flex-end; }
}
</style>
