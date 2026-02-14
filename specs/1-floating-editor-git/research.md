# Technical Research: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Date**: 2026-02-13

---

## 1. Monaco Editor Integration

### @monaco-editor/react v4.7.0

- 支持 React 19 as peer dependency
- 底层使用 `monaco-editor v0.52.2`
- 核心导出: `Editor`, `DiffEditor`, `useMonaco`, `loader`

**多 Tab 关键发现**: `path` prop 作为 model 标识符，切换 path 自动切换底层 model。配合 `saveViewState={true}` 保留每个 tab 的滚动、选区和 undo 栈。无需手动管理 monaco model。

**自定义主题**: 通过 `beforeMount` 回调调用 `monaco.editor.defineTheme()` 注册。可以直接映射项目 CSS 变量值到 monaco 颜色 key，保持风格一致。

**DiffEditor**: 支持 `renderSideBySide: true/false`（并排/行内），接收 `original` 和 `modified` 文本。

### Monaco Workers 本地化

**问题**: 默认从 CDN 加载，rust-embed 单二进制模式不可接受。

**方案**: `@tomjs/vite-plugin-monaco-editor` + `local: true` 模式
- 将 worker 文件从 node_modules 复制到 dist/
- 配合 `loader.config({ monaco })` 使用本地实例
- rust-embed 自动嵌入 dist/ 中的 worker 文件

### Bundle 大小

| 指标 | 大小 |
|------|------|
| Minified + Gzipped（全量） | ~1.7-2 MB |
| 仅编辑器核心 | ~1 MB gzipped |
| 对 release 二进制影响 | +3-5 MB |

**优化策略**:
- 语言 worker 按需配置（仅 editorWorkerService + json + typescript）
- React.lazy() 懒加载，终端主功能不受影响
- 条件加载：仅在用户打开编辑器时加载

---

## 2. 浮动窗口方案

### react-rnd v10.4.x（推荐）

- 可拖拽 + 可调整大小的 React 组件
- `bounds="parent"` 限制在父容器内
- `dragHandleClassName` 只允许标题栏拖拽
- `onDragStop` / `onResizeStop` 回调持久化位置

### Z-Index 管理

当前项目 z-index 使用情况:
- `z-6` ~ `z-30`: 终端内部层（状态覆盖、拖拽层）
- `z-200`: Toast 通知

**浮动窗口建议**: `z-50` ~ `z-100`，低于 Toast，高于拖拽层。
使用递增 z-index 模式处理多窗口焦点。

### 透明度调节

CSS `opacity` 属性，range slider 控件，范围 0.3 ~ 1.0。

---

## 3. 文件树组件

### react-arborist（推荐）

- 内置虚拟滚动，支持 10000+ 节点
- 自定义节点渲染（匹配 brutalist 风格）
- 支持拖放、展开/折叠

### 替代方案

- react-complex-tree: headless，无样式依赖
- TanStack Virtual + 自建: 极度自定义但工作量大

---

## 4. Git CLI 命令格式

### git status --porcelain=v2 --branch

```
# branch.oid <sha>
# branch.head <branch_name>
# branch.upstream <upstream>
# branch.ab +<ahead> -<behind>
1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>    -- 普通修改
2 <XY> ... <path><sep><origPath>                   -- 重命名/复制
? <path>                                           -- 未跟踪
```

XY 字段: X=暂存区, Y=工作区。`.`=未修改, `M`=已修改, `A`=新增, `D`=删除

### git log 结构化输出

```bash
git log --format='%H%x00%an%x00%ae%x00%at%x00%s%x00%D' -N
```

NUL 分隔，方便解析。

### git branch 结构化输出

```bash
git branch -a --format='%(refname:short)|%(objectname:short)|%(upstream:short)|%(upstream:track)'
```

### git diff

标准 unified diff。获取文件级统计: `git diff --numstat`。
获取完整内容用于 DiffEditor: 分别读取 `HEAD:path` 和工作区文件。

---

## 5. Rust 后端模式

### 已有模式

| 模式 | 文件 | 特点 |
|------|------|------|
| 同步 Command | services/tmux.rs | `tmux_cmd()` 工厂, env_clear, 快速操作 |
| 异步 Command | services/install.rs | tokio::process, piped stdout, 流式推送 |

### Git 服务建议

- `git status/branch/log`: 同步模式（<100ms）
- `git diff`（大文件）: 异步模式
- `rg` 搜索: 异步模式 + kill_on_drop

### 路径安全

```rust
canonicalize(root) + canonicalize(root.join(user_path)) + starts_with(root)
```

必须三步验证，防止路径遍历（参考 RustFS CVE-2025-68705）。

---

## 6. ripgrep 搜索

### rg --json 输出

JSON Lines 格式，类型: `begin`, `match`, `end`, `summary`。
`match` 包含: path, line_number, lines.text, submatches。

### 方案

直接调用 `rg` CLI（VS Code 同做法）。回退方案: walkdir + regex crate。

---

## 7. 前端布局集成点

### Activity Bar 挂载

推荐在 `App.tsx:839` 的 `<div flex-1 flex>` 中 sidebar 前插入独立组件，固定 48px 宽度。

### Editor 面板类型

扩展 `PaneWindow` 增加 `type: 'terminal' | 'editor'` 字段，在 SplitWorkspace portal 渲染处做条件分支。

### 浮动窗口挂载

在 App.tsx 的 Modal 区域前添加，使用 `position: fixed` + `z-[60]`。

---

## 8. 依赖清单

### 前端新增

```
monaco-editor                        # 编辑器核心
@monaco-editor/react                 # React 绑定
@tomjs/vite-plugin-monaco-editor     # Vite worker 本地化 (devDep)
react-rnd                            # 浮动窗口
react-arborist                       # 文件树
```

### 后端

无需新增 crate。已有: tokio, serde_json, regex, infer。
可选: `soft-canonicalize`（安全路径验证）。

### 系统依赖

- `git` CLI（已在多数开发环境中可用）
- `rg` (ripgrep)（可选，降级为 walkdir+regex）
