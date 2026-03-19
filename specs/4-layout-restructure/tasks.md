# Tasks: 布局重构 — 去掉 ActivityBar，右侧常驻文件面板

**Feature**: 4-layout-restructure
**Created**: 2026-03-19
**Plan**: [plan.md](./plan.md)

---

## Phase 1: 右侧文件面板 (RightPanel)

- [x] **T1.1** [frontend] 创建 `RightPanel.tsx` 组件骨架
  - 创建 `web/src/components/sidebar/RightPanel.tsx`
  - 实现 tab bar（文件 / 变更 / 搜索）横向切换
  - tab bar 使用无圆角按钮，激活态用底边框指示
  - 接收 `activeTab`、`onTabChange` props
  - **files**: `web/src/components/sidebar/RightPanel.tsx`

- [x] **T1.2** [frontend] 实现 RightPanel 宽度拖拽和折叠
  - 左边框拖拽调整宽度（注意：与 SidebarContainer 相反，是左边框）
  - 宽度范围 220-520px
  - 折叠/展开支持（折叠时宽度为 0，内容隐藏）
  - 添加折叠按钮
  - **files**: `web/src/components/sidebar/RightPanel.tsx`

- [x] **T1.3** [frontend] 添加 RightPanel 设置持久化
  - 在 useSettings hook 中添加 `rightPanelWidth`、`rightPanelTab`、`rightPanelCollapsed`
  - 宽度和 tab 选择在会话间保持
  - **files**: `web/src/hooks/useSettings.ts`

- [x] **T1.4** [frontend] 集成 RightPanel 到 App.tsx 布局
  - 在 SplitWorkspace 右侧添加 RightPanel
  - 将 FileExplorer、GitPanel、SearchPanel 作为 tab 内容传入
  - 连接 gitChangeCount 到变更 tab 的 badge
  - **files**: `web/src/App.tsx`
  - **depends**: T1.1, T1.2, T1.3

## Phase 2: 简化左侧侧边栏

- [x] **T2.1** [frontend] 从 App.tsx 布局中移除 ActivityBar
  - 删除 `<ActivityBar />` JSX
  - 移除 ActivityBar 相关的 import
  - 清理 `activeView` useState 和 `handleViewChange` 回调
  - **files**: `web/src/App.tsx`

- [x] **T2.2** [frontend] 简化左侧侧边栏为纯 SessionSidebar
  - 移除 SidebarContainer 的多视图切换逻辑
  - 直接渲染 SessionSidebar，保留拖拽宽度和折叠功能
  - 拖拽逻辑内联到 App.tsx
  - **files**: `web/src/App.tsx`, `web/src/components/sidebar/SidebarContainer.tsx`
  - **depends**: T1.4, T2.1

- [x] **T2.3** [frontend] 更新键盘快捷键映射
  - `Ctrl+B` → 切换左侧 SessionSidebar 折叠/展开
  - `Ctrl+E` → 切换右侧 RightPanel 折叠/展开
  - `Ctrl+Shift+F` → 展开 RightPanel 并切到搜索 tab
  - 移除 ActivityBar 视图切换相关的快捷键
  - **files**: `web/src/App.tsx`
  - **depends**: T2.2

## Phase 3: 通知迁移到 Header

- [x] **T3.1** [frontend] 创建 NotificationPopover 组件
  - 创建 `web/src/components/layout/NotificationPopover.tsx`
  - 复用 NotificationPanel 的通知列表内容
  - 实现弹窗定位（Header 通知图标下方）
  - 点击外部区域关闭
  - 支持图片预览（如有）
  - **files**: `web/src/components/layout/NotificationPopover.tsx`

- [x] **T3.2** [frontend] 修改 Header 添加通知图标
  - 在 Settings 按钮前添加铃铛图标按钮
  - 显示未读数 badge（> 99 显示 "99+"）
  - 点击切换 NotificationPopover 显示/隐藏
  - **files**: `web/src/components/layout/Header.tsx`
  - **depends**: T3.1

- [x] **T3.3** [frontend] 连接通知状态到 Header
  - 将 `unreadCount`、`notifications`、`markAllRead` 等 props 传给 Header
  - 从 SidebarContainer children 中移除 NotificationPanel
  - **files**: `web/src/App.tsx`
  - **depends**: T3.2

## Phase 4: 终端窗格「+新窗口」按钮

- [x] **T4.1** [frontend] 在 PaneSlot 工具栏添加「+」按钮
  - 在 SplitWorkspace 的 PaneSlot 工具栏右侧添加「+」图标按钮
  - 仅在窗格已绑定终端时显示（paneWindowMap 中有对应条目）
  - 按钮 title 提示："新建窗口"
  - **files**: `web/src/components/terminal/SplitWorkspace.tsx`

- [x] **T4.2** [frontend] 实现新窗口创建并自动切换
  - 添加 `onCreateAndAttachWindow` 回调 prop
  - 点击「+」后：调用 createWindow(sessionName) → 等待窗口创建 → assignWindow(paneId, sessionName, newWindowIndex)
  - 在 App.tsx 中连接到现有的窗口创建逻辑
  - **files**: `web/src/components/terminal/SplitWorkspace.tsx`, `web/src/App.tsx`
  - **depends**: T4.1

## Phase 5: 清理

- [x] **T5.1** [frontend] 删除废弃文件和代码
  - 删除 `web/src/components/sidebar/ActivityBar.tsx`
  - 清理 `ActivityView` 类型定义
  - 删除 `web/src/components/sidebar/SidebarContainer.tsx`
  - **files**: `web/src/components/sidebar/ActivityBar.tsx`, `web/src/lib/types.ts`
  - **depends**: T2.2, T3.3

- [ ] **T5.2** [testing] 验证全部功能
  - 桌面端布局三栏显示正确
  - 右侧面板 3 个 tab 切换正常
  - 文件浏览功能正常
  - Git 变更/暂存/提交功能正常
  - 搜索功能正常
  - 通知图标和弹窗正常
  - 「+新窗口」按钮功能正常
  - 所有键盘快捷键正常
  - 面板宽度拖拽和折叠正常
  - 移动端布局不受影响
  - **depends**: T5.1

---

## 任务依赖图

```
T1.1 ─┐
T1.2 ─┤
T1.3 ─┴→ T1.4 ─→ T2.1 ─→ T2.2 ─→ T2.3
                                      │
T3.1 ─→ T3.2 ─→ T3.3 ────────────────┤ (可并行)
                                      │
T4.1 ─→ T4.2 ─────────────────────────┤ (可并行)
                                      │
                                      └→ T5.1 ─→ T5.2
```

## 并行化建议

- **Phase 1 (T1.1-T1.3)** 可并行开发
- **Phase 3 (T3.1-T3.3)** 与 Phase 2 可并行
- **Phase 4 (T4.1-T4.2)** 与 Phase 2/3 可并行
- **Phase 5** 必须等所有其他 Phase 完成
