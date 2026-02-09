# 数据模型：密码鉴权与公网安全访问

**日期**: 2026-02-09
**分支**: `3-password-auth`

---

## 后端模型

### AuthConfig（持久化配置）

存储在 `~/.config/0xmux/config.toml`，服务启动时加载到内存。

| 字段 | 类型 | 说明 |
|------|------|------|
| `password_hash` | `Option<String>` | Argon2id 哈希后的密码，`None` 表示未初始化 |
| `external_access` | `bool` | 是否开启外部访问（默认 `false`） |
| `allow_remote_install` | `bool` | 外部访问时是否允许远程安装（默认 `false`） |
| `allow_remote_restart` | `bool` | 外部访问时是否允许远程重启（默认 `false`） |

**状态转换**:
```
未初始化 (password_hash = None)
    ↓ POST /api/auth/setup
已初始化 (password_hash = Some("$argon2id$..."))
    ↓ PUT /api/auth/password
已更新 (password_hash = Some("$argon2id$...new"))
```

### RateLimitEntry（内存状态）

按 IP 地址存储，不持久化。

| 字段 | 类型 | 说明 |
|------|------|------|
| `attempts` | `Vec<Instant>` | 1 分钟内的登录尝试时间戳 |
| `locked_until` | `Option<Instant>` | 锁定截止时间，`None` 表示未锁定 |

### Token 格式

格式: `{issued_at}.{random}.{signature}`

| 部分 | 长度 | 说明 |
|------|------|------|
| `issued_at` | 10 位 | Unix 时间戳（秒） |
| `random` | 32 hex | 密码学安全随机数 |
| `signature` | 64 hex | HMAC-SHA256 签名 |

示例: `1738800000.a1b2c3d4e5f6...32chars.hmac_signature...64chars`

---

## 前端模型

### AuthState（React Context）

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `'loading' \| 'uninitialized' \| 'unauthenticated' \| 'authenticated'` | 当前鉴权状态 |
| `token` | `string \| null` | 当前 session token |

**状态转换**:
```
loading (页面加载，请求 /api/auth/status)
    ↓ initialized=false
uninitialized (显示设置密码弹框)
    ↓ setup 成功
authenticated (进入主界面)

loading
    ↓ initialized=true, 无有效 token
unauthenticated (显示登录弹框)
    ↓ login 成功
authenticated

authenticated
    ↓ API 返回 401 / 用户退出登录
unauthenticated
```

### AuthStatus API 响应

| 字段 | 类型 | 说明 |
|------|------|------|
| `initialized` | `boolean` | 是否已设置密码 |

### AccessConfig（外部访问设置）

| 字段 | 类型 | 说明 |
|------|------|------|
| `external_access` | `boolean` | 外部访问开关 |
| `allow_remote_install` | `boolean` | 允许远程安装 |
| `allow_remote_restart` | `boolean` | 允许远程重启 |
| `listen_address` | `string` | 当前监听地址 |
| `lan_ip` | `string \| null` | 局域网 IP（外部访问时） |
| `restart_required` | `boolean` | 设置变更后是否需要重启 |

---

## 配置文件格式

`~/.config/0xmux/config.toml`:

```toml
[auth]
password_hash = "$argon2id$v=19$m=19456,t=2,p=1$salt$hash"

[access]
external = false
allow_remote_install = false
allow_remote_restart = false
```

**文件权限**: `0600`（仅所有者可读写）
