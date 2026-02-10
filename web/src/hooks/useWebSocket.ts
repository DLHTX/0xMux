import { useEffect, useRef, useState, useCallback } from 'react'
import type { ConnectionStatus, WsMessage } from '../lib/types'
import { getAuthToken } from '../lib/api'

interface UseWebSocketOptions {
  onMessage?: (msg: WsMessage) => void
}

export function useWebSocket(options?: UseWebSocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>()
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getAuthToken()
    const wsUrl = token
      ? `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      retryCount.current = 0

      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30_000)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        options?.onMessage?.(msg)
      } catch {
        // ignore non-JSON messages
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      cleanup()
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.onMessage])

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current)
      heartbeatTimer.current = undefined
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(1000 * 2 ** retryCount.current, 30_000)
    retryCount.current++
    reconnectTimer.current = setTimeout(connect, delay)
  }, [connect])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      cleanup()
      wsRef.current?.close()
    }
  }, [connect, cleanup])

  return { status }
}
