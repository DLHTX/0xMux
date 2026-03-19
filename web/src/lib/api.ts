import type {
  TmuxSession,
  TmuxWindow,
  PtySessionInfo,
  SystemDepsResponse,
  InstallTaskResponse,
  HealthResponse,
  ConfigResponse,
  CheckUpdateResponse,
  DoUpdateResponse,
  CreateSessionRequest,
  RenameSessionRequest,
  InstallRequest,
  AppError,
  CwdResponse,
  NextNameResponse,
  ListDirsResponse,
  AuthStatusResponse,
  SetupPasswordRequest,
  LoginRequest,
  AuthTokenResponse,
  ChangePasswordRequest,
  AiStatusResponse,
  AiCatalogResponse,
  AiSyncRequest,
  AiSyncResponse,
  AiUninstallRequest,
  AiUninstallResponse,
  GlobalConfigResponse,
  SaveGlobalConfigRequest,
  SyncGlobalConfigRequest,
  WorkspaceContext,
  NotificationListResponse,
} from './types'

const API_BASE = '/api'

// Token管理
let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
  if (token) {
    localStorage.setItem('mux_token', token)
  } else {
    localStorage.removeItem('mux_token')
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('mux_token')
  }
  return authToken
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }

  // 添加token到请求头
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })

  // 401自动清除token
  if (res.status === 401) {
    setAuthToken(null)
  }

  if (!res.ok) {
    const error: AppError = await res.json().catch(() => ({
      error: 'unknown',
      message: res.statusText,
    }))
    throw error
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export async function getSessions(): Promise<TmuxSession[]> {
  return request<TmuxSession[]>('/sessions')
}

export async function createSession(data: CreateSessionRequest): Promise<TmuxSession> {
  return request<TmuxSession>('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteSession(name: string): Promise<void> {
  return request<void>(`/sessions/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export async function renameSession(
  oldName: string,
  data: RenameSessionRequest
): Promise<TmuxSession> {
  return request<TmuxSession>(`/sessions/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getSystemDeps(): Promise<SystemDepsResponse> {
  return request<SystemDepsResponse>('/system/deps')
}

export async function installPackage(data: InstallRequest): Promise<InstallTaskResponse> {
  return request<InstallTaskResponse>('/system/install', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function restartServer(): Promise<void> {
  return request<void>('/system/restart', { method: 'POST' })
}

export async function getAiStatus(): Promise<AiStatusResponse> {
  return request<AiStatusResponse>('/ai/status')
}

export async function getAiCatalog(): Promise<AiCatalogResponse> {
  return request<AiCatalogResponse>('/ai/catalog')
}

export async function syncAi(data: AiSyncRequest): Promise<AiSyncResponse> {
  return request<AiSyncResponse>('/ai/sync', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uninstallAi(data: AiUninstallRequest): Promise<AiUninstallResponse> {
  return request<AiUninstallResponse>('/ai/uninstall', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getGlobalConfig(): Promise<GlobalConfigResponse> {
  return request<GlobalConfigResponse>('/ai/global-config')
}

export async function saveGlobalConfig(data: SaveGlobalConfigRequest): Promise<GlobalConfigResponse> {
  return request<GlobalConfigResponse>('/ai/global-config', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function syncGlobalConfig(data: SyncGlobalConfigRequest): Promise<GlobalConfigResponse> {
  return request<GlobalConfigResponse>('/ai/global-config/sync', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>('/config')
}

export async function checkUpdate(): Promise<CheckUpdateResponse> {
  return request<CheckUpdateResponse>('/check-update', { method: 'POST' })
}

export async function doUpdate(): Promise<DoUpdateResponse> {
  return request<DoUpdateResponse>('/do-update', { method: 'POST' })
}

// ── Spec 2: Window Management ──

export async function getWindows(session: string): Promise<TmuxWindow[]> {
  return request<TmuxWindow[]>(`/sessions/${encodeURIComponent(session)}/windows`)
}

export async function createWindow(
  session: string,
  name?: string
): Promise<TmuxWindow> {
  return request<TmuxWindow>(`/sessions/${encodeURIComponent(session)}/windows`, {
    method: 'POST',
    body: JSON.stringify(name ? { window_name: name } : {}),
  })
}

export async function selectWindow(
  session: string,
  index: number
): Promise<void> {
  return request<void>(
    `/sessions/${encodeURIComponent(session)}/windows/${index}/select`,
    { method: 'PUT' }
  )
}

export async function deleteWindow(
  session: string,
  index: number
): Promise<void> {
  return request<void>(
    `/sessions/${encodeURIComponent(session)}/windows/${index}`,
    { method: 'DELETE' }
  )
}

export async function getPtySessions(): Promise<PtySessionInfo[]> {
  return request<PtySessionInfo[]>('/pty/sessions')
}

// ── Spec 2: CWD & Auto-naming ──

export async function getCwd(): Promise<CwdResponse> {
  return request<CwdResponse>('/cwd')
}

export async function getNextSessionName(dir?: string): Promise<NextNameResponse> {
  const params = dir ? `?dir=${encodeURIComponent(dir)}` : ''
  return request<NextNameResponse>(`/sessions/next-name${params}`)
}

export async function listDirs(path?: string): Promise<ListDirsResponse> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ''
  return request<ListDirsResponse>(`/dirs${params}`)
}

// ── Auth API ──

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  return request<AuthStatusResponse>('/auth/status')
}

export async function setupPassword(data: SetupPasswordRequest): Promise<AuthTokenResponse> {
  return request<AuthTokenResponse>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function skipPasswordSetup(): Promise<AuthTokenResponse> {
  return request<AuthTokenResponse>('/auth/skip', {
    method: 'POST',
  })
}

export async function login(data: LoginRequest): Promise<AuthTokenResponse> {
  return request<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  return request<void>('/auth/password', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ── Layout Persistence ──

export async function getLayouts(): Promise<import('./types').LayoutStore> {
  return request<import('./types').LayoutStore>('/layouts')
}

export async function saveLayouts(data: import('./types').LayoutStore): Promise<void> {
  return request<void>('/layouts', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

function withWorkspaceParams(params: URLSearchParams, workspace?: WorkspaceContext): URLSearchParams {
  if (!workspace) return params
  params.set('session', workspace.session)
  params.set('window', String(workspace.window))
  return params
}

// ── Notification API ──

export async function getNotifications(limit?: number): Promise<NotificationListResponse> {
  const params = limit ? `?limit=${limit}` : ''
  return request<NotificationListResponse>(`/notifications${params}`)
}

export async function deleteNotification(id: string): Promise<void> {
  return request<void>(`/notifications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function markNotificationRead(id: string): Promise<void> {
  return request<void>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT',
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  return request<void>('/notifications/read-all', {
    method: 'PUT',
  })
}

// ── File System API ──

export async function getFileTree(
  path?: string,
  workspace?: WorkspaceContext
): Promise<{ children: import('./types').FileTreeNode[] }> {
  const params = withWorkspaceParams(new URLSearchParams(), workspace)
  if (path) params.set('path', path)
  const query = params.toString()
  return request(`/files/tree${query ? `?${query}` : ''}`)
}

export async function readFile(path: string, workspace?: WorkspaceContext): Promise<import('./types').FileContent> {
  const params = withWorkspaceParams(new URLSearchParams({ path }), workspace)
  return request(`/files/read?${params}`)
}

export async function writeFile(
  path: string,
  content: string,
  workspace?: WorkspaceContext
): Promise<{ success: boolean }> {
  return request('/files/write', {
    method: 'PUT',
    body: JSON.stringify({
      path,
      content,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

export async function resolveAbsoluteFilePath(
  path: string,
  workspace?: WorkspaceContext
): Promise<{ path: string }> {
  const params = withWorkspaceParams(new URLSearchParams({ path }), workspace)
  return request(`/files/absolute?${params}`)
}

export async function resolveFilePath(
  path: string,
  workspace?: WorkspaceContext
): Promise<{ path: string }> {
  const params = withWorkspaceParams(new URLSearchParams({ path }), workspace)
  return request(`/files/resolve?${params}`)
}

export async function searchFiles(
  query: string,
  options?: { regex?: boolean; case?: boolean; glob?: string; max?: number },
  workspace?: WorkspaceContext
): Promise<import('./types').SearchResponse> {
  const params = withWorkspaceParams(new URLSearchParams({ query }), workspace)
  if (options?.regex) params.set('regex', 'true')
  if (options?.case) params.set('case', 'true')
  if (options?.glob) params.set('glob', options.glob)
  if (options?.max) params.set('max', String(options.max))
  return request(`/files/search?${params}`)
}

export async function deleteFile(
  path: string,
  workspace?: WorkspaceContext
): Promise<{ success: boolean }> {
  return request('/files/delete', {
    method: 'POST',
    body: JSON.stringify({
      path,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

export async function renameFile(
  oldPath: string,
  newName: string,
  workspace?: WorkspaceContext
): Promise<{ success: boolean; new_path: string }> {
  return request('/files/rename', {
    method: 'POST',
    body: JSON.stringify({
      old_path: oldPath,
      new_name: newName,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

export async function createFile(
  path: string,
  isDirectory: boolean,
  workspace?: WorkspaceContext
): Promise<{ success: boolean }> {
  return request('/files/create', {
    method: 'POST',
    body: JSON.stringify({
      path,
      is_directory: isDirectory,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

export async function revealInFileManager(
  path: string,
  workspace?: WorkspaceContext
): Promise<{ success: boolean }> {
  return request('/files/reveal', {
    method: 'POST',
    body: JSON.stringify({
      path,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

export async function openInApp(
  path: string,
  app: string,
  workspace?: WorkspaceContext
): Promise<{ success: boolean }> {
  return request('/files/open-in', {
    method: 'POST',
    body: JSON.stringify({
      path,
      app,
      session: workspace?.session,
      window: workspace?.window,
    }),
  })
}

// ── File Upload API ──

export interface FileUploadResult {
  path: string
  absolute_path: string
  filename: string
  size: number
}

export async function uploadFiles(
  files: File[],
  dir?: string,
  workspace?: WorkspaceContext,
): Promise<FileUploadResult[]> {
  const formData = new FormData()
  for (const file of files) formData.append('file', file, file.name)

  const params = new URLSearchParams()
  if (dir) params.set('dir', dir)
  if (workspace?.session) params.set('session', workspace.session)
  if (workspace?.window != null) params.set('window', String(workspace.window))

  const query = params.toString()
  const url = `${API_BASE}/files/upload${query ? `?${query}` : ''}`

  const headers: HeadersInit = {}
  const token = getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { method: 'POST', headers, body: formData })
  if (res.status === 401) setAuthToken(null)
  if (!res.ok) throw await res.json().catch(() => ({ error: 'unknown', message: res.statusText }))
  return res.json()
}

// ── Git API ──

export async function getGitStatus(workspace?: WorkspaceContext): Promise<import('./types').GitStatus> {
  const params = withWorkspaceParams(new URLSearchParams(), workspace)
  const query = params.toString()
  return request(`/git/status${query ? `?${query}` : ''}`)
}

export async function getGitDiff(
  path: string,
  staged?: boolean,
  workspace?: WorkspaceContext
): Promise<import('./types').GitDiffContent> {
  const params = withWorkspaceParams(new URLSearchParams({ path }), workspace)
  if (staged) params.set('staged', 'true')
  return request(`/git/diff?${params}`)
}

export async function getGitLog(
  limit?: number,
  workspace?: WorkspaceContext
): Promise<{ commits: import('./types').GitCommit[] }> {
  const params = withWorkspaceParams(new URLSearchParams(), workspace)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  return request(`/git/log${query ? `?${query}` : ''}`)
}

export async function getGitBranches(workspace?: WorkspaceContext): Promise<{ branches: import('./types').GitBranch[] }> {
  const params = withWorkspaceParams(new URLSearchParams(), workspace)
  const query = params.toString()
  return request(`/git/branches${query ? `?${query}` : ''}`)
}

export async function gitCommit(
  message: string,
  workspace?: WorkspaceContext
): Promise<{ hash: string; short_hash: string; message: string }> {
  const body: Record<string, unknown> = { message }
  if (workspace) {
    body.session = workspace.session
    body.window = workspace.window
  }
  return request('/git/commit', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function gitPush(
  workspace?: WorkspaceContext
): Promise<{ success: boolean; message: string }> {
  const body: Record<string, unknown> = {}
  if (workspace) {
    body.session = workspace.session
    body.window = workspace.window
  }
  return request('/git/push', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function gitStage(paths: string[], workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = { paths }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/stage', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitUnstage(paths: string[], workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = { paths }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/unstage', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitStageAll(workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = {}
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/stage-all', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitUnstageAll(workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = {}
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/unstage-all', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitCheckout(branch: string, workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = { branch }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/checkout', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitDiscard(paths: string[], workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = { paths }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/discard', { method: 'POST', body: JSON.stringify(body) })
}

export async function gitDiscardAll(workspace?: WorkspaceContext): Promise<void> {
  const body: Record<string, unknown> = {}
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/discard-all', { method: 'POST', body: JSON.stringify(body) })
}

// ── Worktree API ──

import type { WorktreeInfo } from './types'

export async function listWorktrees(workspace?: WorkspaceContext): Promise<{ worktrees: WorktreeInfo[] }> {
  const params = new URLSearchParams()
  if (workspace) {
    params.set('session', workspace.session)
    params.set('window', String(workspace.window))
  }
  const qs = params.toString()
  return request(`/git/worktrees${qs ? `?${qs}` : ''}`)
}

export async function createWorktree(
  baseBranch: string,
  newBranch: string,
  dirName: string,
  workspace?: WorkspaceContext,
): Promise<{ ok: boolean; path: string; branch: string }> {
  const body: Record<string, unknown> = {
    base_branch: baseBranch,
    new_branch: newBranch,
    dir_name: dirName,
  }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/worktrees', { method: 'POST', body: JSON.stringify(body) })
}

export async function removeWorktree(
  path: string,
  force = false,
  workspace?: WorkspaceContext,
): Promise<void> {
  const body: Record<string, unknown> = { path, force }
  if (workspace) { body.session = workspace.session; body.window = workspace.window }
  return request('/git/worktrees', { method: 'DELETE', body: JSON.stringify(body) })
}

// ── Image API ──

export async function deleteImage(filename: string): Promise<void> {
  return request(`/images/${encodeURIComponent(filename)}`, { method: 'DELETE' })
}

export interface CachedImage {
  filename: string
  path: string
  url: string
}

export async function listImages(): Promise<{ images: CachedImage[] }> {
  return request('/images')
}
