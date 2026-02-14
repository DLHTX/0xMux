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
  WorkspaceContext,
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
