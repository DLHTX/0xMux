import { useCallback, useEffect, useState } from 'react'
import type { Dependency, SystemDepsResponse } from '../lib/types'
import * as api from '../lib/api'

export function useDeps() {
  const [deps, setDeps] = useState<SystemDepsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const allReady = deps?.dependencies.every(
    (d) => d.installed || !d.required
  ) ?? false

  const refresh = useCallback(async () => {
    try {
      const data = await api.getSystemDeps()
      setDeps(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const installPackage = useCallback(
    async (name: string) => {
      const task = await api.installPackage({ package: name })

      // Connect to install WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${protocol}//${window.location.host}${task.ws_url}`
      )

      return new Promise<void>((resolve) => {
        const logs: string[] = []

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'install_log') {
              logs.push(msg.data.line)
              window.dispatchEvent(
                new CustomEvent('install-log', { detail: msg.data })
              )
            }
            if (msg.type === 'install_complete') {
              window.dispatchEvent(
                new CustomEvent('install-complete', { detail: msg.data })
              )
              refresh()
              resolve()
              ws.close()
            }
            if (msg.type === 'install_error') {
              window.dispatchEvent(
                new CustomEvent('install-error', { detail: msg.data })
              )
              resolve()
              ws.close()
            }
          } catch {
            // ignore
          }
        }

        ws.onerror = () => {
          resolve()
          ws.close()
        }
      })
    },
    [refresh]
  )

  const restartServer = useCallback(async () => {
    await api.restartServer()
  }, [])

  return {
    deps,
    loading,
    allReady,
    installPackage,
    restartServer,
    refresh,
  }
}
