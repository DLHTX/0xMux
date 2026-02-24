export interface TmuxSession {
  name: string
  windows: number
  created: string
  attached: boolean
  start_directory: string
}

export interface Dependency {
  name: string
  required: boolean
  installed: boolean
  version: string | null
  min_version: string | null
}

export interface SystemDepsResponse {
  os: string
  arch: string
  package_manager: string | null
  dependencies: Dependency[]
}

export interface InstallTaskResponse {
  task_id: string
  package: string
  status: string
  ws_url: string
}

export type WsMessageType =
  | 'sessions_update'
  | 'ping'
  | 'pong'
  | 'install_log'
  | 'install_complete'
  | 'install_error'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  data?: T
}

export interface SessionsUpdateData {
  sessions: TmuxSession[]
}

export interface InstallLogData {
  line: string
  stream: 'stdout' | 'stderr'
}

export interface InstallCompleteData {
  success: boolean
  exit_code: number
  duration_ms: number
}

export interface InstallErrorData {
  message: string
  manual_command: string
}

export interface AppError {
  error: string
  message: string
}

export interface CreateSessionRequest {
  name: string
  start_directory?: string
}

export interface CwdResponse {
  path: string
  basename: string
}

export interface NextNameResponse {
  name: string
}

export interface DirEntry {
  name: string
  path: string
}

export interface ListDirsResponse {
  path: string
  parent: string | null
  dirs: DirEntry[]
}

export interface RenameSessionRequest {
  name: string
}

export interface InstallRequest {
  package: string
}

export interface HealthResponse {
  status: string
  version: string
  pty_count?: number
}

export interface ConfigResponse {
  port: number
  host: string
  version: string
  local_ips: string[]
}

export interface CheckUpdateResponse {
  current: string
  latest: string | null
  has_update: boolean
}

export interface DoUpdateResponse {
  status: 'ok' | 'error'
  message: string
}

export interface AiProviderStatus {
  installed: boolean
  command: string
  path: string | null
}

export interface AiProvidersStatus {
  claude: AiProviderStatus
  codex: AiProviderStatus
}

export interface AiStatusResponse {
  providers: AiProvidersStatus
  show_plugin_button: boolean
}

export interface ProviderSyncState {
  exists: boolean
  in_sync: boolean
}

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  source: string
  claude: ProviderSyncState
  codex: ProviderSyncState
  recommended: boolean
  official: boolean
}

export interface McpCatalogItem {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  source: string
  claude: ProviderSyncState
  codex: ProviderSyncState
  recommended: boolean
  official: boolean
}

export interface AiCatalogResponse {
  skills: SkillCatalogItem[]
  mcp: McpCatalogItem[]
}

export type AiSyncType = 'skills' | 'mcp'
export type AiProvider = 'claude' | 'codex'

export interface AiSyncRequest {
  providers?: AiProvider[]
  types?: AiSyncType[]
  ids?: string[]
  dry_run?: boolean
}

export interface SyncAction {
  kind: string
  id: string
  name: string
  provider: string
  status: string
  source: string | null
  target: string | null
  message: string | null
}

export interface SyncSummary {
  total: number
  updated: number
  planned: number
  up_to_date: number
  skipped: number
  failed: number
}

export interface AiSyncResponse {
  dry_run: boolean
  actions: SyncAction[]
  summary: SyncSummary
}

export interface AiUninstallRequest {
  providers?: AiProvider[]
  types?: AiSyncType[]
  ids?: string[]
  remove_source?: boolean
}

export interface UninstallSummary {
  total: number
  removed: number
  skipped: number
  failed: number
  not_found: number
}

export interface AiUninstallResponse {
  actions: SyncAction[]
  summary: UninstallSummary
}

export interface GlobalConfigResponse {
  content: string
  claude: ProviderSyncState
  codex: ProviderSyncState
}

export interface SaveGlobalConfigRequest {
  content: string
}

export interface SyncGlobalConfigRequest {
  providers?: string[]
}

export type AiProviderView = 'global' | AiProvider

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

// ── Spec 2: Tmux Session UI ──

export interface TmuxWindow {
  index: number
  name: string
  active: boolean
  panes: number
}

export interface PaneWindow {
  sessionName: string
  windowIndex: number
}

export interface TerminalInstance {
  instanceId: string
  sessionName: string
  windowIndex: number
  cols: number
  rows: number
  wsUrl: string
  connected: boolean
}

