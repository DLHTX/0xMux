# Feature Spec: 布局重构 — 去掉 ActivityBar，右侧常驻文件面板

**Feature ID**: 4-layout-restructure
**Status**: Draft
**Created**: 2026-03-19

---

## 1. Overview

0xMux 当前采用 VS Code 风格的三栏布局：ActivityBar（5 个图标）→ Sidebar（可切换视图）→ Workspace（终端区域）。这种布局在功能多时需要频繁切换侧边栏视图，且左侧占用空间较大。

参考 Conductor 的界面设计，将布局重构为更简洁的结构：左侧仅保留 Sessions 侧边栏，右侧新增常驻文件面板（集成文件浏览、Git 变更、搜索三合一），去掉 ActivityBar，通知迁移到右上角。这样更契合 0xMux「终端为核心」的定位。

### Target Users

- 使用 0xMux 管理终端会话的开发者
- 需要在终端工作流中快速浏览文件和查看 Git 变更的用户
- 偏好简洁界面、减少切换操作的用户

### Problem Statement

当前布局存在以下问题：
1. ActivityBar 占据 48px 宽度，但功能切换频率低，性价比不高
2. 文件浏览、搜索、Git 变更分散在不同侧边栏视图，需要通过 ActivityBar 切换，操作路径长
3. 新建终端窗口必须通过侧边栏操作，不够便捷
4. 布局结构偏向 IDE 风格，与 0xMux 终端复用器的定位不够匹配

---

## 2. User Scenarios

### Scenario 1: 日常终端使用 — 简洁布局

**As a** 日常使用 0xMux 的开发者,
**I want to** 打开应用后看到简洁的三栏布局（Sessions | 终端 | 文件面板）,
**So that** 我能把注意力集中在终端工作上，同时随时查看文件。

**Flow:**
1. 用户打开 0xMux 桌面端
2. 左侧显示 Sessions 侧边栏（会话列表）
3. 中间显示终端工作区（分割窗格）
4. 右侧显示常驻文件面板，默认在「文件」tab
5. 用户可以拖拽调整文件面板宽度
6. 用户可以折叠文件面板以获得更大的终端区域

### Scenario 2: 查看文件变更

**As a** 准备提交代码的开发者,
**I want to** 在文件面板中切换到「变更」tab 查看 Git 状态,
**So that** 我无需离开终端界面就能暂存文件并提交。

**Flow:**
1. 用户点击文件面板顶部的「变更」tab
2. 面板显示当前工作区的 Git 变更文件列表（暂存/未暂存）
3. 用户点击某个文件查看 diff 预览
4. 用户通过操作按钮暂存/取消暂存文件
5. 用户在提交区域输入 commit message 并提交
6. 提交完成后变更列表自动刷新

### Scenario 3: 搜索文件内容

**As a** 需要在项目中查找某段代码的开发者,
**I want to** 在文件面板中切换到「搜索」tab 进行全局搜索,
**So that** 我能快速定位代码位置并在编辑器中打开。

**Flow:**
1. 用户点击文件面板顶部的「搜索」tab
2. 搜索输入框获得焦点
3. 用户输入搜索关键词
4. 搜索结果按文件分组显示，包含匹配行和上下文
5. 用户点击某个结果，在浮动编辑器中打开对应文件并定位到匹配行

### Scenario 4: 快速创建新终端窗口

**As a** 需要打开更多终端的用户,
**I want to** 直接在当前终端窗格旁点击「+」按钮创建新窗口,
**So that** 我不需要回到侧边栏去操作，减少鼠标移动距离。

**Flow:**
1. 用户看到当前终端窗格角落有一个「+」按钮
2. 用户点击「+」按钮
3. 系统在当前会话中创建一个新的 tmux window
4. 当前窗格自动切换到新创建的窗口
5. 新窗口出现在 Sessions 侧边栏的会话列表中

### Scenario 5: 查看通知

**As a** 收到系统通知的用户,
**I want to** 在右上角看到通知图标和未读数,
**So that** 我能及时发现新通知而不占用侧边栏空间。

**Flow:**
1. 系统产生新通知（如后台任务完成、错误告警等）
2. Header 右上角通知图标显示未读数 badge
3. 用户点击通知图标
4. 弹出通知列表弹窗，显示通知详情
5. 用户查看或清除通知后，badge 更新

---

## 3. Functional Requirements

### FR-1: 删除 ActivityBar

- 移除左侧 48px 宽度的垂直图标导航栏
- 移除所有 ActivityBar 相关的视图切换逻辑
- Sessions/Files/Search/Git/Notifications 功能迁移到其他位置

