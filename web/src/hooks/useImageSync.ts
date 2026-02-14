import { useEffect, useRef } from 'react'
import { listImages } from '../lib/api'
import { refreshFromServer, syncFromServer, getRegistrySize } from '../lib/imageRegistry'

const POLL_INTERVAL = 3000

/**
 * Polls GET /api/images every 3 seconds.
 * When the server image count differs from the local registry size,
 * triggers a full registry rebuild so [Image #N] links resolve correctly.
 *
 * Replaces the one-shot syncFromServer() that was called in App.tsx.
 */
export function useImageSync(): void {
  const lastCountRef = useRef(-1)

  useEffect(() => {
    // Initial sync (same as the old one-shot call)
    syncFromServer().then(() => {
      lastCountRef.current = getRegistrySize()
    })

    const id = setInterval(async () => {
      try {
        const { images } = await listImages()
        const serverCount = images.length
        if (serverCount !== lastCountRef.current) {
          await refreshFromServer()
          lastCountRef.current = getRegistrySize()
        }
      } catch {
        // Ignore — server may be temporarily unreachable
      }
    }, POLL_INTERVAL)

    return () => clearInterval(id)
  }, [])
}
