# 技术研究：密码鉴权与公网安全访问

**日期**: 2026-02-09
**分支**: `3-password-auth`

---

## 决策 1：密码哈希算法

**决策**: 使用 `argon2` (Argon2id 变体)

**理由**:
- Argon2id 是 2015 年 Password Hashing Competition 的优胜者
- 抗 GPU/ASIC 暴力破解（内存密集型）
- Rust 生态中 `argon2` crate 成熟且维护良好
- 相比 bcrypt，Argon2id 在现代硬件上安全性更好

**备选方案**:
- `bcrypt` — 经典方案，但内存使用固定，不如 Argon2id 灵活
- `scrypt` — 也是内存密集型，但 API 不如 argon2 crate 方便
- `sha256 + salt` — 不推荐，对暴力破解抵抗力弱

**参数**: 使用 `argon2` crate 默认参数（Argon2id, 19MB 内存, 2 迭代, 1 并行度）

---

## 决策 2：Token 生成与验证策略

**决策**: HMAC-SHA256 签名 token

**方案**:
- Token = `hex(random_64_bytes)` + `.` + `hex(HMAC-SHA256(random_part, secret_key))`
- `secret_key` 从密码哈希派生（密码不变 → key 不变 → 重启后 token 仍有效）
- Token 内嵌过期时间戳: `timestamp.random.signature`

**格式**: `{issued_at_unix_ts}.{random_hex_32}.{hmac_hex_32}`

**验证流程**:
1. 解析 token 的三部分
2. 检查 `issued_at` 是否在 7 天内
3. 用 `HMAC-SHA256(issued_at.random, secret_key)` 验证签名
4. 全部通过 → token 有效

**理由**:
- 无需服务端存储已签发的 token（无状态验证）
- 密码不变时 secret_key 不变，重启后旧 token 自动有效
- 密码修改后 secret_key 变化，所有旧 token 自动失效
- O(1) 验证，无数据库查询

**备选方案**:
- JWT — 过于重量级，单用户场景无需 claims 机制
- 服务端存储 token 列表 — 重启后丢失（除非持久化），且需要清理过期 token
- 纯随机 token + 文件存储 — 增加 I/O 开销，无必要

---

## 决策 3：速率限制实现

**决策**: 内存 HashMap + 滑动窗口

**方案**:
- `HashMap<IpAddr, RateLimitEntry>` 存储在 `AppState` 中
- `RateLimitEntry { attempts: Vec<Instant>, locked_until: Option<Instant> }`
- 每次登录请求：
  1. 检查 `locked_until`，如锁定中直接返回 429
  2. 清理 1 分钟前的 `attempts`
  3. 如果 `attempts.len() >= 5`，设置 `locked_until = now + 15min`，返回 429
  4. 否则记录本次尝试

**理由**:
- 无需额外依赖（不引入 `governor` 或 `tower-governor`）
- 数据量极小（每 IP 一条记录），内存占用可忽略
- 服务重启后清零可接受（重启本身中断攻击窗口）

**备选方案**:
- `tower-governor` — 功能丰富但对单端点限流过重
- Token bucket — 对登录场景不如固定窗口直观
- Redis — 单用户场景无需外部依赖

---

## 决策 4：配置文件格式与位置

**决策**: `~/.config/0xmux/config.toml`，TOML 格式

**结构**:
```toml
[auth]
password_hash = "$argon2id$v=19$m=19456,t=2,p=1$..."

[access]
external = false
allow_remote_install = false
allow_remote_restart = false
```

**理由**:
- `dirs` crate 已在依赖中，可获取 `config_dir()`
- TOML 是 Rust 生态标准配置格式（Cargo.toml）
- 结构简单，便于手动查看（但不鼓励手动编辑）
- 文件权限 0600 提供操作系统级保护

**读写时机**:
- **读取**: 服务启动时读取，加载到 `AppState`
- **写入**: 密码设置/修改、外部访问设置变更时写入
- **锁**: 使用 `RwLock` 保护内存中的配置副本

---

## 决策 5：CORS 收紧策略

**决策**: 动态 Origin 匹配

**方案**:
- 生产模式: `Access-Control-Allow-Origin` 设为 `http://{host}:{port}`（从 ServerConfig 读取）
- 开发模式: 额外允许 `http://localhost:3000`（Vite dev server）
- 通过 `AllowOrigin::predicate()` 实现动态匹配

**理由**:
- `tower-http` 的 `CorsLayer` 支持 `AllowOrigin::predicate()` 动态判断
- 避免硬编码，适应不同部署配置

---

## 决策 6：Axum 鉴权中间件策略

**决策**: 分层路由 + `middleware::from_fn_with_state`

**方案**:
```
Router::new()
  // 公开路由（无需 auth）
  .route("/api/health", get(...))
  .route("/api/auth/status", get(...))
  .route("/api/auth/setup", post(...))
  .route("/api/auth/login", post(...))
  .merge(
    // 受保护路由（需要 auth）
    Router::new()
      .route("/api/sessions", get(...).post(...))
      .route("/api/auth/password", put(...))
      // ... 其他所有 API 路由
      .route("/ws", get(...))
      .route("/ws/pty", get(...))
      .route("/ws/install/{task_id}", get(...))
      .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
  )
  .layer(cors)
  .fallback(static_files)
```

**理由**:
- Axum 的分层路由模式清晰分离公开和受保护路由
- 中间件在 handler 之前执行，包括 WebSocket 升级
- 白名单路由不走中间件，零开销
- 静态文件和 CORS 在最外层，所有请求都经过

---

## 决策 7：前端鉴权架构

**决策**: AuthProvider Context + api.ts 拦截器

**方案**:
- 新建 `AuthProvider` 和 `useAuth()` hook
- App 启动时 `GET /api/auth/status` 判断状态
- `api.ts` 的 `request()` 自动注入 `Authorization: Bearer <token>`
- 401 响应触发全局登出逻辑
- Provider 层级: `I18nProvider → ThemeProvider → AuthProvider → AppContent`

**理由**:
- 与现有 Provider 模式一致（useTheme, useI18n）
- 集中管理 token 生命周期
- api.ts 改动最小（仅在 headers 中添加 token）

---

## 决策 8：设置弹框重构方案

**决策**: 新建 `SettingsModal` 组件，内部使用 `Tabs`，ThemeConfigurator 内容提取为 `AppearanceTab`

**方案**:
- `SettingsModal` — 顶层 Modal，包含 Tabs
- `AppearanceTab` — 从 ThemeConfigurator 提取（保留全部逻辑）
- `SecurityTab` — 新建，密码修改 + 退出登录
- `AccessTab` — 新建，外部访问管理
- Header 中 `ThemeConfigurator` 替换为 `SettingsModal`

**理由**:
- ThemeConfigurator 逻辑不变，仅换容器（侧面板 → Tab 内容区）
- 现有 Tabs 组件可直接复用
- Modal 组件需要微调（支持更大宽度、不可关闭模式）
