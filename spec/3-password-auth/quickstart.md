# 快速开始：密码鉴权开发指南

**日期**: 2026-02-09
**分支**: `3-password-auth`

---

## 新增依赖

### Rust (server/Cargo.toml)

```toml
argon2 = "0.5"          # 密码哈希（Argon2id）
rand = "0.8"            # 密码学安全随机数
hmac = "0.12"           # HMAC 签名
sha2 = "0.10"           # SHA-256
hex = "0.4"             # hex 编解码
toml = "0.8"            # 配置文件读写
```

`dirs` crate 已在依赖中（获取 `~/.config` 路径）。

### 前端

无需新增 npm 依赖。现有 UI 组件（Modal、Tabs、Toggle、Input、Button）均可满足需求。

可能需要新增的 icon:
- `@iconify-icons/lucide/lock` → `IconLock`
- `@iconify-icons/lucide/shield` → `IconShield`
- `@iconify-icons/lucide/eye` → `IconEye`
- `@iconify-icons/lucide/eye-off` → `IconEyeOff`
- `@iconify-icons/lucide/log-out` → `IconLogOut`
- `@iconify-icons/lucide/globe` → `IconGlobe`

---

## 新增文件清单

### 后端

| 文件 | 说明 |
|------|------|
| `server/src/handlers/auth.rs` | 鉴权 API handlers (setup/login/password/status) |
| `server/src/handlers/access.rs` | 外部访问配置 handlers (get/update config) |
| `server/src/services/auth.rs` | AuthService (密码哈希、token 签发/验证、速率限制) |
| `server/src/services/config_file.rs` | TOML 配置文件读写 |
| `server/src/models/auth.rs` | Auth 请求/响应模型 |
| `server/src/middleware.rs` | 鉴权中间件 + 公网模式中间件 |

### 前端

| 文件 | 说明 |
|------|------|
| `web/src/hooks/useAuth.ts` | AuthProvider + useAuth hook |
| `web/src/components/auth/SetupPasswordModal.tsx` | 首次设置密码弹框 |
| `web/src/components/auth/LoginModal.tsx` | 登录弹框 |
| `web/src/components/settings/SettingsModal.tsx` | 重构后的设置弹框（带 Tab） |
| `web/src/components/settings/AppearanceTab.tsx` | 外观 Tab（从 ThemeConfigurator 提取） |
| `web/src/components/settings/SecurityTab.tsx` | 安全 Tab（密码修改 + 退出） |
| `web/src/components/settings/AccessTab.tsx` | 外部访问 Tab |

### 修改文件

| 文件 | 改动 |
|------|------|
| `server/Cargo.toml` | 新增依赖 |
| `server/src/state.rs` | AppState 新增 auth 相关字段 |
| `server/src/config.rs` | 新增 PersistentConfig 读取逻辑 |
| `server/src/router.rs` | 路由分层 + auth 中间件 + CORS 收紧 |
| `server/src/error.rs` | 新增 Unauthorized、Forbidden、TooManyRequests 变体 |
| `server/src/main.rs` | 启动时加载配置文件、初始化 AuthService |
| `server/src/handlers/mod.rs` | 注册 auth 和 access 模块 |
| `server/src/models/mod.rs` | 注册 auth 模型 |
| `server/src/services/mod.rs` | 注册 auth 和 config_file 服务 |
| `server/src/handlers/session.rs` | dirs 端点添加路径限制 |
| `server/src/handlers/system.rs` | install/restart 端点添加公网模式检查 |
| `web/src/App.tsx` | 添加 AuthProvider，鉴权流程控制 |
| `web/src/lib/api.ts` | request() 注入 Authorization header，401 处理 |
| `web/src/lib/icons.ts` | 新增 auth 相关 icon |
| `web/src/lib/i18n.ts` | 新增 auth 相关翻译 key |
| `web/src/lib/types.ts` | 新增 auth 相关类型 |
| `web/src/hooks/useWebSocket.ts` | WS URL 添加 token 参数 |
| `web/src/hooks/usePtySocket.ts` | WS URL 添加 token 参数 |
| `web/src/components/layout/Header.tsx` | ThemeConfigurator → SettingsModal |

---

## 实现顺序建议

```
Phase 1: 后端核心鉴权
  1. 配置文件服务 (config_file.rs)
  2. Auth 模型 (models/auth.rs)
  3. Auth 服务 (services/auth.rs)
  4. AppState 扩展 + 启动加载
  5. Auth handlers (handlers/auth.rs)
  6. 鉴权中间件 (middleware.rs)
  7. 路由分层 + CORS 收紧 (router.rs)
  8. 错误类型扩展 (error.rs)

Phase 2: 后端外部访问
  9. Access handlers (handlers/access.rs)
  10. 公网模式中间件
  11. dirs 路径限制
  12. install/restart 端点限制

Phase 3: 前端鉴权流程
  13. useAuth hook + AuthProvider
  14. api.ts token 注入 + 401 处理
  15. SetupPasswordModal
  16. LoginModal
  17. App.tsx 鉴权流程集成

Phase 4: 前端设置弹框
  18. AppearanceTab (从 ThemeConfigurator 提取)
  19. SecurityTab
  20. AccessTab
  21. SettingsModal (整合三个 Tab)
  22. Header 替换
  23. WebSocket token 注入

Phase 5: i18n + 收尾
  24. i18n key 补充
  25. Icon 添加
  26. 编译验证 + 集成测试
```

---

## 验证检查点

每个 Phase 完成后运行：

1. `cd server && cargo build` — Rust 编译通过
2. `cd web && npx tsc --noEmit` — TypeScript 类型检查通过
3. `cd web && npx vite build` — 前端构建通过
