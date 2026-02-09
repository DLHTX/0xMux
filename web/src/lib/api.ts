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
} from './types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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
