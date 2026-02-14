import { useState, useCallback, useRef, useEffect } from 'react'
import type { FloatingWindowState, EditorTab, WorkspaceContext } from '../lib/types.ts'
import { readFile, writeFile } from '../lib/api.ts'

const STORAGE_KEY = '0xmux-floating-editor'
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 260
const MIN_OPACITY = 0.3
const MAX_OPACITY = 1

const DEFAULT_STATE: FloatingWindowState = {
  isOpen: false,
  x: 100,
  y: 80,
  width: 700,
  height: 500,
  opacity: 1.0,
  zIndex: 40,
  minimized: false,
  tabs: [],
  activeTabId: null,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type PersistedTab = {
  filePath: string
  mode: 'edit' | 'diff'
  diffOriginal?: string
  workspace?: WorkspaceContext
}

type PersistedState = {
  x: number
  y: number
  width: number
  height: number
  opacity: number
  isOpen: boolean
  minimized: boolean
  tabs: PersistedTab[]
  activeTabKey: string | null
}

function getTabKey(tab: {
  filePath: string
  mode: 'edit' | 'diff'
  workspace?: WorkspaceContext
}): string {
  return [
    tab.mode,
    tab.workspace?.session ?? '',
    tab.workspace?.window ?? '',
    tab.filePath,
  ].join('|')
}

/** Load persisted floating-editor state from localStorage */
function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>

    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
          .map((tab): PersistedTab | null => {
            if (!tab || typeof tab !== 'object') return null
            const t = tab as Record<string, unknown>
            if (typeof t.filePath !== 'string') return null
            const mode = t.mode === 'diff' ? 'diff' : 'edit'
            const workspace =
              t.workspace &&
              typeof t.workspace === 'object' &&
              typeof (t.workspace as Record<string, unknown>).session === 'string' &&
              typeof (t.workspace as Record<string, unknown>).window === 'number'
                ? {
                    session: (t.workspace as Record<string, unknown>).session as string,
                    window: (t.workspace as Record<string, unknown>).window as number,
                  }
                : undefined
            return {
              filePath: t.filePath,
              mode,
              diffOriginal: typeof t.diffOriginal === 'string' ? t.diffOriginal : undefined,
              workspace,
            }
          })
          .filter((tab): tab is PersistedTab => tab !== null)
      : []

    return {
      x: typeof parsed.x === 'number' ? parsed.x : DEFAULT_STATE.x,
      y: typeof parsed.y === 'number' ? parsed.y : DEFAULT_STATE.y,
      width:
        typeof parsed.width === 'number'
          ? Math.max(MIN_WINDOW_WIDTH, parsed.width)
          : DEFAULT_STATE.width,
      height:
        typeof parsed.height === 'number'
          ? Math.max(MIN_WINDOW_HEIGHT, parsed.height)
          : DEFAULT_STATE.height,
      opacity:
        typeof parsed.opacity === 'number'
          ? clamp(parsed.opacity, MIN_OPACITY, MAX_OPACITY)
          : DEFAULT_STATE.opacity,
      isOpen: parsed.isOpen === true,
      minimized: parsed.minimized === true,
      tabs,
      activeTabKey: typeof parsed.activeTabKey === 'string' ? parsed.activeTabKey : null,
    }
  } catch {
    return null
  }
}

/** Persist floating-editor state to localStorage */
function persistState(state: FloatingWindowState) {
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        opacity: state.opacity,
        isOpen: state.isOpen,
        minimized: state.minimized,
        tabs: state.tabs.map((tab) => ({
          filePath: tab.filePath,
          mode: tab.mode,
          diffOriginal: tab.diffOriginal,
          workspace: tab.workspace,
        })),
        activeTabKey: activeTab ? getTabKey(activeTab) : null,
      }),
    )
  } catch {
    // Ignore storage errors
  }
}

