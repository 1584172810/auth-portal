import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router/index.js';
import App from './App.vue';
import './style.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.mount('#app');

// Initialize theme from localStorage before Vue renders
import { useAuthStore } from './stores/auth.js';
const store = useAuthStore();
if (!store.initTheme()) {
  // No saved theme, try server on mount
}