export type SplitDirection = 'horizontal' | 'vertical'
export type ModalBlur = 'none' | 'sm' | 'md' | 'lg'
export type MarkdownRenderMode = 'code' | 'wysiwyg' | 'ir' | 'sv'
export type EditorSkin = 'classic' | 'ocean' | 'forest' | 'sunset' | 'pipboy'

export interface SplitLayoutLeaf {
  id: string
  type: 'leaf'
  terminal?: TerminalInstance
}

export interface SplitLayoutBranch {
  id: string
  type: 'branch'
  direction: SplitDirection
  sizes: number[]
  children: SplitLayout[]
}

export type SplitLayout = SplitLayoutLeaf | SplitLayoutBranch

export interface UserSettings {
  fontSize: number
  accentColor: string
  defaultSplitDirection: SplitDirection
  sidebarCollapsed: boolean
  sidebarWidth: number
  /** Enable @ trigger in terminal to open quick file search (default: true) */
  quickFileTrigger: boolean
  /** Editor color preset for Monaco + Markdown */
  editorSkin: EditorSkin
  /** Markdown editing mode in floating editor (fixed to wysiwyg) */
  markdownRenderMode: 'wysiwyg'
  /** Backdrop blur level for modal overlays */
  modalBlur: ModalBlur
}

export interface CreateWindowRequest {
  window_name?: string
}

export interface PtySessionInfo {
  id: string
  session_name: string
  cols: number
  rows: number
  pid: number
  created_at: string
}

// ── Auth Types ──

export interface AuthStatusResponse {
  initialized: boolean
  authenticated: boolean
}

export interface SetupPasswordRequest {
  password: string
  confirm: string
}

export interface LoginRequest {
  password: string
}

export interface AuthTokenResponse {
  token: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  confirm_password: string
}

// ── Layout Persistence ──

export interface LayoutState {
  layout: SplitLayout
  paneWindowMap: Record<string, PaneWindow>
  activePaneId: string | null
}

export interface LayoutStore {
  layouts: Record<string, LayoutState>
  primarySession: string | null
}

// ── Spec 3: Floating Editor + Git Panel ──

export type ActivityView = 'sessions' | 'files' | 'search' | 'git' | 'notifications'

// ── Notifications ──

export type NotificationCategory = 'screenshot' | 'system' | 'info'

export interface Notification {
  id: string
  title: string
  message: string
  image_url?: string
  category: string
  read: boolean
  timestamp: string
}

export interface NotificationListResponse {
  notifications: Notification[]
  unread_count: number
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  children?: FileTreeNode[]
  ignored?: boolean
}

export interface WorkspaceContext {
  session: string
  window: number
}

export interface EditorTab {
  id: string
  filePath: string
  language: string
  content: string
  originalContent: string
  isDirty: boolean
  mode: 'edit' | 'diff'
  diffOriginal?: string
  scrollLine?: number
  workspace?: WorkspaceContext
  imageUrl?: string
}

export interface FloatingWindowState {
  isOpen: boolean
  x: number
  y: number
  width: number
  height: number
  opacity: number
  zIndex: number
  minimized: boolean
  tabs: EditorTab[]
  activeTabId: string | null
}

export interface SearchOptions {
  query: string
  isRegex: boolean
  caseSensitive: boolean
  fileGlob?: string
}

export interface SearchMatch {
  file_path: string
  line_number: number
  line_content: string
  match_start: number
  match_end: number
}

export interface SearchResultGroup {
  file_path: string
  matches: SearchMatch[]
}

export interface SearchResponse {
  results: SearchResultGroup[]
  total_files: number
  total_matches: number
  truncated: boolean
}

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked'

export interface GitChangedFile {
  path: string
  status: GitFileStatus
  staged: boolean
  old_path?: string
}

export interface GitStatus {
  branch: string
  upstream?: string
  ahead: number
  behind: number
  files: GitChangedFile[]
}

export interface GitCommit {
  hash: string
  short_hash: string
  message: string
  author: string
  email: string
  date: string
  refs?: string
}

export interface GitBranch {
  name: string
  short_hash: string
  upstream?: string
  is_current: boolean
  is_remote: boolean
}

export interface GitDiffContent {
  file_path: string
  original: string
  modified: string
  language: string
}

export interface FileContent {
  path: string
  content: string
  language: string
  size: number
  encoding: string
}
