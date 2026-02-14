import type { WorkspaceContext } from './types'

export const TERMINAL_FILE_DRAG_MIME = 'application/x-0xmux-file-ref'
const TERMINAL_FILE_DRAG_FALLBACK_MIME = 'text/0xmux-file-ref'

export interface TerminalFileDragPayload {
  path: string
  workspace?: WorkspaceContext
}

function parseWorkspace(value: unknown): WorkspaceContext | undefined {
  if (!value || typeof value !== 'object') return undefined

  const session = (value as { session?: unknown }).session
  const window = (value as { window?: unknown }).window
  if (typeof session !== 'string') return undefined
  if (typeof window !== 'number' || !Number.isFinite(window)) return undefined

  return { session, window }
}

export function setTerminalFileDragData(
  dataTransfer: DataTransfer,
  path: string,
  workspace?: WorkspaceContext,
): void {
  const payload: TerminalFileDragPayload = workspace
    ? { path, workspace }
    : { path }
  const serialized = JSON.stringify(payload)

  dataTransfer.setData(TERMINAL_FILE_DRAG_MIME, serialized)
  dataTransfer.setData(TERMINAL_FILE_DRAG_FALLBACK_MIME, serialized)
  dataTransfer.setData('text/plain', path)
  dataTransfer.effectAllowed = 'copy'
}

export function getTerminalFileDragData(dataTransfer: DataTransfer): TerminalFileDragPayload | null {
  const raw = dataTransfer.getData(TERMINAL_FILE_DRAG_MIME)
    || dataTransfer.getData(TERMINAL_FILE_DRAG_FALLBACK_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const path = (parsed as { path?: unknown }).path
    if (typeof path !== 'string' || path.length === 0) return null

    return {
      path,
      workspace: parseWorkspace((parsed as { workspace?: unknown }).workspace),
    }
  } catch {
    return null
  }
}

export function isTerminalFileDrag(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types)
  return types.includes(TERMINAL_FILE_DRAG_MIME) || types.includes(TERMINAL_FILE_DRAG_FALLBACK_MIME)
}
