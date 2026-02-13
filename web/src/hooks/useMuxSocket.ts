import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionStatus, TmuxSession, TmuxWindow } from '../lib/types'
import { getAuthToken } from '../lib/api'

// ── Public types ──

export interface MuxChannelHandle {
  /** Channel ID assigned by the client */
  ch: number
  /** Send terminal input to the PTY */
  send(data: string): void
  /** Resize the PTY */
  resize(cols: number, rows: number): void
  /** Scroll tmux history for this channel (negative = up, positive = down) */
  scroll(lines: number): void
  /** Close the channel (kills grouped tmux session on server) */
  close(): void
}

export interface OpenChannelOptions {
  session: string
  window: number
  cols: number
  rows: number
  onOutput: (data: Uint8Array) => void
  onOpen?: () => void
  onClose?: (code: number) => void
  onError?: (message: string) => void
  onScrollState?: (state: { history: number; position: number }) => void
}

export interface UseMuxSocketReturn {
  /** WebSocket connection status */
  status: ConnectionStatus
  /** Open a PTY channel for a tmux window */
  openChannel(opts: OpenChannelOptions): MuxChannelHandle
  /** Subscribe to session list updates. Returns unsubscribe function. */
  onSessionsUpdate(cb: (sessions: TmuxSession[]) => void): () => void
  /** Subscribe to per-session window list updates. Returns unsubscribe function. */
  onWindowsUpdate(cb: (windows: Record<string, TmuxWindow[]>) => void): () => void
}

// ── Internal types ──

interface ChannelEntry {
  ch: number
  session: string
  window: number
  cols: number
  rows: number
  onOutput: (data: Uint8Array) => void
  onOpen?: () => void
  onClose?: (code: number) => void
  onError?: (message: string) => void
  onScrollState?: (state: { history: number; position: number }) => void
  /** Whether the server has confirmed this channel is open */
  opened: boolean
}

// ── Hook ──

