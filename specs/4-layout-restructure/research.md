# Research: 布局重构

**Feature**: 4-layout-restructure
**Created**: 2026-03-19

---

## 1. 现有架构分析

### 桌面端布局层次

```
App.tsx (根布局)
├── Header (h-10 md:h-12)
│   ├── Logo (左)
│   └── Connection + Plugin + Settings (右)
├── <div class="flex-1 flex overflow-hidden">
│   ├── ActivityBar (w-12, 48px) ← 待删除
│   ├── SidebarContainer (220-520px, 可拖拽)
│   │   └── children[activeView] 切换显示
│   └── <main class="flex-1">
│       └── SplitWorkspace
│           └── PaneSlot → TerminalPane (portal)
└── FloatingWindow (悬浮编辑器)
```

### 关键状态管理

| 状态 | 位置 | 用途 |
|------|------|------|
| activeView | App.tsx (useState) | 侧边栏视图切换 |
| sidebarWidth | settings hook | 侧边栏宽度持久化 |
| gitChangeCount | App.tsx (useState) | Git 变更数 badge |
| unreadCount | useNotifications hook | 通知未读数 badge |

### 组件依赖图

```
ActivityBar ← App.tsx (activeView, unreadCount, gitChangeCount)
SidebarContainer ← App.tsx (activeView, width, children{5 views})
SessionSidebar ← App.tsx (sessions, windows, selectedWindow...)
FileExplorer ← App.tsx (通过 SidebarContainer children)
SearchPanel ← App.tsx (通过 SidebarContainer children)
GitPanel ← App.tsx (通过 SidebarContainer children, onChangeCount)
NotificationPanel ← App.tsx (通过 SidebarContainer children)
```

## 2. 可复用组件

- **SidebarContainer 的拖拽逻辑**: 可复用到右侧文件面板
- **ActivityBar 的 badge 样式**: 可用于 Header 通知图标
- **PaneSlot 工具栏**: 已有分割/关闭按钮，可扩展「+」按钮
- **FileExplorer / GitPanel / SearchPanel**: 功能完整，直接迁移

## 3. 技术风险

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| 删除 ActivityBar 后键盘快捷键失效 | 中 | 将快捷键逻辑从 ActivityBar 迁到 App.tsx 全局 handler |
| SidebarContainer 改为直接显示 Sessions 可能影响折叠动画 | 低 | 复用现有动画逻辑，仅移除 activeView 条件 |
| 右侧面板与 FloatingWindow 层叠冲突 | 低 | FloatingWindow 使用 z-index 已在最上层 |
| 通知弹窗与设置弹窗冲突 | 低 | 同一时间只允许一个弹窗 |
