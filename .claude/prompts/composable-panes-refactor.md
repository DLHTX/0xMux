# 可组合面板系统重构

## 目标

将 0xMux 的固定三栏布局（Sessions | Terminal | RightPanel）重构为完全可组合的 tile/tab 面板系统。任何面板（终端、文件浏览器、编辑器、Git 变更、搜索）都可以拖入任意分割窗格，也可以拖回侧边栏。

## 当前架构

```
Header
├── SessionSidebar (固定左侧)
├── SplitWorkspace (中间，只能放终端)
│   └── PaneSlot → TerminalPane only
├── RightPanel (固定右侧，tabs: Files/Changes/Search)
└── StatusBar
```

- `SplitWorkspace` 只管理 `TerminalPane`，通过 portal 挂载
- `FloatingWindow` 是独立的悬浮编辑器，不在分割系统内
- 每个面板组件（FileExplorer, GitPanel, SearchPanel）固定在 RightPanel 里

## 目标架构

```
Header
├── SessionSidebar (可拖入窗格，也可留在左侧)
├── GenericSplitWorkspace (中间，任意内容)
│   └── PaneSlot → TerminalPane | FileExplorer | EditorPane | GitPanel | SearchPanel
└── StatusBar
```

### 核心数据模型

```typescript
type PaneContentType = 'terminal' | 'files' | 'editor' | 'changes' | 'search'

interface PaneContent {
  type: PaneContentType
  // terminal
  sessionName?: string
  windowIndex?: number
  // editor
  filePath?: string
  // 其他类型不需要额外参数
}

// SplitLayout 的 leaf 节点增加 content 字段
interface SplitLayoutLeaf {
  id: string
  type: 'leaf'
  content?: PaneContent  // 替代现有的 PaneWindow
}
```

### 实现步骤

#### Phase 1: PaneSlot 泛化
1. 修改 `SplitWorkspace` 的 `PaneSlot`，接受 `PaneContent` 而不是只能放终端
2. 根据 `content.type` 渲染不同组件：
   - `terminal` → 现有的 TerminalPane (portal)
   - `files` → FileExplorer
   - `editor` → EditorPane (内联，非悬浮)
   - `changes` → GitPanel
   - `search` → SearchPanel
3. 保持现有终端 portal 架构不变

#### Phase 2: 拖拽系统扩展
1. 现有拖拽已支持 `text/window-key` 数据类型（终端窗口拖入窗格）
2. 新增 `text/pane-content` 数据类型，携带 `PaneContent` JSON
3. RightPanel 的每个 tab 标题可拖拽到 SplitWorkspace
4. 窗格内的非终端面板可拖回 RightPanel 区域

#### Phase 3: RightPanel 动态化
1. RightPanel 变为可选的 — 如果所有面板都拖入了窗格，RightPanel 隐藏
2. 如果窗格内的面板被关闭，自动回到 RightPanel
3. 一个面板同时只能存在一个实例（要么在 RightPanel，要么在某个窗格）

#### Phase 4: 编辑器内联化
1. FloatingWindow 作为默认行为保留
2. 新增选项：拖拽编辑器标题栏到窗格 → 变成内联编辑器
3. 内联编辑器支持多 tab（和 VS Code 一样）
4. 关闭内联编辑器窗格 → 回到悬浮模式

#### Phase 5: 布局持久化
1. 扩展 `LayoutState` 保存每个 pane 的 `PaneContent`
2. 切换 session 时保存/恢复完整布局（包括哪些面板在哪个窗格）
3. 默认布局：纯终端（和现在一样）

### 关键技术点

- **FileExplorer/GitPanel/SearchPanel 需要能在 RightPanel 和 PaneSlot 两种容器中渲染** — 组件本身不变，只是父容器不同
- **终端 portal 架构保持不变** — 终端仍然用 portal 挂载到 PaneSlot
- **拖拽边缘检测复用现有逻辑** — PaneSlot 已有 30% 边缘检测做分割
- **不影响移动端** — 移动端保持现有布局

### 不做的事情

- 不做 tab group（每个窗格只有一个内容，不像 VS Code 那样一个窗格多个 tab）
- 不做 floating panel（除了现有的 FloatingWindow）
- 不做面板大小记忆（使用 react-resizable-panels 的默认行为）

### 文件改动预估

| 文件 | 改动 |
|------|------|
| `lib/types.ts` | 新增 PaneContent 类型 |
| `hooks/useSplitLayout.ts` | paneWindowMap → paneContentMap |
| `components/terminal/SplitWorkspace.tsx` | PaneSlot 泛化，支持多种内容类型 |
| `components/sidebar/RightPanel.tsx` | 动态显示/隐藏，tab 支持拖拽 |
| `App.tsx` | 统一面板状态管理 |
| `components/editor/FloatingWindow.tsx` | 支持拖入窗格 |

### 参考

- Zed Editor 的面板拖拽：https://zed.dev
- JetBrains IDE 的工具窗口：可拖到任意位置
- VS Code 的 editor group：多个编辑器窗格

### 注意事项

- UI 设计规则：不许出现圆形
- 保持 brutalist/VS Code 风格
- 开发端口 1235，不要碰 1234
- 前端改动不需要重启后端
- 用 `--features agent` 编译时从项目根目录启动服务器
