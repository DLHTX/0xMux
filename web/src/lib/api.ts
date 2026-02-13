import type {
  TmuxSession,
  TmuxWindow,
  PtySessionInfo,
  SystemDepsResponse,
  InstallTaskResponse,
  HealthResponse,
  ConfigResponse,
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
