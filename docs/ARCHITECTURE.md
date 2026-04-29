# Auth Portal — 架构与开发文档（v1）

## 项目概述

Auth Portal 是 OpenClaw Gateway 的前置认证网关，提供：
- 用户登录/登出（JWT + httpOnly Cookie）
- 三级角色权限（admin / manager / user）
- 后台用户管理（CRUD、角色分配、密码重置）
- 网关令牌管理（查看、生成、切换、删除）
- OpenClaw Gateway 页面的认证代理

---

## 目录结构

```
auth-portal/
├── client/                    # Vue 3 前端
│   ├── src/
│   │   ├── main.js            # 入口（Pinia + Vue Router + Vite）
│   │   ├── style.css          # 三套主题 CSS 变量
│   │   ├── App.vue            # 根组件
│   │   ├── router/index.js    # 路由配置
│   │   ├── stores/auth.js     # Pinia 认证状态管理
│   │   └── views/
│   │       ├── Login.vue      # 登录页
│   │       ├── Dashboard.vue  # 首页（两个按钮入口）
│   │       ├── Admin.vue      # 后台管理（用户+令牌）
│   │       └── ChangePassword.vue  # 修改密码页
│   ├── vite.config.js         # Vite 配置（base: /portal-assets/）
│   └── package.json           # Vue 3 + Pinia + Axios + Vue Router
├── server/
│   ├── index.js               # Express 服务端（核心）
│   ├── auth.db                # SQLite 数据库
│   ├── package.json           # Express + JWT + bcrypt + sql.js
│   └── node_modules/
└── docs/
    └── ARCHITECTURE.md        # 本文档
```

---

## 架构图

```
浏览器
  │
  ▼ HTTPS :443
  │
Nginx（反向代理）
  │
  ├── /_openclaw/* ──────────────► Gateway (18789)
  ├── /__openclaw/*                │
  ├── /avatar/*                    │
  ├── /sw.js /manifest             │
  ├── /apple-touch-icon*           │
  │                                │
  └── /* ─────────────────► Auth Portal (3000)
                                │
                           ┌────┤
                           │    │  ┌─ /api/login
                           │    ├── /api/me
                           │    ├── /api/admin/*
                           │    └── / (SPA fallback)
                           │
                           └────► Gateway (18789)
                              (/_openclaw proxy)
```

### 路由映射表

| URL 路径 | 目标 | 认证 |
|----------|------|------|
| `/_openclaw/*` | Gateway (Nginx 直连) | **无**（Nginx 层跳过 Portal） |
| `/__openclaw/*` | Gateway (Nginx 直连) | 无 |
| `/avatar/*` | Gateway (Nginx 直连) | 无 |
| `/sw.js` | Gateway (Nginx 直连) | 无 |
| `/manifest.webmanifest` | Gateway (Nginx 直连) | 无 |
| `/apple-touch-icon*` | Gateway (Nginx 直连) | 无 |
| `/login` | Portal → SPA | 无 |
| `/` | Portal → SPA | **JWT** |
| `/api/login`, `/api/logout` | Portal → 自身 | 无（登录接口） |
| `/api/me` | Portal → 自身 | **JWT** |
| `/api/theme` | Portal → 自身 | **JWT** |
| `/api/change-password` | Portal → 自身 | **JWT** |
| `/api/admin/*` | Portal → 自身 | **JWT + 角色** |
| `/portal-assets/*` | Portal → 静态文件 | 无 |
| `wss://域名/` | Portal → Gateway WS | 无（直通） |

> **注意：** `/_openclaw/` 目前由 Nginx 直连 Gateway，**不经过 Portal 的 JWT 认证**。如果要加认证保护，需要改 Nginx 将所有 `/_openclaw/` 请求先发到 Portal，Portal 再代理到 Gateway。

---

## Nginx 配置

位于 `/etc/nginx/conf.d/openclaw.conf`

关键点：
- `/_openclaw/` 的 `proxy_pass` 末尾带 `/`！这会**剥掉匹配前缀**，所以 `/_openclaw/assets/xxx.js` 变成 `/assets/xxx.js` 到 Gateway
- 所有 Gateway 根路径资源（`__openclaw`, `avatar`, `sw.js` 等）也直通 Gateway
- 其他 `location /` 走 Portal，包括 WebSocket 升级（`Upgrade: websocket`）

### 常见陷阱

**`proxy_pass` 末尾斜杠的作用：**
```nginx
location /_openclaw/ {
    proxy_pass http://127.0.0.1:18789/;  # 有 / → 剥掉 /_openclaw/ 前缀
}
```
如果客户端请求 `https://domain/_openclaw/assets/app.js`，Gateway 收到的是 `GET /assets/app.js`。

---

## 服务端 (server/index.js)

### 核心依赖

| 包 | 用途 |
|----|------|
| express | HTTP 框架 |
| cookie-parser | 解析 httpOnly JWT cookie |
| jsonwebtoken | JWT 签发/验证 |
| bcryptjs | 密码哈希（纯 JS） |
| sql.js | SQLite（WebAssembly） |
| http-proxy-middleware | HTTP/WebSocket 代理到 Gateway |

### 中间件链（按顺序）

1. `cookieParser()` — 解析 Cookie
2. `express.json()` — 解析 JSON body
3. `/_openclaw` 代理 — **JWT 认证 → Gateway 转发**（⚠️ 当前 Nginx 层直连 Gateway，此路由未使用）
4. `/api/login` — 登录（验证密码 → 签发 JWT → httpOnly Cookie）
5. `/api/logout` — 清除 Cookie
6. `/api/me` — JWT → 返回用户信息
7. `/api/theme` — 保存主题偏好
8. `/api/change-password` — 修改密码
9. `/api/admin/users` — **JWT + role=admin** 保护
10. `/api/admin/gateway-token` — **JWT + role>=manager** 保护
11. `/api/admin/tokens` — **JWT + role>=manager** 保护
12. Gateway 直通路由（`/sw.js`, `/__openclaw` 等）
13. SPA fallback — `get('*')` 返回 index.html

