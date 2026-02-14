import type { WorkspaceContext } from './types'
import type { CachedImage } from './api'

let counter = 0
const byIndex = new Map<number, { path: string; url: string }>()
const byPath = new Map<string, { index: number; url: string }>()

export function registerImage(path: string, url: string): number {
  const existing = byPath.get(path)
  if (existing) return existing.index

  counter++
  byIndex.set(counter, { path, url })
  byPath.set(path, { index: counter, url })
  return counter
}

export function resolveImageByIndex(n: number): { path: string; url: string } | null {
  return byIndex.get(n) ?? null
}

export function resolveImageByPath(path: string): { index: number; url: string } | null {
  return byPath.get(path) ?? null
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i
const CACHE_PATH_RE = /\.cache\/0xmux\/images\/([^/\\]+)$/

export function isImagePath(path: string): boolean {
  return IMAGE_EXT_RE.test(path)
}

export function resolveImageUrl(filePath: string, workspace?: WorkspaceContext): string | null {
  // 1. Check registry
  const registered = byPath.get(filePath)
  if (registered) return registered.url

  // 2. Match ~/.cache/0xmux/images/{filename}
  const cacheMatch = CACHE_PATH_RE.exec(filePath)
  if (cacheMatch) {
    return `/api/images/${encodeURIComponent(cacheMatch[1])}`
  }

  // 3. Check if it's an image file — use raw file API
  if (IMAGE_EXT_RE.test(filePath)) {
    const params = new URLSearchParams({ path: filePath })
    if (workspace) {
      params.set('session', workspace.session)
      params.set('window', String(workspace.window))
    }
    return `/api/files/raw?${params}`
  }

  return null
}

/**
 * Sync registry from server's cached images list.
 * Called once on app startup to populate the registry with
 * images that were uploaded in previous sessions.
 * Images are sorted by mtime (oldest first), so index matches
 * the order Claude Code assigns [Image #N] references.
 */
export async function syncFromServer(): Promise<void> {
  try {
    const { listImages } = await import('./api')
    const { images } = await listImages()
    for (const img of images) {
      registerImage(img.path, img.url)
    }
  } catch {
    // Ignore — images list may not be available
  }
}

/**
 * Completely rebuild the registry from server state.
 * Clears all existing entries and re-fetches, ensuring
 * the index order always matches the server's mtime sort.
 */
export async function refreshFromServer(): Promise<void> {
  try {
    const { listImages } = await import('./api')
    const { images } = await listImages()
    // Clear existing state
    byIndex.clear()
    byPath.clear()
    counter = 0
    // Re-populate
    for (const img of images) {
      registerImage(img.path, img.url)
    }
  } catch {
    // Ignore — images list may not be available
  }
}

/** Return the current number of registered images (for change detection). */
export function getRegistrySize(): number {
  return byIndex.size
}