/** Detect language from file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    rs: 'rust',
    py: 'python',
    go: 'go',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    xml: 'xml',
    svg: 'xml',
    txt: 'plaintext',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }
  return map[ext] ?? 'plaintext'
}

export function useFloatingEditor(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const persistedStateRef = useRef<PersistedState | null>(enabled ? loadPersistedState() : null)
  const [state, setState] = useState<FloatingWindowState>(() => {
    const persisted = persistedStateRef.current
    if (!persisted) return DEFAULT_STATE
    return {
      ...DEFAULT_STATE,
      x: persisted.x,
      y: persisted.y,
      width: persisted.width,
      height: persisted.height,
      opacity: persisted.opacity,
    }
  })

  const tabIdCounter = useRef(0)

  const nextTabId = useCallback((): string => {
    tabIdCounter.current += 1
    return `tab-${tabIdCounter.current}`
  }, [])

  // Restore previously opened tabs/files after mount.
  useEffect(() => {
    if (!enabled) return
    const persisted = persistedStateRef.current
    persistedStateRef.current = null
    if (!persisted || persisted.tabs.length === 0) return

    let cancelled = false

    const restoreTabs = async () => {
      const restored = await Promise.all(
        persisted.tabs.map(async (tab) => {
          try {
            const file = await readFile(tab.filePath, tab.workspace)
            const language = file.language || detectLanguage(tab.filePath)
            return {
              tab,
              language,
              content: file.content,
            }
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return
      const restoredTabs = restored.filter((item): item is NonNullable<typeof item> => item !== null)
      if (restoredTabs.length === 0) return

      const tabs: EditorTab[] = restoredTabs.map(({ tab, language, content }) => ({
        id: nextTabId(),
        filePath: tab.filePath,
        language,
        content,
        originalContent: content,
        isDirty: false,
        mode: tab.mode,
        diffOriginal: tab.diffOriginal ?? (tab.mode === 'diff' ? content : undefined),
        workspace: tab.workspace,
      }))

      const activeTab =
        tabs.find((tab) => getTabKey(tab) === persisted.activeTabKey) ??
        tabs[0] ??
        null

      setState((prev) => ({
        ...prev,
        tabs,
        activeTabId: activeTab?.id ?? null,
        isOpen: persisted.isOpen,
        minimized: persisted.isOpen ? persisted.minimized : false,
      }))
    }

    void restoreTabs()
    return () => {
      cancelled = true
    }
  }, [nextTabId, enabled])

  useEffect(() => {
    if (!enabled) return
    persistState(state)
  }, [state, enabled])

  /** Open a file in the floating editor */
  const openFile = useCallback(
    async (
      path: string,
      _line?: number,
      mode: 'edit' | 'diff' = 'edit',
      diffOriginal?: string,
      workspace?: WorkspaceContext,
    ) => {
      // Check if tab already exists for this path + mode
      const existingTab = state.tabs.find(
        (t) =>
          t.filePath === path &&
          t.mode === mode &&
          t.workspace?.session === workspace?.session &&
          t.workspace?.window === workspace?.window,
      )
      if (existingTab) {
        setState((prev) => ({
          ...prev,
          isOpen: true,
          minimized: false,
          activeTabId: existingTab.id,
        }))
        return
      }

      // Read file content from server
      const file = await readFile(path, workspace)
      const language = file.language || detectLanguage(path)

      const newTab: EditorTab = {
        id: nextTabId(),
        filePath: path,
        language,
        content: file.content,
        originalContent: file.content,
        isDirty: false,
        mode,
        diffOriginal: diffOriginal ?? (mode === 'diff' ? file.content : undefined),
        workspace,
      }

      setState((prev) => ({
        ...prev,
        isOpen: true,
        minimized: false,
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      }))
    },
    [state.tabs, nextTabId],
  )

  /** Close a tab by ID */
  const closeTab = useCallback((tabId: string) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === tabId)
      if (idx === -1) return prev

      const newTabs = prev.tabs.filter((t) => t.id !== tabId)
      let newActiveId = prev.activeTabId

      // If closing the active tab, select the next or previous
      if (prev.activeTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveId = null
        } else if (idx < newTabs.length) {
          newActiveId = newTabs[idx]!.id
        } else {
          newActiveId = newTabs[newTabs.length - 1]!.id
        }
      }

      return {
        ...prev,
        tabs: newTabs,
        activeTabId: newActiveId,
        isOpen: newTabs.length > 0 ? prev.isOpen : false,
      }
    })
  }, [])

  /** Set active tab */
  const setActiveTab = useCallback((tabId: string) => {
    setState((prev) => ({ ...prev, activeTabId: tabId }))
  }, [])

  /** Close all tabs */
  const closeAllTabs = useCallback(() => {
    setState((prev) => ({
      ...prev,
      tabs: [],
      activeTabId: null,
      isOpen: false,
    }))
  }, [])

  /** Close all tabs except one */
  const closeOtherTabs = useCallback((tabId: string) => {
    setState((prev) => {
      const keepTab = prev.tabs.find((tab) => tab.id === tabId)
      if (!keepTab) return prev
      return {
        ...prev,
        tabs: [keepTab],
        activeTabId: keepTab.id,
      }
    })
  }, [])

  /** Close tabs to the left of the target tab */
  const closeTabsToLeft = useCallback((tabId: string) => {
    setState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.id === tabId)
      if (index <= 0) return prev

      const nextTabs = prev.tabs.slice(index)
      const activeStillExists = nextTabs.some((tab) => tab.id === prev.activeTabId)
      return {
        ...prev,
        tabs: nextTabs,
        activeTabId: activeStillExists ? prev.activeTabId : tabId,
      }
    })
  }, [])

  /** Close tabs to the right of the target tab */
  const closeTabsToRight = useCallback((tabId: string) => {
    setState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1 || index >= prev.tabs.length - 1) return prev

      const nextTabs = prev.tabs.slice(0, index + 1)
      const activeStillExists = nextTabs.some((tab) => tab.id === prev.activeTabId)
      return {
        ...prev,
        tabs: nextTabs,
        activeTabId: activeStillExists ? prev.activeTabId : tabId,
      }
    })
  }, [])

  /** Close the floating window (keep tabs in state) */
  const closeEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  /** Minimize the editor */
  const minimizeEditor = useCallback(() => {
    setState((prev) => ({ ...prev, minimized: true }))
  }, [])

  /** Restore from minimized */
  const restoreEditor = useCallback(() => {
    setState((prev) => ({ ...prev, minimized: false }))
  }, [])

  /** Update window position */
  const updatePosition = useCallback((x: number, y: number) => {
    setState((prev) => ({ ...prev, x, y }))
  }, [])

  /** Update window size */
  const updateSize = useCallback((width: number, height: number) => {
    setState((prev) => ({
      ...prev,
      width: Math.max(MIN_WINDOW_WIDTH, width),
      height: Math.max(MIN_WINDOW_HEIGHT, height),
    }))
  }, [])

  /** Update window opacity */
  const updateOpacity = useCallback((opacity: number) => {
    setState((prev) => ({
      ...prev,
      opacity: clamp(opacity, MIN_OPACITY, MAX_OPACITY),
    }))
  }, [])

  /** Update tab content (called from editor onChange) */
  const updateTabContent = useCallback(
    (tabId: string, content: string) => {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === tabId
            ? { ...t, content, isDirty: content !== t.originalContent }
            : t,
        ),
      }))
    },
    [],
  )

  /** Save the currently active file */
  const saveCurrentFile = useCallback(async () => {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
    if (!activeTab || !activeTab.isDirty) return

    await writeFile(activeTab.filePath, activeTab.content, activeTab.workspace)

    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeTabId
          ? { ...t, isDirty: false, originalContent: t.content }
          : t,
      ),
    }))
  }, [state.tabs, state.activeTabId])

  return {
    state,
    openFile,
    closeTab,
    setActiveTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    closeEditor,
    minimizeEditor,
    restoreEditor,
    updatePosition,
    updateSize,
    updateOpacity,
    updateTabContent,
    saveCurrentFile,
  }
}
