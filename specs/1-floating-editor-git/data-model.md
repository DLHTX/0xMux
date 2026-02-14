# Data Model: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Date**: 2026-02-13

---

## 1. 前端数据模型

### 1.1 Activity Bar 与侧边栏

```typescript
/** Activity Bar 视图类型 */
type ActivityView = 'sessions' | 'files' | 'search' | 'git'

/** Activity Bar 状态 */
interface ActivityBarState {
  activeView: ActivityView | null  // null = 侧边栏折叠
  previousView: ActivityView       // 折叠前的视图，用于恢复
}
```

### 1.2 文件树

```typescript
/** 文件树节点 */
interface FileTreeNode {
  name: string          // 文件/目录名
  path: string          // 相对路径（相对于项目根目录）
  type: 'file' | 'directory'
  size?: number         // 文件大小（字节），目录无此字段
  modified?: string     // ISO 8601 修改时间
  children?: FileTreeNode[]  // 延迟加载，初始为 undefined
}
```

### 1.3 浮动编辑器窗口

```typescript
/** 编辑器标签 */
interface EditorTab {
  id: string            // 唯一标识 (nanoid)
  filePath: string      // 相对文件路径
  language: string      // Monaco 语言标识 (typescript, rust, etc.)
  content: string       // 文件内容
  originalContent: string  // 打开时的原始内容（判断 dirty）
  isDirty: boolean      // 是否有未保存修改
  mode: 'edit' | 'diff' // 编辑模式 or diff 模式
  diffOriginal?: string // diff 模式下的原始内容 (HEAD 版本)
}

/** 浮动窗口状态 */
interface FloatingWindowState {
  id: string            // 唯一标识
  x: number             // 左上角 X 坐标 (px)
  y: number             // 左上角 Y 坐标 (px)
  width: number         // 宽度 (px)
  height: number        // 高度 (px)
  opacity: number       // 透明度 (0.3 ~ 1.0)
  zIndex: number        // 层级
  minimized: boolean    // 是否最小化
  tabs: EditorTab[]     // 打开的标签
  activeTabId: string | null  // 当前激活标签
}

/** 浮动窗口持久化数据 (localStorage) */
interface FloatingWindowPersistence {
  x: number
  y: number
  width: number
  height: number
  opacity: number
}
```

### 1.4 全局搜索

```typescript
/** 搜索选项 */
interface SearchOptions {
  query: string
  isRegex: boolean
  caseSensitive: boolean
  fileGlob?: string     // 文件过滤 (e.g., "*.rs", "*.ts")
}

/** 搜索匹配 */
interface SearchMatch {
  filePath: string
  lineNumber: number
  lineContent: string   // 匹配行全文
  matchStart: number    // 匹配起始位置 (字符偏移)
  matchEnd: number      // 匹配结束位置
}

/** 搜索结果（按文件分组） */
interface SearchResultGroup {
  filePath: string
  matches: SearchMatch[]
  totalMatches: number
}

/** 搜索状态 */
interface SearchState {
  options: SearchOptions
  results: SearchResultGroup[]
  totalFiles: number
  totalMatches: number
  truncated: boolean      // 是否达到上限截断
  loading: boolean
  error?: string
}
```

### 1.5 Git 面板

```typescript
/** Git 文件状态 */
type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

/** Git 变更文件 */
interface GitChangedFile {
  path: string
  status: GitFileStatus
  staged: boolean       // 是否在暂存区
  oldPath?: string      // 重命名时的原路径
}

/** Git 状态 */
interface GitStatus {
  branch: string
  upstream?: string
  ahead: number
  behind: number
  files: GitChangedFile[]
}

/** Git 提交记录 */
interface GitCommit {
  hash: string          // 完整 SHA
  shortHash: string     // 前 7 位
  message: string       // 提交信息（首行）
  author: string
  email: string
  date: string          // ISO 8601
  refs?: string         // 引用 (HEAD -> main, tag: v1.0)
}

/** Git 分支 */
interface GitBranch {
  name: string
  shortHash: string
  upstream?: string
  isCurrent: boolean
  isRemote: boolean
}

/** Git Diff 内容（用于 Monaco DiffEditor） */
interface GitDiffContent {
  filePath: string
  original: string      // HEAD 版本内容
  modified: string      // 工作区版本内容
  language: string      // Monaco 语言标识
}
```

### 1.6 注意事项

编辑器采用浮动窗口模式（FloatingWindow），不嵌入现有的 SplitWorkspace 面板系统。现有 PaneWindow 类型无需修改。

---

## 2. 后端数据模型 (Rust)

### 2.1 文件系统

```rust
/// 文件树节点
#[derive(Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,           // 相对路径
    #[serde(rename = "type")]
    pub node_type: FileNodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>, // ISO 8601
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileNodeType {
    File,
    Directory,
}

/// 文件读取响应
#[derive(Serialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub language: String,
    pub size: u64,
    pub encoding: String,       // "utf-8"
}
```

### 2.2 搜索

```rust
/// 搜索请求
#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: String,
    #[serde(default)]
    pub is_regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    pub file_glob: Option<String>,
    #[serde(default = "default_max_results")]
    pub max_results: usize,     // 默认 200
}

/// 搜索匹配
#[derive(Serialize)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: u64,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

/// 搜索响应
#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResultGroup>,
    pub total_files: usize,
    pub total_matches: usize,
    pub truncated: bool,        // 是否达到上限截断
}

#[derive(Serialize)]
pub struct SearchResultGroup {
    pub file_path: String,
    pub matches: Vec<SearchMatch>,
}
```

### 2.3 Git

```rust
/// Git 状态响应
#[derive(Serialize)]
pub struct GitStatusResponse {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub files: Vec<GitChangedFile>,
}

#[derive(Serialize)]
pub struct GitChangedFile {
    pub path: String,
    pub status: String,         // "modified", "added", "deleted", "renamed", "untracked"
    pub staged: bool,
    pub old_path: Option<String>,
}

/// Git Diff 内容
#[derive(Serialize)]
pub struct GitDiffResponse {
    pub file_path: String,
    pub original: String,       // HEAD 版本
    pub modified: String,       // 工作区版本
    pub language: String,
}

/// Git 提交记录
#[derive(Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,           // ISO 8601
    pub refs: Option<String>,
}

/// Git 分支
#[derive(Serialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub short_hash: String,
    pub upstream: Option<String>,
    pub is_current: bool,
    pub is_remote: bool,
}
```

---

## 3. API 请求/响应格式

### 3.1 文件系统 API

```
GET /api/files/tree?path=src&depth=1
→ { children: FileNode[] }

GET /api/files/read?path=src/main.rs
→ FileContent

PUT /api/files/write
← { path: "src/main.rs", content: "..." }
→ { success: true }

GET /api/files/search?query=fn%20main&regex=false&case=false&glob=*.rs&max=200
→ SearchResponse
```

### 3.2 Git API

```
GET /api/git/status
→ GitStatusResponse

GET /api/git/diff?path=src/main.rs
→ GitDiffResponse

GET /api/git/log?limit=20
→ { commits: GitLogEntry[] }

GET /api/git/branches
→ { branches: GitBranchInfo[] }
```

---

## 4. 持久化

| 数据 | 存储方式 | Key |
|------|----------|-----|
| 浮动窗口位置/大小/透明度 | localStorage | `0xmux-floating-editor` |
| Activity Bar 激活视图 | localStorage | `0xmux-activity-view` |
