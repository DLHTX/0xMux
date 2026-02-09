# 实现计划：密码鉴权与公网安全访问

**日期**: 2026-02-09
**分支**: `3-password-auth`
**Spec**: [spec.md](./spec.md)

---

## 技术上下文

| 维度 | 详情 |
|------|------|
| 后端框架 | Rust + Axum 0.8 + tokio |
| 前端框架 | React 19 + TypeScript + Tailwind CSS 4 + Vite 7 |
| 密码哈希 | Argon2id (`argon2` crate 0.5) |
| Token 方案 | HMAC-SHA256 签名 token，无状态验证 |
| 配置文件 | `~/.config/0xmux/config.toml`，TOML 格式 |
| 速率限制 | 内存 HashMap 滑动窗口 |
| 现有 UI 组件 | Modal、Tabs、Toggle、Input、Button 均可复用 |

---

## Phase 1: 后端核心鉴权系统

### 1.1 配置文件服务

**目标**: 实现 TOML 配置文件的读写能力

**新建文件**: `server/src/services/config_file.rs`

**改动**:
- 新建 `PersistentConfig` 结构体，包含 `[auth]` 和 `[access]` 两部分
- 实现 `load()` — 从 `~/.config/0xmux/config.toml` 读取，不存在时返回默认值
- 实现 `save()` — 写入 TOML 文件，自动创建目录，设置 0600 权限
- 使用 `dirs::config_dir()` 获取平台无关的配置目录

**依赖新增** (`Cargo.toml`): `toml = "0.8"`

### 1.2 Auth 数据模型

**新建文件**: `server/src/models/auth.rs`

**模型**:
- `SetupRequest { password, confirm }` — 设置密码请求
- `LoginRequest { password }` — 登录请求
- `ChangePasswordRequest { current, password, confirm }` — 修改密码请求
- `AuthStatusResponse { initialized }` — 鉴权状态响应
- `TokenResponse { token }` — token 响应
- `AccessConfigResponse { external_access, allow_remote_install, allow_remote_restart, listen_address, lan_ip, restart_required }` — 外部访问配置响应
- `UpdateAccessRequest { external_access, allow_remote_install, allow_remote_restart }` — 更新外部访问请求

**修改**: `server/src/models/mod.rs` 注册新模块

### 1.3 Auth 服务

**新建文件**: `server/src/services/auth.rs`

**功能**:
- `hash_password(password) -> String` — Argon2id 哈希
- `verify_password(password, hash) -> bool` — 验证密码
- `generate_token(secret_key) -> String` — 签发 HMAC token
- `verify_token(token, secret_key) -> bool` — 验证 token（含过期检查）
- `derive_secret_key(password_hash) -> Vec<u8>` — 从密码哈希派生 HMAC 密钥
- `check_rate_limit(ip, rate_limits) -> Result<(), (String, u64)>` — 速率限制检查
- `record_attempt(ip, rate_limits)` — 记录登录尝试

**依赖新增** (`Cargo.toml`): `argon2 = "0.5"`, `rand = "0.8"`, `hmac = "0.12"`, `sha2 = "0.10"`, `hex = "0.4"`

### 1.4 AppState 扩展

**修改文件**: `server/src/state.rs`

**新增字段**:
- `auth_config: Arc<RwLock<PersistentConfig>>` — 持久化配置
- `rate_limits: Arc<RwLock<HashMap<IpAddr, RateLimitEntry>>>` — 速率限制

**修改文件**: `server/src/main.rs`
- 启动时调用 `PersistentConfig::load()` 加载配置
- 如果配置中 `external_access == true`，绑定 `0.0.0.0` 而非 `127.0.0.1`
- 将配置注入 `AppState`

### 1.5 错误类型扩展

**修改文件**: `server/src/error.rs`

**新增变体**:
- `Unauthorized(String)` → HTTP 401
- `Forbidden(String)` → HTTP 403
- `TooManyRequests { message: String, retry_after: u64 }` → HTTP 429

### 1.6 Auth Handlers

**新建文件**: `server/src/handlers/auth.rs`

**端点**:
- `get_auth_status` — `GET /api/auth/status`
- `setup_password` — `POST /api/auth/setup`
- `login` — `POST /api/auth/login`（含速率限制）
- `change_password` — `PUT /api/auth/password`

**修改**: `server/src/handlers/mod.rs` 注册新模块

### 1.7 鉴权中间件

**新建文件**: `server/src/middleware.rs`

**功能**:
- `auth_middleware` — Axum `middleware::from_fn_with_state` 兼容
- 从请求中提取 token（Header → Query → Cookie 优先级）
- 调用 `verify_token()` 验证
- 通过: 继续请求链
- 失败: 返回 401 JSON 响应