### FR-2: 左侧 Sessions 侧边栏

- 保留现有 SessionSidebar 的全部功能
- 作为左侧唯一面板直接显示，不再通过 ActivityBar 切换
- 保持可折叠/展开能力
- 保持拖拽调整宽度能力

### FR-3: 右侧常驻文件面板

- 在终端工作区右侧新增常驻面板
- 面板顶部提供横向 tab 切换：
  - **文件 (All files)**: 文件树浏览（原 FileExplorer 功能）
  - **变更 (Changes)**: Git 完整功能（原 GitPanel：变更列表、暂存/取消暂存、提交、diff 预览）
  - **搜索 (Search)**: 全局文件内容搜索（原 SearchPanel 功能）
- 面板宽度可拖拽调整
- 面板支持折叠/展开
- 面板支持记忆上次选中的 tab 和宽度

### FR-4: 通知迁移到 Header 右上角

- 在 Header 右上角添加通知图标
- 图标显示未读通知数量 badge
- 点击图标弹出通知列表弹窗（原 NotificationPanel 的功能）
- 弹窗支持查看通知详情和清除通知

### FR-5: 终端窗格内「+新窗口」按钮

- 每个终端窗格增加一个「+」按钮
- 点击后在当前会话创建一个新的 tmux window
- 创建成功后当前窗格自动切换（附着）到新窗口
- 按钮位置不干扰终端操作

### FR-6: 移动端布局不变

- 移动端保持现有的底部 tab 导航布局
- 本次重构仅影响桌面端布局
- 移动端的文件浏览、搜索等功能入口保持不变

### FR-7: 键盘快捷键更新

- 移除 ActivityBar 相关的快捷键
- 保留或更新以下快捷键：
  - `Ctrl+B`: 切换 Sessions 侧边栏显示/隐藏
  - `Ctrl+E`: 切换文件面板显示/隐藏（或聚焦到文件 tab）
  - `Ctrl+Shift+F`: 聚焦到搜索 tab
  - `Ctrl+P`: 快速文件搜索弹窗（保持不变）

---

## 4. Scope

### In Scope

- 桌面端布局重构（删除 ActivityBar、新增右侧文件面板）
- 功能迁移（文件浏览/搜索/Git/通知迁移到新位置）
- 终端窗格「+新窗口」按钮
- 键盘快捷键适配
- 布局状态持久化（面板宽度、tab 选择）

### Out of Scope

- 移动端布局改动
- 新增功能（仅做布局调整和功能迁移）
- 后端 API 变更（纯前端重构）
- 悬浮编辑器（FloatingWindow）的改动
- 会话管理功能的改动

---

## 5. Success Criteria

1. 用户打开桌面端后，界面呈现三栏布局（Sessions | 终端 | 文件面板），无 ActivityBar
2. 用户能在文件面板的 3 个 tab 间流畅切换，所有原有功能正常工作
3. 用户能通过拖拽调整文件面板宽度，面板宽度在会话间保持
4. 用户能在终端窗格内通过「+」按钮一键创建新窗口
5. 用户能在右上角查看和管理通知
6. 所有现有键盘快捷键正常工作或已适配新布局
7. 移动端布局和功能完全不受影响

---

## 6. Dependencies

- 现有的 `react-resizable-panels` 库用于面板拖拽
- 现有的 FileExplorer、GitPanel、SearchPanel、NotificationPanel 组件
- 现有的 SessionSidebar 组件
- 现有的终端窗口创建 API（tmux window creation）

---

## 7. Assumptions

- 桌面端和移动端的断点判断逻辑保持不变
- 右侧文件面板的默认宽度与现有 SidebarContainer 类似（220-520px 范围）
- 文件面板折叠后，终端工作区自动扩展填充空间
- 「+新窗口」按钮在窗格无终端时（空窗格）不显示
- 通知弹窗在点击外部区域时自动关闭
- 快速文件搜索（Ctrl+P）保持为独立弹窗，不受布局重构影响

---

## 8. Design Constraints

- **无圆形元素**: 所有 UI 元素不使用圆角、圆点、圆形按钮（项目设计规则）
- **Brutalist 风格**: 保持现有的像素风、粗犷设计风格
- **图标一致性**: 使用 @iconify/react + @iconify-icons/lucide 图标库
- **字体**: 保持 Silkscreen/Fusion Pixel 字体
- **CSS 变量**: 颜色使用 `var(--color-xxx)` 变量