### Token 存储

```
GET  /api/admin/gateway-token          → 读取 /root/.openclaw/openclaw.json
POST /api/admin/gateway-token/regenerate → 重新生成并写入配置文件
GET  /api/admin/tokens                 → 列出令牌库（SQLite auth.tokens）
POST /api/admin/tokens                 → 创建新令牌
POST /api/admin/tokens/:id/apply       → 将令牌库中的令牌设为当前
DELETE /api/admin/tokens/:id           → 删除令牌
```

### 数据库 (SQLite)

```
auth.db
├── users
│   ├── id           INTEGER PK AUTOINCREMENT
│   ├── username     TEXT UNIQUE NOT NULL
│   ├── password     TEXT NOT NULL (bcrypt hash)
│   ├── role         TEXT DEFAULT 'user'  (admin|manager|user)
│   ├── theme        TEXT DEFAULT 'aurora'
│   └── created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
└── tokens
    ├── id           INTEGER PK AUTOINCREMENT
    ├── name         TEXT NOT NULL
    ├── token        TEXT UNIQUE NOT NULL
    └── created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
```

### JWT

| 字段 | 说明 |
|------|------|
| payload | `{ id, username, role, theme, iat, exp }` |
| 有效期 | 72 小时（`JWT_EXPIRES`） |
| 存储 | httpOnly Cookie（`auth_token`） |
| 算法 | HS256 |

### 角色系统

```
角色等级: admin(3) > manager(2) > user(1)
保护中间件:
  - reqAdmin  → 需要 role=admin（用户管理、密码重置、角色修改）
  - reqManager → 需要 role>=manager（令牌管理、配置查看）
```

**特殊规则：**
- 用户 ID=1（`admin`）不允许删除或改角色
- 每次启动时种子管理员强制设为 `admin` 角色
- `hasAccess('manager')` 在前端控制按钮显隐

---

## 前端 (client/)

### 技术栈

- Vue 3 (Composition API + `<script setup>`)
- Pinia（状态管理）
- Vue Router 4（SPA，`createWebHistory`）
- Axios（HTTP 请求，`withCredentials: true`）
- Vite 8（构建工具）

### 注意点

**`vite.config.js`：**
```js
export default defineConfig({
  base: '/portal-assets/',   // 避免与 Gateway 的 /assets/ 冲突
  build: {
    assetsDir: '',
    rollupOptions: {
      output: {
        entryFileNames: 'app-[hash].js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: 'style-[hash][extname]'
      }
    }
  }
})
```

**Auth Store (`stores/auth.js`)：**
- 提供 `hasAccess(minRole)` 方法前端检查权限
- `checkAuth()` 在组件 onMounted 时调用
- 主题偏好同步到 localStorage + 服务端

**路由守卫：**
- Dashboard → `onMounted` 调 `checkAuth()`，未登录跳转 `/login`
- Admin → 自己调 API，`hasAccess('manager')` 否则跳转 `/`

---

## 构建与部署

```bash
# 前端构建
cd /root/.openclaw/workspace/auth-portal/client
npm run build

# 重启后端
kill $(fuser 3000/tcp)
cd /root/.openclaw/workspace/auth-portal/server
nohup node index.js > /tmp/auth-portal.log 2>&1 &
```

**注意事项：**
- 前端构建后在 `client/dist/`，服务端通过 `express.static('/portal-assets')` 提供
- 每次前端变更后**必须重新构建**
- 如果新构建的 JS hash 变化，浏览器需要 **Ctrl+F5 强制刷新**
- 静态资源占用通过 `vite.config.js` 的 `base: '/portal-assets/'` 避免与 Gateway 冲突

---

## 已知问题

1. **`/_openclaw/` 路径未经过 JWT 认证** — Nginx 直连 Gateway。如果要加认证保护，需要：
   - Nginx 将 `/_openclaw/*` 发到 Portal
   - Portal 还原 `/_openclaw/` 代理的 JWT 认证
   - 但需要处理 Gateway 子资源（JS/CSS）的加载路径问题
2. **WebSocket 根路径（`wss://域名/`）无法携带 httpOnly Cookie** — 浏览器 `new WebSocket()` 不会自动附带 cookie。Portal 放弃了对根路径 WS 的 JWT 检查
3. **Service Worker 因自签名 SSL 证书报错** — 不影响功能
4. **数据库重置** — 重建 `auth.db` 会丢失所有用户和令牌数据

---

## 开发指引

### 添加新 API

1. 在 `server/index.js` 添加 Express 路由
2. 如果需要认证，加 `reqAdmin` 或 `reqManager` 中间件
3. 如果需要前端页面，在 `client/src/views/` 创建组件
4. 在 `client/src/router/index.js` 注册路由
5. 重新构建前端并重启服务端

### 添加新角色

1. 更新 `server/index.js` 中的 `ROLES` 数组和 `hasRole` 的 order
2. 更新 `client/src/stores/auth.js` 中的 `roles` 和 `roleLabels`
3. 更新中间件 `reqAdmin` / `reqManager` 的逻辑
4. 更新所有涉及角色判断的前端组件

### 修改主题

1. 在 `client/src/style.css` 添加 CSS 变量组
2. 在 `client/src/stores/auth.js` 的 `themes` 数组添加主题配置
3. 主题 ID 需要在服务端 `/api/theme` 的白名单中注册