### 1.8 路由重构 + CORS 收紧

**修改文件**: `server/src/router.rs`

**改动**:
- 将路由分为公开组（白名单）和受保护组
- 受保护组添加 `auth_middleware` layer
- CORS 从 `allow_origin(Any)` 改为动态 predicate（匹配自身源 + 开发模式下 localhost:3000）
- 新增 auth 和 access 路由

**验证检查点**: `cargo build` 通过

---

## Phase 2: 后端外部访问与安全加固

### 2.1 Access Handlers

**新建文件**: `server/src/handlers/access.rs`

**端点**:
- `get_access_config` — `GET /api/access/config`（读取配置 + 检测局域网 IP）
- `update_access_config` — `PUT /api/access/config`（更新配置 + 标记需要重启）

**局域网 IP 检测**: 使用 `std::net::UdpSocket` 连接外部地址获取本机 IP

### 2.2 公网模式中间件

**修改文件**: `server/src/middleware.rs`

**新增**:
- `access_guard_middleware` — 检查外部访问模式下的端点限制
- 在路由中对 `/api/system/install` 和 `/api/system/restart` 应用

### 2.3 路径访问限制

**修改文件**: `server/src/handlers/session.rs`

**改动**:
- `list_dirs` handler 新增路径范围检查
- 外部访问模式下，`path` 参数 canonicalize 后必须在 `$HOME` 前缀下
- 超出范围返回 403

**验证检查点**: `cargo build` 通过

---

## Phase 3: 前端鉴权流程

### 3.1 API 层改造

**修改文件**: `web/src/lib/api.ts`

**改动**:
- `request()` 函数自动从 localStorage 读取 `mux_token`，注入 `Authorization: Bearer` header
- 新增 `onUnauthorized` 回调注册机制（供 AuthProvider 使用）
- 401 响应时调用回调 + 清除 localStorage token

### 3.2 useAuth Hook

**新建文件**: `web/src/hooks/useAuth.ts`

**功能**:
- `AuthProvider` Context Provider
- `useAuth()` hook 返回 `{ status, token, login, setup, logout, changePassword }`
- 启动时调用 `GET /api/auth/status` 确定初始状态
- 注册 api.ts 的 401 回调

### 3.3 设置密码弹框

**新建文件**: `web/src/components/auth/SetupPasswordModal.tsx`

**UI**:
- 不可关闭的 Modal（无关闭按钮，点击背景不关闭）
- 标题: "设置访问密码"
- 密码输入框（带 eye/eye-off 切换）
- 确认密码输入框
- 密码强度指示器（基于长度和字符类型）
- "设置密码"按钮
- 行内错误提示

### 3.4 登录弹框

**新建文件**: `web/src/components/auth/LoginModal.tsx`

**UI**:
- 不可关闭的 Modal
- 密码输入框 + "登录"按钮
- Enter 键提交
- 错误提示（密码错误、速率限制倒计时）
- 错误时输入框抖动动画

### 3.5 App.tsx 集成

**修改文件**: `web/src/App.tsx`

**改动**:
- Provider 层级: `I18nProvider → ThemeProvider → AuthProvider → AppContent`
- `AppContent` 根据 `useAuth().status` 渲染:
  - `loading` → 加载动画
  - `uninitialized` → `SetupPasswordModal`
  - `unauthenticated` → `LoginModal`
  - `authenticated` → 原有主界面

### 3.6 WebSocket Token 注入

**修改文件**: `web/src/hooks/useWebSocket.ts`, `web/src/hooks/usePtySocket.ts`

**改动**:
- WebSocket URL 添加 `?token=<token>` 参数（从 localStorage 读取）
- PTY WebSocket 的 URL 已有 query 参数，改为 `&token=<token>` 追加

**验证检查点**: `npx tsc --noEmit` + `npx vite build` 通过

---

## Phase 4: 前端设置弹框重构

### 4.1 AppearanceTab

**新建文件**: `web/src/components/settings/AppearanceTab.tsx`

**改动**:
- 从 `ThemeConfigurator` 提取所有主题设置内容
- 移除外层面板容器，保留纯内容
- 保持 `useTheme()` 和 `useI18n()` 调用不变

### 4.2 SecurityTab

**新建文件**: `web/src/components/settings/SecurityTab.tsx`

**UI**:
- "修改密码"区域: 当前密码 + 新密码 + 确认新密码 + 保存按钮
- 成功/失败反馈
- 分隔线
- "退出登录"按钮（danger variant）

### 4.3 AccessTab

**新建文件**: `web/src/components/settings/AccessTab.tsx`