export function useMuxSocket(): UseMuxSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const channelsRef = useRef(new Map<number, ChannelEntry>())
  const nextChRef = useRef(1)
  const sessionListenersRef = useRef(new Set<(sessions: TmuxSession[]) => void>())
  const windowListenersRef = useRef(new Set<(windows: Record<string, TmuxWindow[]>) => void>())
  const latestSessionsRef = useRef<TmuxSession[] | null>(null)
  const latestWindowsRef = useRef<Record<string, TmuxWindow[]> | null>(null)

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const mountedRef = useRef(true)

  // ── Helpers ──

  const sendJson = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }, [])

  const sendBinary = useCallback((ch: number, payload: Uint8Array) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      const frame = new Uint8Array(2 + payload.length)
      frame[0] = (ch >> 8) & 0xff
      frame[1] = ch & 0xff
      frame.set(payload, 2)
      ws.send(frame)
    }
  }, [])

  const sendOpenMessage = useCallback(
    (entry: ChannelEntry) => {
      sendJson({
        type: 'open',
        ch: entry.ch,
        session: entry.session,
        window: entry.window,
        cols: entry.cols,
        rows: entry.rows,
      })
    },
    [sendJson]
  )

  const cleanup = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  // ── Connection ──

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getAuthToken()
    let url = `${protocol}//${window.location.host}/ws/mux`
    if (token) {
      url += `?token=${encodeURIComponent(token)}`
    }

    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close()
        return
      }
      setStatus('connected')
      retryCountRef.current = 0

      // Re-open all active channels
      for (const entry of channelsRef.current.values()) {
        entry.opened = false
        sendOpenMessage(entry)
      }

      // Heartbeat
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30_000)
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame: [ch_hi, ch_lo, ...payload]
        const view = new Uint8Array(event.data)
        if (view.length < 2) return
        const ch = (view[0] << 8) | view[1]
        const payload = view.subarray(2)
        const entry = channelsRef.current.get(ch)
        if (entry) {
          entry.onOutput(payload)
        }
      } else if (typeof event.data === 'string') {
        // Text frame: JSON control message
        try {
          const msg = JSON.parse(event.data)
          handleControlMessage(msg)
        } catch {
          // ignore non-JSON text
        }
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      cleanup()
      // Mark all channels as not opened (server cleaned them up)
      for (const entry of channelsRef.current.values()) {
        entry.opened = false
      }
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendOpenMessage, cleanup])

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return
    const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000)
    retryCountRef.current++
    reconnectTimerRef.current = setTimeout(connect, delay)
  }, [connect])

  // ── Control message dispatch ──

  const handleControlMessage = useCallback(
    (msg: {
      type: string
      ch?: number
      code?: number
      message?: string
      data?: unknown
      history?: number
      position?: number
    }) => {
      switch (msg.type) {
        case 'opened': {
          if (msg.ch == null) return
          const entry = channelsRef.current.get(msg.ch)
          if (entry) {
            entry.opened = true
            entry.onOpen?.()
          }
          break
        }
        case 'closed': {
          if (msg.ch == null) return
          const entry = channelsRef.current.get(msg.ch)
          if (entry) {
            entry.onClose?.(msg.code ?? 0)
            // Don't remove from map — keep for re-open on reconnect
            // The caller can call handle.close() to fully remove
          }
          break
        }
        case 'error': {
          if (msg.ch == null) return
          const entry = channelsRef.current.get(msg.ch)
          if (entry) {
            entry.onError?.(msg.message ?? 'Unknown error')
          }
          break
        }
        case 'sessions_update': {
          const data = msg.data as {
            sessions?: TmuxSession[]
            windows?: Record<string, TmuxWindow[]>
          } | undefined
          if (data?.sessions) {
            latestSessionsRef.current = data.sessions
            for (const cb of sessionListenersRef.current) {
              cb(data.sessions)
            }
          }
          if (data?.windows) {
            latestWindowsRef.current = data.windows
            for (const cb of windowListenersRef.current) {
              cb(data.windows)
            }
          }
          break
        }
        case 'pong':
          break // heartbeat reply, nothing to do
        case 'scroll_state': {
          if (msg.ch == null) return
          const entry = channelsRef.current.get(msg.ch)
          if (!entry) return
          const history = Number.isFinite(msg.history) ? Math.max(0, Math.trunc(msg.history as number)) : 0
          const position = Number.isFinite(msg.position) ? Math.max(0, Math.trunc(msg.position as number)) : 0
          entry.onScrollState?.({ history, position: Math.min(position, history) })
          break
        }
        default:
          break
      }
    },
    []
  )

  // ── Lifecycle ──

  useEffect(() => {
    mountedRef.current = true
    connect()

    // Ensure WS is closed immediately on page refresh / navigation so the
    // server can start cleaning up PTYs before the new page reconnects.
    const handleBeforeUnload = () => {
      wsRef.current?.close()
      wsRef.current = null
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      mountedRef.current = false
      cleanup()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect, cleanup])

  // ── Public API ──

  const openChannel = useCallback(
    (opts: OpenChannelOptions): MuxChannelHandle => {
      const ch = nextChRef.current++
      const entry: ChannelEntry = {
        ch,
        session: opts.session,
        window: opts.window,
        cols: opts.cols,
        rows: opts.rows,
        onOutput: opts.onOutput,
        onOpen: opts.onOpen,
        onClose: opts.onClose,
        onError: opts.onError,
        onScrollState: opts.onScrollState,
        opened: false,
      }
      channelsRef.current.set(ch, entry)

      // Send open message if WS is connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendOpenMessage(entry)
      }
      // Otherwise it will be sent when WS connects (in onopen handler)

      const encoder = new TextEncoder()

      const handle: MuxChannelHandle = {
        ch,
        send: (data: string) => {
          sendBinary(ch, encoder.encode(data))
        },
        resize: (cols: number, rows: number) => {
          // Update stored size for re-open
          const e = channelsRef.current.get(ch)
          if (e) {
            e.cols = cols
            e.rows = rows
          }
          sendJson({ type: 'resize', ch, cols, rows })
        },
        scroll: (lines: number) => {
          if (!Number.isFinite(lines) || lines === 0) return
          sendJson({ type: 'scroll', ch, lines: Math.trunc(lines) })
        },
        close: () => {
          channelsRef.current.delete(ch)
          sendJson({ type: 'close', ch })
        },
      }

      return handle
    },
    [sendOpenMessage, sendBinary, sendJson]
  )

  const onSessionsUpdate = useCallback(
    (cb: (sessions: TmuxSession[]) => void): (() => void) => {
      sessionListenersRef.current.add(cb)
      if (latestSessionsRef.current) {
        cb(latestSessionsRef.current)
      }
      return () => {
        sessionListenersRef.current.delete(cb)
      }
    },
    []
  )

  const onWindowsUpdate = useCallback(
    (cb: (windows: Record<string, TmuxWindow[]>) => void): (() => void) => {
      windowListenersRef.current.add(cb)
      if (latestWindowsRef.current) {
        cb(latestWindowsRef.current)
      }
      return () => {
        windowListenersRef.current.delete(cb)
      }
    },
    []
  )

  return { status, openChannel, onSessionsUpdate, onWindowsUpdate }
}
