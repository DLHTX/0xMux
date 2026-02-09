import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionStatus } from '../lib/types'

export interface UsePtySocketOptions {
  session: string
  cols?: number
  rows?: number
  onOutput?: (data: Uint8Array) => void
  onExit?: (code: number) => void
  onError?: (message: string) => void
  enabled?: boolean
}

export function usePtySocket(options: UsePtySocketOptions) {
  const {
    session,
    cols = 80,
    rows = 24,
    onOutput,
    onExit,
    onError,
    enabled = true,
  } = options

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>()
  const retryCount = useRef(0)
  const mountedRef = useRef(true)

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current)
      heartbeatTimer.current = undefined
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = undefined
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !session) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/pty?session=${encodeURIComponent(session)}&cols=${cols}&rows=${rows}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setStatus('connected')
      retryCount.current = 0

      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30_000)
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onOutput?.(new Uint8Array(event.data))
      } else if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'exit') {
            onExit?.(msg.code ?? 0)
          } else if (msg.type === 'error') {
            onError?.(msg.message ?? 'Unknown error')
          }
        } catch {
          // ignore non-JSON text
        }
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      cleanup()
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [session, cols, rows, enabled, onOutput, onExit, onError, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !enabled) return
    const delay = Math.min(1000 * 2 ** retryCount.current, 30_000)
    retryCount.current++
    reconnectTimer.current = setTimeout(connect, delay)
  }, [connect, enabled])

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const encoder = new TextEncoder()
      wsRef.current.send(encoder.encode(data))
    }
  }, [])

  const resize = useCallback((newCols: number, newRows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'resize', cols: newCols, rows: newRows })
      )
    }
  }, [])

  const disconnect = useCallback(() => {
    cleanup()
    wsRef.current?.close()
    wsRef.current = null
    setStatus('disconnected')
  }, [cleanup])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      cleanup()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect, cleanup])

  return { status, send, resize, disconnect }
}
