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

/** Layout history entry for a session */
export interface LayoutHistory {
  layout: SplitLayout
  paneSessionMap: Record<string, string>
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
  const [paneSessionMap, setPaneSessionMap] = useState<Record<string, string>>({})
  const [activePaneId, setActivePaneId] = useState<string | null>(state.activePaneId)

  // Layout history: sessionName -> LayoutHistory
  const layoutHistory = useRef<Map<string, LayoutHistory>>(new Map())

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

  /** Save current layout state for a session */
  const saveLayoutHistory = useCallback((sessionName: string) => {
    // Don't save if it's a single-pane layout
    const leafIds = getAllLeafIds(layout)
    if (leafIds.length === 1 && Object.keys(paneSessionMap).length <= 1) {
      return
    }

    layoutHistory.current.set(sessionName, {
      layout: JSON.parse(JSON.stringify(layout)), // deep clone
      paneSessionMap: { ...paneSessionMap },
      activePaneId,
    })
  }, [layout, paneSessionMap, activePaneId])

  /** Restore layout from history for a session */
  const restoreLayoutHistory = useCallback((sessionName: string): boolean => {
    const history = layoutHistory.current.get(sessionName)
    if (!history) return false

    setLayout(history.layout)
    setPaneSessionMap(history.paneSessionMap)
    setActivePaneId(history.activePaneId)
    return true
  }, [])

  /** Find pane ID that contains a specific session */
  const findPaneBySession = useCallback(
    (sessionName: string): string | null => {
      for (const [paneId, name] of Object.entries(paneSessionMap)) {
        if (name === sessionName) return paneId
      }
      return null
    },
    [paneSessionMap]
  )

  /** Switch to a session with smart layout management */
  const switchToSession = useCallback(
    (sessionName: string, currentSessionName?: string): 'focus' | 'restore' | 'replace' => {
      // Save current layout if we're leaving a multi-pane setup
      if (currentSessionName && currentSessionName !== sessionName) {
        saveLayoutHistory(currentSessionName)
      }

      // Strategy 1: Session is already open in a pane → just focus it
      const existingPaneId = findPaneBySession(sessionName)
      if (existingPaneId) {
        setActivePaneId(existingPaneId)
        return 'focus'
      }

      // Strategy 2: Session has a saved layout → restore it
      if (restoreLayoutHistory(sessionName)) {
        return 'restore'
      }

      // Strategy 3: Replace current view with single pane
      const singleLeaf = createLeaf()
      setLayout(singleLeaf)
      setPaneSessionMap({ [singleLeaf.id]: sessionName })
      setActivePaneId(singleLeaf.id)
      return 'replace'
    },
    [saveLayoutHistory, restoreLayoutHistory, findPaneBySession]
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
    paneSessionMap,
    assignSession,
    unassignSession,
    activePaneId,
    setActivePaneId,
    saveLayoutHistory,
    restoreLayoutHistory,
    findPaneBySession,
    switchToSession,
  }
}
