/**
 * Per-session init commands — stored in localStorage.
 *
 * When a session is created with an init command, every NEW window in that
 * session will automatically execute the command after the shell initialises.
 */

import { loadJSON, saveJSON } from './storage'

const STORAGE_KEY = '0xmux-init-cmds'

// ── Pending queue (module-scoped, not persisted — survives only within a page lifecycle) ──

const pendingWindows = new Set<string>()

function windowKey(session: string, windowIndex: number) {
  return `${session}:${windowIndex}`
}

// ── Persistent storage ──

function loadAll(): Record<string, string> {
  return loadJSON<Record<string, string>>(STORAGE_KEY) ?? {}
}

function saveAll(map: Record<string, string>) {
  saveJSON(STORAGE_KEY, map)
}

/** Save an init command for a session. Pass empty string to remove. */
export function setInitCommand(sessionName: string, command: string) {
  const map = loadAll()
  if (command) {
    map[sessionName] = command
  } else {
    delete map[sessionName]
  }
  saveAll(map)
}

/** Get the init command stored for a session (or null). */
export function getInitCommand(sessionName: string): string | null {
  return loadAll()[sessionName] ?? null
}

/** Mark a specific window as "needs init command on first connect". */
export function markWindowPending(sessionName: string, windowIndex: number) {
  pendingWindows.add(windowKey(sessionName, windowIndex))
}

/**
 * If the window is in the pending queue, return its init command and
 * remove it from the queue. Returns null if nothing is pending.
 */
export function consumePendingInit(sessionName: string, windowIndex: number): string | null {
  const key = windowKey(sessionName, windowIndex)
  if (!pendingWindows.has(key)) return null
  pendingWindows.delete(key)
  return getInitCommand(sessionName)
}
