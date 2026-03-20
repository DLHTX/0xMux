import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SplitLayout, SplitDirection, PaneWindow, PaneContent, LayoutState, LayoutStore } from '../lib/types'
import { createWindow, getLayouts, saveLayouts } from '../lib/api'
import { markWindowPending } from '../lib/init-commands'
import { generateUUID } from '../lib/uuid'

const MAX_PANES = 128

function createLeaf(): SplitLayout {
  return { id: generateUUID(), type: 'leaf' }
}

function countLeaves(node: SplitLayout): number {
  if (node.type === 'leaf') return 1
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

/** Split a leaf node into a branch, returning [newLayout, newLeafId].
 *  When `insertBefore` is true the new leaf is placed before the original
 *  (left / top); otherwise it goes after (right / bottom — the default). */
function splitNode(
  root: SplitLayout,
  nodeId: string,
  direction: SplitDirection,
  insertBefore = false
): [SplitLayout, string | null] {
  if (countLeaves(root) >= MAX_PANES) return [root, null]

  if (root.id === nodeId && root.type === 'leaf') {
    const newLeaf = createLeaf()
    const children = insertBefore
      ? [newLeaf, { ...root }]
      : [{ ...root }, newLeaf]
    return [
      {
        id: generateUUID(),
        type: 'branch',
        direction,
        sizes: [50, 50],
        children,
      },
      newLeaf.id,
    ]
  }

  if (root.type === 'branch') {
    let newPaneId: string | null = null
    const newChildren = root.children.map((child) => {
      if (newPaneId) return child // already split
      const [updated, id] = splitNode(child, nodeId, direction, insertBefore)
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

// ── Hook ──

export function useSplitLayout() {
  const [state] = useState(() => {
    const leaf = createLeaf()
    return { layout: leaf, activePaneId: leaf.id }
  })

  const [layout, setLayout] = useState<SplitLayout>(state.layout)
  const [paneWindowMap, setPaneWindowMap] = useState<Record<string, PaneWindow>>({})
  const [paneContentMap, setPaneContentMap] = useState<Record<string, PaneContent>>({})
  const [activePaneId, setActivePaneId] = useState<string | null>(state.activePaneId)
  const [primarySession, setPrimarySession] = useState<string | null>(null)

  // Refs mirror state so stable callbacks can read current values
  // without needing state in their dependency arrays.
  const layoutRef = useRef(layout)
  const paneWindowMapRef = useRef(paneWindowMap)
  const paneContentMapRef = useRef(paneContentMap)
  const activePaneIdRef = useRef(activePaneId)
  const primarySessionRef = useRef(primarySession)
  layoutRef.current = layout
  paneWindowMapRef.current = paneWindowMap
  paneContentMapRef.current = paneContentMap
  activePaneIdRef.current = activePaneId
  primarySessionRef.current = primarySession

  const layoutHistory = useRef<Map<string, LayoutState>>(new Map())

  // When true, the current layout is a "quick peek" fullscreen created by
  // selectWindow. Quick-peek layouts should NOT overwrite real (split) layouts
  // in layoutHistory. The flag is cleared when the user creates a real layout
  // via splitPane, splitAndAssign, or switchSession.
  const isQuickPeekRef = useRef(false)

  // Remembers which windows were in the last split layout.
  // When the user enters quick-peek (fullscreen a single window), this ref
  // preserves the split group so the sidebar can still show color indicators.
  const savedSplitGroupRef = useRef<Set<string>>(new Set())
  const splitLock = useRef(false)

  // ── Server persistence ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverLoadedRef = useRef(false)

  // Debounced save: serialize layoutHistory + current active state -> PUT /api/layouts.
  // Uses only refs so it can be called from stable (deps=[]) callbacks.
  const scheduleSync = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const layouts: Record<string, LayoutState> = {}
      for (const [name, state] of layoutHistory.current.entries()) {
        layouts[name] = state
      }
      // Include the current live state (may not be in history yet)
      const currentPrimary = primarySessionRef.current
      if (currentPrimary && !isQuickPeekRef.current) {
        layouts[currentPrimary] = {
          layout: JSON.parse(JSON.stringify(layoutRef.current)),
          paneWindowMap: { ...paneWindowMapRef.current },
          paneContentMap: { ...paneContentMapRef.current },
          activePaneId: activePaneIdRef.current,
        }
      }
      saveLayouts({
        layouts,
        primarySession: primarySessionRef.current,
      }).catch(() => {})
    }, 2000)
  }, [])

  // Load saved layouts from server on mount
  useEffect(() => {
    getLayouts()
      .then((store: LayoutStore) => {
        if (!store?.layouts || Object.keys(store.layouts).length === 0) return

        // Populate layoutHistory
        for (const [name, state] of Object.entries(store.layouts)) {
          layoutHistory.current.set(name, state)
        }

        // Restore the last primary session's layout
        const target = store.primarySession
        if (target && store.layouts[target]) {
          const saved = store.layouts[target]
          setPrimarySession(target)
          setLayout(saved.layout)
          setPaneWindowMap(saved.paneWindowMap)
          setPaneContentMap(saved.paneContentMap ?? {})
          setActivePaneId(saved.activePaneId)
          isQuickPeekRef.current = false
        }
        serverLoadedRef.current = true
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Assign a tmux window to a UI pane.
   *  Enforces uniqueness: a window can only appear in one pane at a time.
   *  If the window is already in another pane, it is moved (old pane becomes empty). */
  const assignWindow = useCallback((paneId: string, sessionName: string, windowIndex: number) => {
    setPaneWindowMap((prev) => {
      const next = { ...prev }
      // Remove this window from any other pane to prevent duplicates
      for (const [existingPaneId, pw] of Object.entries(next)) {
        if (
          existingPaneId !== paneId &&
          pw.sessionName === sessionName &&
          pw.windowIndex === windowIndex
        ) {
          delete next[existingPaneId]
        }
      }
      next[paneId] = { sessionName, windowIndex }
      return next
    })
    scheduleSync()
  }, [scheduleSync])

  /** Remove a window assignment from a pane */
  const unassignWindow = useCallback((paneId: string) => {
    setPaneWindowMap((prev) => {
      const next = { ...prev }
      delete next[paneId]
      return next
    })
  }, [])

  /**
   * Split a pane. If the source pane has a window assigned, automatically
   * creates a new tmux window in the same session and assigns it to the
   * new pane. Otherwise the new pane is left empty.
   *
   * NOTE: We pre-compute the split result using layoutRef (outside the
   * state updater) to avoid React StrictMode double-invocation issues.
   * StrictMode calls updater functions twice; since splitNode generates
   * random UUIDs, the second call would overwrite newPaneId with an ID
   * that doesn't match the layout React actually uses (from the first call).
   */
  const splitPane = useCallback(
    async (nodeId: string, direction: SplitDirection): Promise<string | null> => {
      if (splitLock.current) return null
      splitLock.current = true

      try {
        const currentWindow = paneWindowMapRef.current[nodeId]

        // Create a new window in the same session (if pane has one)
        let newWindow: { index: number } | null = null
        if (currentWindow) {
          newWindow = await createWindow(currentWindow.sessionName)
          markWindowPending(currentWindow.sessionName, newWindow.index)
        }

        // Pre-compute split result outside the state updater to avoid
        // StrictMode double-invoke causing ID mismatch.
        const [newLayout, newPaneId] = splitNode(layoutRef.current, nodeId, direction)
        if (!newPaneId) return null

        setLayout(newLayout)

        if (currentWindow && newWindow) {
          setPaneWindowMap((prev) => ({
            ...prev,
            [newPaneId]: {
              sessionName: currentWindow.sessionName,
              windowIndex: newWindow!.index,
            },
          }))
        }
        setActivePaneId(newPaneId)

        // User intentionally created a split — this is a real layout
        isQuickPeekRef.current = false
        scheduleSync()

        return newPaneId
      } finally {
        splitLock.current = false
      }
    },
    [scheduleSync]
  )

  /** Close a pane (removes from layout, paneWindowMap, and paneContentMap) */
  const closePane = useCallback((nodeId: string) => {
    const nextLayout = closeNode(layoutRef.current, nodeId) ?? createLeaf()
    const nextLeafIds = getAllLeafIds(nextLayout)

    setLayout(nextLayout)
    setPaneWindowMap((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
    setPaneContentMap((prev) => {
      if (!(nodeId in prev)) return prev
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
    setActivePaneId((prevActive) => {
      if (prevActive && nextLeafIds.includes(prevActive)) {
        return prevActive
      }
      return nextLeafIds[0] ?? null
    })
    scheduleSync()
  }, [scheduleSync])

  const getPaneIds = useCallback(() => {
    return getAllLeafIds(layoutRef.current)
  }, [])

  /** Find pane ID that contains a specific window */
  const findPaneByWindow = useCallback(
    (sessionName: string, windowIndex: number): string | null => {
      for (const [paneId, pw] of Object.entries(paneWindowMapRef.current)) {
        if (pw.sessionName === sessionName && pw.windowIndex === windowIndex) {
          return paneId
        }
      }
      return null
    },
    []
  )

  /**
   * Select a specific tmux window from the sidebar.
   *
   * - If the window is already visible in a pane → just focus that pane.
   * - Otherwise → show it fullscreen (single-pane layout).
   *   The current layout is saved (only if it's a "real" layout, not a
   *   previous quick-peek) so the user can return to it via session-header
   *   click or back-navigation.
   *
   * Splits are ONLY created via drag-and-drop (splitAndAssign).
   */
  const selectWindow = useCallback(
    (sessionName: string, windowIndex: number): 'focus' | 'fullscreen' | 'restore' => {
      // Already in a pane? Focus it.
      for (const [paneId, pw] of Object.entries(paneWindowMapRef.current)) {
        if (pw.sessionName === sessionName && pw.windowIndex === windowIndex) {
          setActivePaneId(paneId)
          return 'focus'
        }
      }

      // If we're in quick-peek mode, check whether the requested window
      // exists in the saved (real) layout. If so, restore the saved layout
      // rather than creating yet another fullscreen — this lets users click
      // a window that was part of a split and get the split back.
      if (isQuickPeekRef.current) {
        const currentPrimary = primarySessionRef.current
        if (currentPrimary) {
          const saved = layoutHistory.current.get(currentPrimary)
          if (saved) {
            const paneEntry = Object.entries(saved.paneWindowMap).find(
              ([, pw]) => pw.sessionName === sessionName && pw.windowIndex === windowIndex
            )
            if (paneEntry) {
              setLayout(saved.layout)
              setPaneWindowMap(saved.paneWindowMap)
              setPaneContentMap(saved.paneContentMap ?? {})
              setActivePaneId(paneEntry[0])
              isQuickPeekRef.current = false
              return 'restore'
            }
          }
        }
      }

      // Window not in current view or saved layout — show fullscreen.
      // Only save the current layout if it's NOT a quick-peek (to avoid
      // overwriting a real split layout with a temporary fullscreen view).
      const currentPrimary = primarySessionRef.current
      if (currentPrimary && !isQuickPeekRef.current) {
        layoutHistory.current.set(currentPrimary, {
          layout: JSON.parse(JSON.stringify(layoutRef.current)),
          paneWindowMap: { ...paneWindowMapRef.current },
          paneContentMap: { ...paneContentMapRef.current },
          activePaneId: activePaneIdRef.current,
        })
      }

      // Update primary session if switching to a different one
      if (currentPrimary !== sessionName) {
        setPrimarySession(sessionName)
      }

      // Create a fresh single-pane layout with the requested window
      const leaf = createLeaf()
      setLayout(leaf)
      setPaneWindowMap({ [leaf.id]: { sessionName, windowIndex } })
      setPaneContentMap({})
      setActivePaneId(leaf.id)
      isQuickPeekRef.current = true
      scheduleSync()
      return 'fullscreen'
    },
    [scheduleSync]
  )

  /**
   * Switch to a session's workspace.
   * Saves the current layout under the current primary session,
   * then restores the target session's saved layout (or creates
   * a fresh single-pane view with its first window).
   */
  const switchSession = useCallback(
    (sessionName: string, firstWindowIndex?: number): 'restore' | 'new' => {
      const currentPrimary = primarySessionRef.current

      // Same session: if in quick-peek, restore the saved (real) layout
      if (currentPrimary === sessionName) {
        if (isQuickPeekRef.current) {
          const saved = layoutHistory.current.get(sessionName)
          if (saved) {
            setLayout(saved.layout)
            setPaneWindowMap(saved.paneWindowMap)
            setPaneContentMap(saved.paneContentMap ?? {})
            setActivePaneId(saved.activePaneId)
            isQuickPeekRef.current = false
            return 'restore'
          }
        }
        return 'restore'
      }

      // Save current layout — but only if it's a real layout, not a quick-peek
      if (currentPrimary && !isQuickPeekRef.current) {
        layoutHistory.current.set(currentPrimary, {
          layout: JSON.parse(JSON.stringify(layoutRef.current)),
          paneWindowMap: { ...paneWindowMapRef.current },
          paneContentMap: { ...paneContentMapRef.current },
          activePaneId: activePaneIdRef.current,
        })
      }
      isQuickPeekRef.current = false
      savedSplitGroupRef.current = new Set()

      setPrimarySession(sessionName)

      // Try to restore saved layout for target session
      const saved = layoutHistory.current.get(sessionName)
      if (saved) {
        setLayout(saved.layout)
        setPaneContentMap(saved.paneContentMap ?? {})

        let restoredMap = saved.paneWindowMap
        let restoredActive = saved.activePaneId

        // If a specific window was requested, ensure it is visible
        if (firstWindowIndex !== undefined) {
          const existing = Object.entries(restoredMap).find(
            ([, pw]) => pw.sessionName === sessionName && pw.windowIndex === firstWindowIndex
          )
          if (existing) {
            // Window already in a pane — just focus it
            restoredActive = existing[0]
          } else {
            // Assign the requested window to the active pane
            const target = restoredActive ?? getAllLeafIds(saved.layout)[0]
            if (target) {
              restoredMap = { ...restoredMap, [target]: { sessionName, windowIndex: firstWindowIndex } }
              restoredActive = target
            }
          }
        }

        setPaneWindowMap(restoredMap)
        setActivePaneId(restoredActive)
        scheduleSync()
        return 'restore'
      }

      // No saved layout — single pane with first window
      const leaf = createLeaf()
      setLayout(leaf)
      if (firstWindowIndex !== undefined) {
        setPaneWindowMap({ [leaf.id]: { sessionName, windowIndex: firstWindowIndex } })
      } else {
        setPaneWindowMap({})
      }
      setPaneContentMap({})
      setActivePaneId(leaf.id)
      scheduleSync()
      return 'new'
    },
    [scheduleSync]
  )

  /**
   * Split a pane and assign a window to the newly created pane.
   * Used by drag-to-edge in SplitWorkspace.
   *
   * @param paneId  — the existing pane to split
   * @param zone    — which edge was dropped on (determines direction & position)
   * @param sessionName / windowIndex — the window to place in the new pane
   */
  const splitAndAssign = useCallback(
    (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => {
      const direction: SplitDirection = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const insertBefore = zone === 'left' || zone === 'top'

      const [newLayout, newPaneId] = splitNode(layoutRef.current, paneId, direction, insertBefore)
      if (!newPaneId) return

      setLayout(newLayout)

      // Move the window: remove it from any existing pane, then assign to the new pane
      setPaneWindowMap((prev) => {
        const next = { ...prev }
        for (const [existingPaneId, pw] of Object.entries(next)) {
          if (pw.sessionName === sessionName && pw.windowIndex === windowIndex) {
            delete next[existingPaneId]
          }
        }
        next[newPaneId] = { sessionName, windowIndex }
        return next
      })
      setActivePaneId(newPaneId)

      // User intentionally created a split — this is a real layout
      isQuickPeekRef.current = false
      scheduleSync()
    },
    [scheduleSync]
  )

  /** Assign non-terminal content to a pane.
   *  Removes any terminal window assignment for this pane (a pane is either
   *  terminal or content, never both). */
  const assignContent = useCallback((paneId: string, content: PaneContent) => {
    if (content.type === 'terminal') {
      // Terminal content should use assignWindow instead
      if (content.sessionName !== undefined && content.windowIndex !== undefined) {
        assignWindow(paneId, content.sessionName, content.windowIndex)
      }
      return
    }
    // Remove terminal assignment if any
    setPaneWindowMap((prev) => {
      if (!(paneId in prev)) return prev
      const next = { ...prev }
      delete next[paneId]
      return next
    })
    // Set content
    setPaneContentMap((prev) => ({
      ...prev,
      [paneId]: content,
    }))
    scheduleSync()
  }, [assignWindow, scheduleSync])

  /** Remove content assignment from a pane */
  const unassignContent = useCallback((paneId: string) => {
    setPaneContentMap((prev) => {
      if (!(paneId in prev)) return prev
      const next = { ...prev }
      delete next[paneId]
      return next
    })
  }, [])

  /**
   * Swap the contents of two panes. Each pane can be a terminal (paneWindowMap)
   * or content (paneContentMap) — the swap handles all combinations.
   */
  const swapPanes = useCallback((paneIdA: string, paneIdB: string) => {
    if (paneIdA === paneIdB) return

    const windowA = paneWindowMapRef.current[paneIdA]
    const windowB = paneWindowMapRef.current[paneIdB]
    const contentA = paneContentMapRef.current[paneIdA]
    const contentB = paneContentMapRef.current[paneIdB]

    setPaneWindowMap((prev) => {
      const next = { ...prev }
      // Clear both
      delete next[paneIdA]
      delete next[paneIdB]
      // Swap
      if (windowB) next[paneIdA] = windowB
      if (windowA) next[paneIdB] = windowA
      return next
    })

    setPaneContentMap((prev) => {
      const next = { ...prev }
      // Clear both
      delete next[paneIdA]
      delete next[paneIdB]
      // Swap
      if (contentB) next[paneIdA] = contentB
      if (contentA) next[paneIdB] = contentA
      return next
    })

    scheduleSync()
  }, [scheduleSync])

  /** Check if a window is currently displayed in any pane */
  const isWindowInUse = useCallback(
    (sessionName: string, windowIndex: number): boolean => {
      return Object.values(paneWindowMapRef.current).some(
        (pw) => pw.sessionName === sessionName && pw.windowIndex === windowIndex
      )
    },
    []
  )

  /**
   * Remove pane references to windows that no longer exist.
   * Called when the window list updates (e.g. from WebSocket or polling).
   * Also cleans up savedSplitGroupRef and layoutHistory.
   *
   * @param validKeys — Set of "session:windowIndex" strings for all existing windows
   */
  const cleanupStaleWindows = useCallback(
    (validKeys: Set<string>) => {
      // Clean current paneWindowMap
      setPaneWindowMap((prev) => {
        let changed = false
        const next: Record<string, PaneWindow> = {}
        for (const [paneId, pw] of Object.entries(prev)) {
          const key = `${pw.sessionName}:${pw.windowIndex}`
          if (validKeys.has(key)) {
            next[paneId] = pw
          } else {
            changed = true
          }
        }
        return changed ? next : prev
      })

      // Clean layoutHistory
      for (const [, saved] of layoutHistory.current.entries()) {
        let changed = false
        const cleanMap: Record<string, PaneWindow> = {}
        for (const [paneId, pw] of Object.entries(saved.paneWindowMap)) {
          const key = `${pw.sessionName}:${pw.windowIndex}`
          if (validKeys.has(key)) {
            cleanMap[paneId] = pw
          } else {
            changed = true
          }
        }
        if (changed) {
          saved.paneWindowMap = cleanMap
        }
      }

      // Clean savedSplitGroupRef
      if (savedSplitGroupRef.current.size > 0) {
        const cleaned = new Set<string>()
        for (const key of savedSplitGroupRef.current) {
          if (validKeys.has(key)) {
            cleaned.add(key)
          }
        }
        if (cleaned.size !== savedSplitGroupRef.current.size) {
          savedSplitGroupRef.current = cleaned
        }
      }
    },
    []
  )

  /**
   * Get all window keys that are tracked: current paneWindowMap + all saved layouts.
   * Used by SplitWorkspace to decide which pool containers to keep alive.
   * A window key is "session:windowIndex".
   */
  const getAllTrackedWindowKeys = useCallback((): Set<string> => {
    const keys = new Set<string>()
    // Current paneWindowMap
    for (const pw of Object.values(paneWindowMapRef.current)) {
      keys.add(`${pw.sessionName}:${pw.windowIndex}`)
    }
    // All saved layouts in history
    for (const state of layoutHistory.current.values()) {
      for (const pw of Object.values(state.paneWindowMap)) {
        keys.add(`${pw.sessionName}:${pw.windowIndex}`)
      }
    }
    return keys
  }, [])

  const paneCount = countLeaves(layout)
  const canSplit = paneCount < MAX_PANES

  // The set of window keys ("session:windowIndex") that belong to the current
  // split group. When the current layout IS a split, it reflects the live state.
  // When in quick-peek (single-pane fullscreen), it retains the last split group
  // so the sidebar can still highlight which windows were split together.
  const splitGroupKeys = useMemo((): Set<string> => {
    if (paneCount > 1) {
      // Current layout is a split — build the set from live paneWindowMap
      const keys = new Set<string>()
      for (const pw of Object.values(paneWindowMap)) {
        keys.add(`${pw.sessionName}:${pw.windowIndex}`)
      }
      // Also save in ref so quick-peek can return it later
      savedSplitGroupRef.current = keys
      return keys
    }
    // Single pane — return the saved split group (non-empty during quick-peek)
    return savedSplitGroupRef.current
  }, [paneCount, paneWindowMap])

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
    paneContentMap,
    assignContent,
    unassignContent,
    swapPanes,
    activePaneId,
    setActivePaneId,
    findPaneByWindow,
    selectWindow,
    splitAndAssign,
    switchSession,
    primarySession,
    isWindowInUse,
    cleanupStaleWindows,
    splitGroupKeys,
    getAllTrackedWindowKeys,
    /** True once server-saved layouts have been loaded and applied */
    serverLoaded: serverLoadedRef.current,
  }
}
