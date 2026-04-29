import { createRouter, createWebHistory } from 'vue-router';
import Chat from '../views/Chat.vue';
import Dashboard from '../views/Dashboard.vue';
import Login from '../views/Login.vue';
import Admin from '../views/Admin.vue';
import ChangePassword from '../views/ChangePassword.vue';

const routes = [
  { path: '/chat', name: 'Chat', component: Chat },
  { path: '/login', name: 'Login', component: Login },
  { path: '/', name: 'Dashboard', component: Dashboard },
  { path: '/admin', name: 'Admin', component: Admin },
  { path: '/change-password', name: 'ChangePassword', component: ChangePassword },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
