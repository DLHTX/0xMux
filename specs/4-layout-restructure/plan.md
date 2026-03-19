# Implementation Plan: 布局重构 — 去掉 ActivityBar，右侧常驻文件面板

**Feature**: 4-layout-restructure
**Created**: 2026-03-19
**Spec**: [spec.md](./spec.md)

---

## Architecture Overview

### 目标布局

```
Header (通知图标移到右上角)
├── Logo (左)
└── Connection + Notification(bell+badge) + Plugin + Settings (右)

<div class="flex-1 flex overflow-hidden">
├── SessionSidebar (左, 220-520px, 可拖拽/折叠)
│   └── 会话列表 + 搜索（功能不变）
├── <main class="flex-1">
│   └── SplitWorkspace
│       └── PaneSlot
│           ├── 工具栏: [split-h] [split-v] [close] ---- [+新窗口] [window-key]
│           └── TerminalPane (portal)
└── RightPanel (右, 220-520px, 可拖拽/折叠)
    ├── Tab Bar: [文件] [变更] [搜索]
    ├── Tab Content:
    │   ├── files: FileExplorer
    │   ├── changes: GitPanel
    │   └── search: SearchPanel
    └── 折叠按钮
```

### 新增/修改组件

| 组件 | 操作 | 说明 |
|------|------|------|
| ActivityBar.tsx | **删除** | 不再需要 |
| SidebarContainer.tsx | **改造** | 简化为仅承载 SessionSidebar |
| RightPanel.tsx | **新增** | 右侧文件面板，含 tab 切换 |
| Header.tsx | **修改** | 添加通知铃铛图标 |
| NotificationPopover.tsx | **新增** | 通知弹窗组件 |
| SplitWorkspace.tsx | **修改** | PaneSlot 工具栏添加「+」按钮 |
| App.tsx | **修改** | 布局结构调整，状态管理简化 |

---

## Implementation Phases

### Phase 1: 右侧文件面板 (RightPanel)

**目标**: 创建右侧常驻面板，集成文件/变更/搜索三个 tab

**步骤**:
1. 创建 `RightPanel.tsx` 组件
   - 顶部 tab bar：文件 / 变更(+badge) / 搜索
   - Tab 内容区根据选中 tab 渲染对应组件
   - 右边框拖拽调整宽度（复用 SidebarContainer 的拖拽逻辑）
   - 支持折叠/展开
   - 宽度和 tab 选择持久化到 settings
2. 在 App.tsx 中将 FileExplorer、GitPanel、SearchPanel 从 SidebarContainer children 移到 RightPanel
3. 添加新的 settings 字段：`rightPanelWidth`、`rightPanelTab`、`rightPanelCollapsed`

**涉及文件**:
- `web/src/components/sidebar/RightPanel.tsx` (新增)
- `web/src/App.tsx` (修改)
- `web/src/hooks/useSettings.ts` (修改)

### Phase 2: 简化左侧侧边栏

**目标**: 去掉 ActivityBar，左侧仅保留 SessionSidebar

**步骤**:
1. 从 App.tsx 布局中移除 `<ActivityBar />` 组件
2. 简化 SidebarContainer 或直接用 SessionSidebar 替代
   - 保留拖拽调整宽度逻辑
   - 保留折叠/展开功能
   - 移除 `activeView` 和 `children` 多视图切换逻辑
3. 清理 `activeView` 相关状态（App.tsx 中的 useState、handleViewChange 等）
4. 更新键盘快捷键：
   - `Ctrl+B` → 切换左侧 SessionSidebar 折叠/展开
   - `Ctrl+E` → 切换右侧 RightPanel 折叠/展开（或聚焦到文件 tab）
   - `Ctrl+Shift+F` → 聚焦到右侧搜索 tab

**涉及文件**:
- `web/src/App.tsx` (修改)
- `web/src/components/sidebar/SidebarContainer.tsx` (简化或删除)
- `web/src/components/sidebar/ActivityBar.tsx` (删除)

### Phase 3: 通知迁移到 Header

**目标**: 在 Header 右上角添加通知图标和弹窗

**步骤**:
1. 创建 `NotificationPopover.tsx` 组件
   - 弹窗显示通知列表（复用 NotificationPanel 的内容）
   - 点击外部区域关闭
   - 支持清除通知
2. 修改 Header.tsx
   - 在 Settings 按钮前添加通知铃铛图标
   - 显示未读数 badge
   - 点击切换弹窗显示
3. 将 NotificationPanel 从 SidebarContainer children 中移除

**涉及文件**:
- `web/src/components/layout/NotificationPopover.tsx` (新增)
- `web/src/components/layout/Header.tsx` (修改)
- `web/src/App.tsx` (修改)

### Phase 4: 终端窗格「+新窗口」按钮

**目标**: 在每个终端窗格工具栏添加快速创建窗口的按钮

**步骤**:
1. 修改 SplitWorkspace.tsx 的 PaneSlot 工具栏
   - 在右侧（window key 显示之前）添加「+」按钮
   - 按钮仅在窗格已有终端时显示
2. 添加 `onCreateWindow` 回调 prop
   - 点击后调用 `onCreateWindow(sessionName)`
   - 创建新 window 后自动 assign 到当前窗格
3. 在 App.tsx 中连接回调到现有的 `handleCreateWindow` 逻辑

**涉及文件**:
- `web/src/components/terminal/SplitWorkspace.tsx` (修改)
- `web/src/App.tsx` (修改)

### Phase 5: 清理和测试

**目标**: 移除废弃代码，确保一切正常

**步骤**:
1. 删除 `ActivityBar.tsx` 文件
2. 清理 `App.tsx` 中所有 ActivityBar 相关代码
3. 如果 SidebarContainer 已被简化到不需要，可以内联到 App.tsx 或删除
4. 更新 icons.ts（移除不再使用的图标导入）
5. 验证所有键盘快捷键正常工作
6. 验证移动端布局不受影响
7. 验证拖拽调整宽度正常
8. 验证通知功能正常

**涉及文件**:
- `web/src/components/sidebar/ActivityBar.tsx` (删除)
- `web/src/lib/icons.ts` (清理)
- 类型定义文件 (清理 ActivityView 类型)

---

## Design Decisions

### D1: 右侧面板用独立组件还是复用 SidebarContainer？

**选择**: 创建独立的 `RightPanel.tsx`

**原因**: SidebarContainer 设计为承载多个视图并通过 ActivityBar 切换，逻辑较复杂。RightPanel 的需求更简单（内置 tab 切换），独立实现更清晰，避免过度改造。

### D2: 左侧 SessionSidebar 的折叠/展开方式？

**选择**: 保留 `Ctrl+B` 快捷键切换，保持拖拽调整宽度

**原因**: 用户已习惯 `Ctrl+B` 切换侧边栏，保持一致性。

### D3: 通知用弹窗还是下拉面板？

**选择**: 弹窗（Popover），点击外部关闭

**原因**: 弹窗不占用持久布局空间，适合低频操作（查看通知）。

### D4: 「+新窗口」按钮位置？

**选择**: PaneSlot 工具栏右侧，window key 显示之前

**原因**: 与现有的分割/关闭按钮在同一工具栏，保持界面一致性。不放在终端内部，避免干扰终端操作。
