import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseWindowActivityReturn {
  /** Whether the given window currently has active output (streaming) */
  isActive: (windowKey: string) => boolean
  /** Get unread output burst count for a background window */
  getUnreadCount: (windowKey: string) => number
  /** Record PTY output for a window — call on every binary frame */
  recordOutput: (windowKey: string) => void
  /** Mark a window as viewed — clears unread count */
  markViewed: (windowKey: string) => void
  /** Set the currently visible windows (on-screen panes) */
  setVisibleWindows: (keys: Set<string>) => void
  /** Subscribe to completion events (background window output stopped) */
  onCompletion: (cb: (windowKey: string) => void) => () => void
  /** Revision counter for triggering re-renders */
  revision: number
}

/** Debounce: activity indicator disappears after this many ms of silence */
const ACTIVE_TIMEOUT_MS = 2000
/** Debounce: completion fires after this many ms of silence (for non-visible windows) */
const COMPLETION_TIMEOUT_MS = 3000

export function useWindowActivity(): UseWindowActivityReturn {
  const [revision, setRevision] = useState(0)
  const bump = () => setRevision((r) => r + 1)

  // Core state in refs to avoid stale closures in timers
  const activeWindowsRef = useRef(new Set<string>())
  const unreadCountsRef = useRef(new Map<string, number>())
  const visibleWindowsRef = useRef(new Set<string>())

  // Per-window timers
  const activeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const completionTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Completion event subscribers
  const completionListenersRef = useRef(new Set<(windowKey: string) => void>())

  const recordOutput = useCallback((windowKey: string) => {
    const wasActive = activeWindowsRef.current.has(windowKey)

    // Mark as active
    activeWindowsRef.current.add(windowKey)
    if (!wasActive) bump()

    // Reset active timer (2s idle → remove from active set)
    const existingActive = activeTimersRef.current.get(windowKey)
    if (existingActive) clearTimeout(existingActive)
    activeTimersRef.current.set(
      windowKey,
      setTimeout(() => {
        activeWindowsRef.current.delete(windowKey)
        activeTimersRef.current.delete(windowKey)
        bump()
      }, ACTIVE_TIMEOUT_MS),
    )

    // Reset completion timer (3s idle → fire completion if not visible)
    const existingCompletion = completionTimersRef.current.get(windowKey)
    if (existingCompletion) clearTimeout(existingCompletion)
    completionTimersRef.current.set(
      windowKey,
      setTimeout(() => {
        completionTimersRef.current.delete(windowKey)
        // Only notify for non-visible windows
        if (!visibleWindowsRef.current.has(windowKey)) {
          // Increment unread count
          const prev = unreadCountsRef.current.get(windowKey) ?? 0
          unreadCountsRef.current.set(windowKey, prev + 1)
          bump()
          // Fire completion callbacks
          completionListenersRef.current.forEach((cb) => {
            try { cb(windowKey) } catch { /* ignore */ }
          })
        }
      }, COMPLETION_TIMEOUT_MS),
    )
  }, [])

  const markViewed = useCallback((windowKey: string) => {
    if (unreadCountsRef.current.has(windowKey)) {
      unreadCountsRef.current.delete(windowKey)
      bump()
    }
  }, [])

  const setVisibleWindows = useCallback((keys: Set<string>) => {
    visibleWindowsRef.current = keys
    // Auto-clear unread for any newly visible window
    let changed = false
    keys.forEach((key) => {
      if (unreadCountsRef.current.has(key)) {
        unreadCountsRef.current.delete(key)
        changed = true
      }
    })
    if (changed) bump()
  }, [])

  const isActive = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (windowKey: string) => activeWindowsRef.current.has(windowKey),
    // revision in deps ensures callers re-evaluate when state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  )

  const getUnreadCount = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (windowKey: string) => unreadCountsRef.current.get(windowKey) ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  )

  const onCompletion = useCallback((cb: (windowKey: string) => void) => {
    completionListenersRef.current.add(cb)
    return () => {
      completionListenersRef.current.delete(cb)
    }
  }, [])

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      completionTimersRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  return {
    isActive,
    getUnreadCount,
    recordOutput,
    markViewed,
    setVisibleWindows,
    onCompletion,
    revision,
  }
}
