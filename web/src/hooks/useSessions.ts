import { useCallback, useEffect, useState } from 'react'
import type { TmuxSession } from '../lib/types'
import * as api from '../lib/api'
import { useMux } from '../contexts/MuxContext'

export function useSessions() {
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mux = useMux()

  // Subscribe to real-time session updates via MuxSocket
  useEffect(() => {
    return mux.onSessionsUpdate((updatedSessions) => {
      setSessions(updatedSessions)
    })
  }, [mux])

  // Initial fetch via REST
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
    // Optimistic delete: remove from UI first, then request server
    setSessions((prev) => prev.filter((s) => s.name !== name))
    try {
      await api.deleteSession(name)
    } catch (e) {
      // On failure, re-fetch the real list
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
    connectionStatus: mux.status,
    createSession,
    deleteSession,
    renameSession,
  }
}
