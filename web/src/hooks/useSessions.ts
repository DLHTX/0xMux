import { useCallback, useEffect, useState } from 'react'
import type { TmuxSession, WsMessage, SessionsUpdateData } from '../lib/types'
import * as api from '../lib/api'
import { useWebSocket } from './useWebSocket'

export function useSessions() {
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'sessions_update') {
      const data = msg.data as SessionsUpdateData
      setSessions(data.sessions)
    }
  }, [])

  const { status } = useWebSocket({ onMessage: handleWsMessage })

  useEffect(() => {
    api.getSessions()
      .then((data) => {
        setSessions(data)
        setError(null)
      })
      .catch(() => setError('Failed to fetch sessions'))
      .finally(() => setLoading(false))
  }, [])

  const createSession = useCallback(async (name: string, startDirectory?: string) => {
    const session = await api.createSession({ name, start_directory: startDirectory })
    setSessions((prev) => [...prev, session])
    return session
  }, [])

  const deleteSession = useCallback(async (name: string) => {
    // 乐观删除：先从 UI 移除，再异步请求服务器
    setSessions((prev) => prev.filter((s) => s.name !== name))
    try {
      await api.deleteSession(name)
    } catch (e) {
      // 失败时重新获取真实列表
      const data = await api.getSessions()
      setSessions(data)
      throw e
    }
  }, [])

  const renameSession = useCallback(async (oldName: string, newName: string) => {
    const session = await api.renameSession(oldName, { name: newName })
    setSessions((prev) => prev.map((s) => (s.name === oldName ? session : s)))
    return session
  }, [])

  return {
    sessions,
    loading,
    error,
    connectionStatus: status,
    createSession,
    deleteSession,
    renameSession,
  }
}