**UI**:
- 外部访问 Toggle 开关 + 说明文案
- 安全提醒（开启时显示）
- 当前监听地址
- 局域网 IP 地址（外部访问开启时）
- 危险操作区域（外部访问开启时显示）:
  - 允许远程安装 Toggle
  - 允许远程重启 Toggle
- "立即重启"按钮（有设置变更需要重启时显示）

### 4.4 SettingsModal

**新建文件**: `web/src/components/settings/SettingsModal.tsx`

**结构**:
- Modal 弹框（居中，宽度适中）
- Tabs 组件切换三个 Tab
- 标题栏 "设置" + 关闭按钮

### 4.5 Header 替换

**修改文件**: `web/src/components/layout/Header.tsx`

**改动**:
- 移除 `ThemeConfigurator` 引用
- 替换为 `SettingsModal`
- 设置按钮打开 `SettingsModal`

### 4.6 清理旧组件

**删除/重构**: `web/src/components/settings/ThemeConfigurator.tsx`
- 如果 AppearanceTab 完全替代了 ThemeConfigurator，可以删除原文件
- 或保留作为 AppearanceTab 的 re-export

**验证检查点**: `npx tsc --noEmit` + `npx vite build` 通过

---

## Phase 5: i18n + Icon + 收尾

### 5.1 i18n Key 补充

**修改文件**: `web/src/lib/i18n.ts`

**新增 key** (en + zh):
- `auth.setup.title` / "Set Password" / "设置访问密码"
- `auth.setup.desc` / "Set a password to protect..." / "为 0xMux 设置密码以保护..."
- `auth.setup.button` / "Set Password" / "设置密码"
- `auth.login.title` / "Login" / "登录"
- `auth.login.button` / "Login" / "登录"
- `auth.login.error` / "Wrong password" / "密码错误"
- `auth.login.rate_limit` / "Too many attempts..." / "操作过于频繁..."
- `auth.password` / "Password" / "密码"
- `auth.password.confirm` / "Confirm Password" / "确认密码"
- `auth.password.current` / "Current Password" / "当前密码"
- `auth.password.new` / "New Password" / "新密码"
- `auth.password.min_length` / "At least 6 characters" / "至少 6 个字符"
- `auth.password.mismatch` / "Passwords do not match" / "两次输入不一致"
- `auth.password.changed` / "Password updated" / "密码已更新"
- `auth.logout` / "Logout" / "退出登录"
- `auth.strength.weak` / "Weak" / "弱"
- `auth.strength.medium` / "Medium" / "中"
- `auth.strength.strong` / "Strong" / "强"
- `settings.title` / "Settings" / "设置"
- `settings.appearance` / "Appearance" / "外观"
- `settings.security` / "Security" / "安全"
- `settings.access` / "External Access" / "外部访问"
- `settings.access.toggle` / "Allow external access" / "允许外部访问"
- `settings.access.desc` / "Allow access from external..." / "允许从外部网络访问..."
- `settings.access.warning` / "Please ensure a strong password..." / "请确保已设置强密码..."
- `settings.access.listen` / "Listen Address" / "监听地址"
- `settings.access.lan_ip` / "LAN IP" / "局域网 IP"
- `settings.access.danger` / "Danger Zone" / "危险操作"
- `settings.access.remote_install` / "Allow remote install" / "允许远程安装"
- `settings.access.remote_restart` / "Allow remote restart" / "允许远程重启"
- `settings.access.restart_required` / "Restart required" / "需要重启生效"
- `settings.access.restart_now` / "Restart Now" / "立即重启"

### 5.2 Icon 添加

**修改文件**: `web/src/lib/icons.ts`

**新增**（需先验证存在）:
- `IconLock`
- `IconShield`
- `IconEye`
- `IconEyeOff`
- `IconLogOut`
- `IconGlobe`

### 5.3 最终验证

1. `cd server && cargo build` — Rust 编译通过
2. `cd web && npx tsc --noEmit` — TypeScript 类型检查
3. `cd web && npx vite build` — Vite 构建通过
4. 手动验证完整流程:
   - 首次访问 → 设置密码弹框
   - 退出登录 → 登录弹框
   - 设置 → 三个 Tab 正常
   - 外部访问开关 → 重启提示

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| Argon2id 在低配机器上慢 | 登录响应慢 | 降低参数（内存/迭代）或异步执行 |
| Modal 组件不支持"不可关闭"模式 | 首次设置弹框可被关掉 | 扩展 Modal 组件，新增 `closable` prop |
| CORS 收紧后开发模式异常 | 前后端联调失败 | 开发模式显式允许 localhost:3000 |
| 外部访问切换需重启 | 用户体验不够流畅 | 明确提示 + "立即重启"按钮 |
| icon 名不存在 | 构建失败 | 按 MEMORY.md 提醒先验证 icon 名 |
