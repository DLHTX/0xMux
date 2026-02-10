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
}

export interface ConfigResponse {
  port: number
  host: string
  version: string
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

// ── Spec 2: Tmux Session UI ──

export interface TmuxWindow {
  index: number
  name: string
  active: boolean
  panes: number
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
