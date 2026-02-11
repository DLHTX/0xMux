import { useCallback, useRef, useState } from 'react'
import type { SplitLayout, SplitDirection, PaneWindow } from '../lib/types'
import { createSession as apiCreateSession, getCwd, getNextSessionName, createWindow } from '../lib/api'

const MAX_PANES = 128

function generateId(): string {
  return crypto.randomUUID()
}

function createLeaf(): SplitLayout {
  return { id: generateId(), type: 'leaf' }
}

/** Layout history entry for a window */
export interface LayoutHistory {
  layout: SplitLayout
  paneWindowMap: Record<string, PaneWindow>
  activePaneId: string | null
}

/** Serialize layout to JSON (for deep comparison) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function serializeLayout(layout: SplitLayout, paneSessionMap: Record<string, string>): string {
  return JSON.stringify({ layout, paneSessionMap })
}

/** Extract project name from session name (e.g., "myproject-1" -> "myproject") */
export function extractProjectName(sessionName: string): string {
  // Remove trailing numbers and hyphens
  return sessionName.replace(/-\d+$/, '')
}

/** Generate a consistent color for a project name */
export function getProjectColor(projectName: string): string {
  // Simple hash function
  let hash = 0
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Generate HSL color with consistent hue
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 70%, 60%)`
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
  // Create initial state in a way that ensures consistency
  const [state] = useState(() => {
    const leaf = createLeaf()
    return {
      layout: leaf,
      activePaneId: leaf.id,
    }
  })

  const [layout, setLayout] = useState<SplitLayout>(state.layout)
  const [paneWindowMap, setPaneWindowMap] = useState<Record<string, PaneWindow>>({})
  const [activePaneId, setActivePaneId] = useState<string | null>(state.activePaneId)

  // Layout history: "sessionName:windowIndex" -> LayoutHistory
  const layoutHistory = useRef<Map<string, LayoutHistory>>(new Map())

  const splitLock = useRef(false)

  /** Assign an existing window to a pane */
  const assignWindow = useCallback((paneId: string, sessionName: string, windowIndex: number) => {
    setPaneWindowMap((prev) => ({ ...prev, [paneId]: { sessionName, windowIndex } }))
  }, [])

  /** Remove a window assignment from a pane */
  const unassignWindow = useCallback((paneId: string) => {
    setPaneWindowMap((prev) => {
      const next = { ...prev }
      delete next[paneId]
      return next
    })
  }, [])

  /**
   * Split a pane and automatically create a new tmux window in the same session.
   * Returns the new pane ID or null if split failed.
   */
  const splitPane = useCallback(
    async (nodeId: string, direction: SplitDirection): Promise<string | null> => {
      if (splitLock.current) return null
      splitLock.current = true

      try {
        // Find current pane's window
        const currentWindow = paneWindowMap[nodeId]
        if (!currentWindow) {
          throw new Error('Current pane not found in window map')
        }

        // Create a new window in the same session
        const newWindow = await createWindow(currentWindow.sessionName)

        let newPaneId: string | null = null
        setLayout((prev) => {
          const [updated, id] = splitNode(prev, nodeId, direction)
          newPaneId = id
          return updated
        })

        if (newPaneId) {
          setPaneWindowMap((prev) => ({
            ...prev,
            [newPaneId!]: {
              sessionName: currentWindow.sessionName,
              windowIndex: newWindow.index,
            },
          }))
        }

        return newPaneId
      } finally {
        splitLock.current = false
      }
    },
    [paneWindowMap]
  )

  /** Close a pane (removes from layout and paneWindowMap, does NOT kill the window) */
  const closePane = useCallback((nodeId: string) => {
    setLayout((prev) => {
      const result = closeNode(prev, nodeId)
      return result ?? createLeaf()
    })
    setPaneWindowMap((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }, [])

  const getPaneIds = useCallback(() => {
    return getAllLeafIds(layout)
  }, [layout])

  /** Save current layout state for a window */
  const saveLayoutHistory = useCallback((key: string) => {
    // Don't save if it's a single-pane layout
    const leafIds = getAllLeafIds(layout)
    if (leafIds.length === 1 && Object.keys(paneWindowMap).length <= 1) {
      return
    }

    layoutHistory.current.set(key, {
      layout: JSON.parse(JSON.stringify(layout)), // deep clone
      paneWindowMap: { ...paneWindowMap },
      activePaneId,
    })
  }, [layout, paneWindowMap, activePaneId])

  /** Restore layout from history for a window */
  const restoreLayoutHistory = useCallback((key: string): boolean => {
    const history = layoutHistory.current.get(key)
    if (!history) return false

    setLayout(history.layout)
    setPaneWindowMap(history.paneWindowMap)
    setActivePaneId(history.activePaneId)
    return true
  }, [])

  /** Find pane ID that contains a specific window */
  const findPaneByWindow = useCallback(
    (sessionName: string, windowIndex: number): string | null => {
      for (const [paneId, pw] of Object.entries(paneWindowMap)) {
        if (pw.sessionName === sessionName && pw.windowIndex === windowIndex) {
          return paneId
        }
      }
      return null
    },
    [paneWindowMap]
  )

  /** Switch to a window with smart layout management */
  const switchToWindow = useCallback(
    (sessionName: string, windowIndex: number): 'focus' | 'restore' | 'replace' => {
      // Save current layout if we're leaving a multi-pane setup
      if (activePaneId) {
        const current = paneWindowMap[activePaneId]
        if (current) {
          const key = `${current.sessionName}:${current.windowIndex}`
          saveLayoutHistory(key)
        }
      }

      // Strategy 1: Window is already open in a pane → just focus it
      const existingPaneId = findPaneByWindow(sessionName, windowIndex)
      if (existingPaneId) {
        setActivePaneId(existingPaneId)
        return 'focus'
      }

      // Strategy 2: Window has a saved layout → restore it
      const key = `${sessionName}:${windowIndex}`
      if (restoreLayoutHistory(key)) {
        return 'restore'
      }

      // Strategy 3: Replace current view with single pane
      const singleLeaf = createLeaf()
      setLayout(singleLeaf)
      setPaneWindowMap({ [singleLeaf.id]: { sessionName, windowIndex } })
      setActivePaneId(singleLeaf.id)
      return 'replace'
    },
    [activePaneId, paneWindowMap, saveLayoutHistory, restoreLayoutHistory, findPaneByWindow]
  )

  const paneCount = countLeaves(layout)
  const canSplit = paneCount < MAX_PANES

  return {
    layout,
    splitPane,
    closePane,
    getPaneIds,
    paneCount,
    canSplit,
    paneWindowMap,
    assignWindow,
    unassignWindow,
    activePaneId,
    setActivePaneId,
    saveLayoutHistory,
    restoreLayoutHistory,
    findPaneByWindow,
    switchToWindow,
  }
}
