import { useCallback, useRef, useState } from 'react'
import type { SplitLayout, SplitDirection } from '../lib/types'
import { createSession as apiCreateSession, getCwd, getNextSessionName } from '../lib/api'

const MAX_PANES = 128

function generateId(): string {
  return crypto.randomUUID()
}

function createLeaf(): SplitLayout {
  return { id: generateId(), type: 'leaf' }
}

function countLeaves(node: SplitLayout): number {
  if (node.type === 'leaf') return 1
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

/** Split a leaf node into a branch, returning [newLayout, newLeafId] */
function splitNode(
  root: SplitLayout,
  nodeId: string,
  direction: SplitDirection
): [SplitLayout, string | null] {
  if (countLeaves(root) >= MAX_PANES) return [root, null]

  if (root.id === nodeId && root.type === 'leaf') {
    const newLeaf = createLeaf()
    return [
      {
        id: generateId(),
        type: 'branch',
        direction,
        sizes: [50, 50],
        children: [{ ...root }, newLeaf],
      },
      newLeaf.id,
    ]
  }

  if (root.type === 'branch') {
    let newPaneId: string | null = null
    const newChildren = root.children.map((child) => {
      if (newPaneId) return child // already split
      const [updated, id] = splitNode(child, nodeId, direction)
      if (id) newPaneId = id
      return updated
    })
    return [{ ...root, children: newChildren }, newPaneId]
  }

  return [root, null]
}

function closeNode(root: SplitLayout, nodeId: string): SplitLayout | null {
  if (root.type === 'leaf') {
    return root.id === nodeId ? null : root
  }

  const newChildren = root.children
    .map((child) => closeNode(child, nodeId))
    .filter((c): c is SplitLayout => c !== null)

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  return { ...root, children: newChildren }
}

export function getAllLeafIds(node: SplitLayout): string[] {
  if (node.type === 'leaf') return [node.id]
  return node.children.flatMap(getAllLeafIds)
}

export function useSplitLayout() {
  const [layout, setLayout] = useState<SplitLayout>(createLeaf)
  const [paneSessionMap, setPaneSessionMap] = useState<Record<string, string>>({})
  const splitLock = useRef(false)

  /** Assign an existing session to a pane */
  const assignSession = useCallback((paneId: string, sessionName: string) => {
    setPaneSessionMap((prev) => ({ ...prev, [paneId]: sessionName }))
  }, [])

  /** Remove a session assignment from a pane */
  const unassignSession = useCallback((paneId: string) => {
    setPaneSessionMap((prev) => {
      const next = { ...prev }
      delete next[paneId]
      return next
    })
  }, [])

  /**
   * Split a pane and automatically create a new tmux session for the new pane.
   * Returns the new pane ID or null if split failed.
   */
  const splitPane = useCallback(
    async (nodeId: string, direction: SplitDirection): Promise<string | null> => {
      if (splitLock.current) return null
      splitLock.current = true

      try {
        // Create a new tmux session
        const cwdResp = await getCwd()
        const nextName = await getNextSessionName(cwdResp.path)
        const session = await apiCreateSession({
          name: nextName.name,
          start_directory: cwdResp.path,
        })

        let newPaneId: string | null = null
        setLayout((prev) => {
          const [updated, id] = splitNode(prev, nodeId, direction)
          newPaneId = id
          return updated
        })

        if (newPaneId) {
          setPaneSessionMap((prev) => ({ ...prev, [newPaneId!]: session.name }))
        }

        return newPaneId
      } finally {
        splitLock.current = false
      }
    },
    []
  )

  /** Close a pane (removes from layout and paneSessionMap, does NOT kill the session) */
  const closePane = useCallback((nodeId: string) => {
    setLayout((prev) => {
      const result = closeNode(prev, nodeId)
      return result ?? createLeaf()
    })
    setPaneSessionMap((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }, [])

  const getPaneIds = useCallback(() => {
    return getAllLeafIds(layout)
  }, [layout])

  const paneCount = countLeaves(layout)
  const canSplit = paneCount < MAX_PANES

  return {
    layout,
    splitPane,
    closePane,
    getPaneIds,
    paneCount,
    canSplit,
    paneSessionMap,
    assignSession,
    unassignSession,
  }
}
