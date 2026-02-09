# 技术研究：Tmux Session UI

**日期**: 2026-02-09
**分支**: `2-tmux-session-ui`

---

## 决策 1：终端渲染库 — xterm.js

**决策**: 使用 `@xterm/xterm` v5.5.0（新 scoped 包名）

**理由**:
- 浏览器终端渲染的事实标准，VS Code、Hyper 等均在使用
- 新版 scoped 包 (`@xterm/`) 提供更清晰的模块化
- WebGL 渲染器可显著提升多终端场景性能

**推荐 Addons**:

| Addon | 包名 | 用途 |
|-------|------|------|
| Fit | `@xterm/addon-fit` | 自动适应容器尺寸 |
| WebGL | `@xterm/addon-webgl` | GPU 加速渲染（关键性能优化） |
| Web Links | `@xterm/addon-web-links` | 可点击 URL |

**React 集成方式**: 自定义 Hook（`useTerminal`），不使用第三方 React 封装库。现有封装库（xterm-for-react 等）均已停止维护或不支持 React 19。

**性能要点**:
- WebGL addon 是多终端场景的关键——没有它 4+ 终端会明显卡顿
- WebGL 上下文限制约 16 个/页面，超出时回退到 Canvas 渲染
- 必须在组件卸载时 `dispose()` 终端实例避免内存泄漏
- 使用 `ResizeObserver` 替代 window resize 事件实现精确的逐容器监听

**备选方案**:
- `terminal.js` — 功能不完整，无 WebGL 支持
- 自行实现 — 工作量巨大，不现实

---

## 决策 2：PTY 管理库 — portable-pty

**决策**: 使用 `portable-pty` 0.9.0，配合 `tokio::task::spawn_blocking` 桥接异步

**理由**:
- Wezterm 项目维护，经过充分测试，API 稳定
- 跨平台（macOS + Linux + Windows ConPTY）
- 0xMux 的 PTY 操作并不频繁（建立连接时才需要），`spawn_blocking` 的开销可以忽略

**备选方案考虑**:

| Crate | 版本 | 评估 |
|-------|------|------|
| `rust-pty` | 0.1.0 | 原生 Tokio async，但 v0.1 API 不稳定，风险过高 |
| `tokio-pty-process` | 0.4 | 2019 年停止维护，不推荐 |
| `nix::pty` + 手动实现 | — | 控制力最强但代码量大，仅支持 Unix |

**连接模式**: PTY 直连（Approach A），而非 tmux Control Mode

- 在 PTY 中执行 `tmux attach-session -t <name>` 获得完整终端渲染
- Session 管理（列表/创建/删除）继续使用现有的 REST API + tmux CLI
- Control Mode (`-CC`) 留待未来高级功能（pane 布局感知等）

**WebSocket 中继架构**:
```
xterm.js ←WebSocket→ Axum WS Handler ←PTY master→ tmux attach -t foo
```

---

## 决策 3：分屏布局库 — react-resizable-panels

**决策**: 使用 `react-resizable-panels` v4.6.2

**理由**:

| 对比项 | react-resizable-panels | allotment |
|--------|----------------------|-----------|
| npm 周下载量 | ~500k | ~113k |
| React 19 支持 | 是 | 需验证 |
| 嵌套分屏 | 原生支持（Group 内嵌 Panel） | 支持 |
| 尺寸单位 | px, %, em, rem, vh, vw | 仅 px |
| 可折叠面板 | 是（`collapsible` prop） | 是（snap） |
| 键盘无障碍 | 是（ARIA separators） | 有限 |
| 布局持久化 | 是（`autoSaveId` prop） | 否 |
| 包大小 | ~8kb gzipped | ~12kb gzipped |

**与 xterm.js 集成要点**:
- Panel resize 时必须调用 `fitAddon.fit()` 重新计算终端尺寸
- 使用 `ResizeObserver` 监听 Panel 容器尺寸变化

---

## 决策 4：图标库 — @iconify/react 离线模式

**决策**: 使用 `@iconify/react` v5.x + `@iconify-icons/lucide` 离线包

**理由**:
- 0xMux 的图标集固定（约 10-15 个），无需在线 API
- 离线模式通过 `@iconify-icons/*` 每个图标独立 ES module，Vite 自动 tree-shake
- 单个图标约 200-500 bytes，总额外包大小可忽略

**图标集选择**: Lucide（简洁线条风格，与极客主题契合）

**使用模式**:
```tsx
import { Icon } from '@iconify/react';
import terminalIcon from '@iconify-icons/lucide/terminal';

<Icon icon={terminalIcon} width={20} />
```

---

## 决策 5：终端 Resize 处理

**决策**: ResizeObserver → fitAddon.fit() → WebSocket resize 消息 → PTY resize

**完整流程**:
1. 浏览器窗口/分屏面板大小变化
2. `ResizeObserver` 检测到容器尺寸变化
3. 调用 `fitAddon.fit()` 重新计算 cols/rows
4. xterm.js `onResize` 回调触发
5. 客户端发送 `{ type: "resize", cols, rows }` WebSocket 消息
6. 服务端调用 `pty.resize(cols, rows)` 调整 PTY 窗口大小
7. tmux 内部自动检测 SIGWINCH 并重绘

---

## 决策 6：WebSocket 消息协议（PTY 通道）

**决策**: 二进制帧传输终端数据，JSON 帧传输控制消息

**协议设计**:
- **Binary WebSocket 帧**: 终端输入/输出原始字节流
- **Text WebSocket 帧**: JSON 控制消息（resize、ping/pong 等）

**理由**:
- 终端数据为二进制流（包含 ANSI 转义序列），JSON 编码会增加开销和复杂度
- 控制消息（resize 等）频率低，JSON 格式便于扩展
- Axum WebSocket 原生支持 Binary/Text 帧区分

---

## 新增依赖清单

### Rust (Cargo.toml)
```toml
portable-pty = "0.9"       # PTY 管理
futures = "0.3"             # Stream 工具（WebSocket relay）
```

### npm (web/package.json)
```json
{
  "@xterm/xterm": "^5.5.0",
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-webgl": "^0.18.0",
  "@xterm/addon-web-links": "^0.11.0",
  "react-resizable-panels": "^4.6.2",
  "@iconify/react": "^5.2.0",
  "@iconify-icons/lucide": "^1.2.0"
}
```

---

## 参考项目

- [webmux](https://github.com/nooesc/webmux) — 最接近的架构参考（Rust + Axum + WebSocket + PTY + tmux）
- [xterm.js 官方文档](https://xtermjs.org/)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [tmux Control Mode Wiki](https://github.com/tmux/tmux/wiki/Control-Mode) — 未来高级功能参考
