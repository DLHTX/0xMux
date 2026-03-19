import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Header, EmptyState, MobileNav, type MobileView } from './components/layout'
import { SessionSidebar, CreateSessionModal } from './components/session'
import { SplitWorkspace, TerminalPane } from './components/terminal'
import { VirtualKeybar, VIRTUAL_KEYBAR_HEIGHT } from './components/mobile/VirtualKeybar'
import { SetupWizard } from './components/setup'
import { SetupPasswordModal, LoginModal, SettingsModal } from './components/auth'
import { PluginModal } from './components/plugins'
import { ToastContainer } from './components/ui/Toast'
import { ImageViewer } from './components/ui/ImageViewer'
import { StatusBar } from './components/layout/StatusBar'
import { BranchSwitcher } from './components/layout/BranchSwitcher'
import { WorktreeCreateModal } from './components/session/WorktreeCreateModal'
import { RightPanel } from './components/sidebar/RightPanel'
import { FileExplorer } from './components/sidebar/FileExplorer'
import { SearchPanel } from './components/sidebar/SearchPanel'
import { GitPanel } from './components/sidebar/GitPanel'
import { NotificationPanel } from './components/sidebar/NotificationPanel'
import { NotificationPopover } from './components/layout/NotificationPopover'
import FloatingWindow from './components/editor/FloatingWindow'
import EditorPane from './components/editor/EditorPane'
import EditorTabs from './components/editor/EditorTabs'
import EditorStatusBar from './components/editor/EditorStatusBar'
import { QuickFileSearch } from './components/editor/QuickFileSearch'
import { useSessions } from './hooks/useSessions'
import { useDeps } from './hooks/useDeps'
import { useSplitLayout } from './hooks/useSplitLayout'
import { useSettings } from './hooks/useSettings'
import { useMobile, useCompact, useNarrowMobile } from './hooks/useMobile'
import { useToast } from './hooks/useToast'
import { useAuth } from './hooks/useAuth'
import { useImagePaste } from './hooks/useImagePaste'
import { useFloatingEditor } from './hooks/useFloatingEditor'
import { useNotifications } from './hooks/useNotifications'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { I18nProvider, useI18n } from './hooks/useI18n'
import { MuxProvider, useMux } from './contexts/MuxContext'
import { FUSION_PIXEL_FONT, SILKSCREEN_FONT } from './lib/theme'
import { getGitDiff, getGitStatus, getGitBranches, gitCheckout, uploadFiles, createWorktree, listWorktrees } from './lib/api'
import { isTerminalFileDrag } from './lib/terminalFileDrag'
import { useImageSync } from './hooks/useImageSync'
import { Icon } from '@iconify/react'
import { IconTerminal, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconX } from './lib/icons'
import type { Terminal } from '@xterm/xterm'
import type {
  TmuxWindow,
  GitBranch,
  WorktreeInfo,
  RightPanelTab,
  WorkspaceContext,
  AiStatusResponse,
  AiCatalogResponse,
  AiSyncResponse,
  AiUninstallResponse,
  AiSyncType,
  AiProvider,
  GlobalConfigResponse,
} from './lib/types'
import { getWindows, createWindow, deleteWindow, getAiStatus, getAiCatalog, syncAi, uninstallAi, getGlobalConfig, saveGlobalConfig as saveGlobalConfigApi, syncGlobalConfig as syncGlobalConfigApi } from './lib/api'
import { setInitCommand, markWindowPending } from './lib/init-commands'

const LAST_WINDOW_STORAGE_PREFIX = '0xmux-last-window'

function getLastWindowStorageKey(isMobile: boolean): string {
  return `${LAST_WINDOW_STORAGE_PREFIX}:${isMobile ? 'mobile' : 'desktop'}`
}

function loadPersistedWindow(isMobile: boolean): { sessionName: string; windowIndex: number } | null {
  try {
    const raw = localStorage.getItem(getLastWindowStorageKey(isMobile))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.sessionName !== 'string') return null
    if (typeof parsed.windowIndex !== 'number') return null
    return {
      sessionName: parsed.sessionName,
      windowIndex: parsed.windowIndex,
    }
  } catch {
    return null
  }
}

/** Auto-switch font when locale changes (zh -> Fusion Pixel, en -> Silkscreen) */
function LocaleFontBridge() {
  const { locale } = useI18n()
  const { tokens, setToken } = useTheme()
  const prevLocale = useRef(locale)

  useEffect(() => {
    if (prevLocale.current === locale) return
    prevLocale.current = locale

    // Only auto-switch if current font is one of the two default pixel fonts
    const current = tokens.fontBody
    if (current !== FUSION_PIXEL_FONT && current !== SILKSCREEN_FONT) return

    const font = locale === 'zh' ? FUSION_PIXEL_FONT : SILKSCREEN_FONT
    setToken('fontBody', font)
    setToken('fontHeading', font)
  }, [locale, tokens.fontBody, setToken])

  return null
}

function AppContent() {
  const { t } = useI18n()
  const { status: authStatus, loading: authLoading, setup, skip, login, logout, changePassword } = useAuth()
  const {
    sessions,
    loading,
    connectionStatus,
    createSession,
    deleteSession,
  } = useSessions()

  const mux = useMux()
  const { deps, loading: depsLoading, allReady, installPackage } = useDeps()

  const { settings, updateSettings } = useSettings()
  const {
    layout,
    splitPane,
    closePane,
    getPaneIds,
    paneCount,
    canSplit,
    paneWindowMap,
    assignWindow,
    activePaneId,
    setActivePaneId,
    selectWindow,
    splitAndAssign,
    switchSession,
    primarySession,
    isWindowInUse,
    cleanupStaleWindows,
    splitGroupKeys,
    getAllTrackedWindowKeys,
  } = useSplitLayout()
  const isMobile = useMobile()
  const isCompact = useCompact()
  const isNarrowMobile = useNarrowMobile()
  const { toasts, addToast, removeToast } = useToast()

  const floatingEditor = useFloatingEditor({ enabled: !isMobile })
  const { notifications, unreadCount, pushNotification, dismiss: dismissNotification, markRead: markNotificationRead, markAllRead: markAllNotificationsRead } = useNotifications()
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPluginCenter, setShowPluginCenter] = useState(false)
  const [showQuickFile, setShowQuickFile] = useState(false)
  const [selectedWindow, setSelectedWindow] = useState<{ sessionName: string; windowIndex: number } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('sessions')
  const [windows, setWindows] = useState<Map<string, TmuxWindow[]>>(new Map())
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null)
  const [aiCatalog, setAiCatalog] = useState<AiCatalogResponse | null>(null)
  const [aiSyncResult, setAiSyncResult] = useState<AiSyncResponse | null>(null)
  const [aiUninstallResult, setAiUninstallResult] = useState<AiUninstallResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSyncing, setAiSyncing] = useState(false)
  const [globalConfig, setGlobalConfig] = useState<GlobalConfigResponse | null>(null)
  const [globalConfigSaving, setGlobalConfigSaving] = useState(false)
  const mobileTerminalRef = useRef<Terminal | null>(null)
  const activeTerminalRef = useRef<Terminal | null>(null)
  const pendingWindowRestoreRef = useRef(loadPersistedWindow(isMobile))
  const windowRestoreDoneRef = useRef(false)

  useEffect(() => {
    try {
      const key = getLastWindowStorageKey(isMobile)
      if (selectedWindow) {
        localStorage.setItem(key, JSON.stringify(selectedWindow))
      } else {
        localStorage.removeItem(key)
      }
    } catch {
      // Ignore storage errors
    }
  }, [selectedWindow, isMobile])

  // Restore last opened window after session/window lists are available.
  useEffect(() => {
    if (windowRestoreDoneRef.current) return
    const target = pendingWindowRestoreRef.current
    if (!target) {
      windowRestoreDoneRef.current = true
      return
    }
    if (sessions.length === 0) return

    const allWindowsLoaded = sessions.every((s) => windows.has(s.name))
    const hasSession = sessions.some((s) => s.name === target.sessionName)
    if (!hasSession) {
      if (allWindowsLoaded) windowRestoreDoneRef.current = true
      return
    }

    const sessionWindows = windows.get(target.sessionName)
    if (!sessionWindows) return

    const hasWindow = sessionWindows.some((w) => w.index === target.windowIndex)
    if (!hasWindow) {
      windowRestoreDoneRef.current = true
      return
    }

    if (isMobile) {
      setSelectedWindow(target)
      if (activePaneId) {
        assignWindow(activePaneId, target.sessionName, target.windowIndex)
      }
      setMobileView('terminal')
    } else {
      switchSession(target.sessionName, target.windowIndex)
      setSelectedWindow(target)
    }

    windowRestoreDoneRef.current = true
  }, [sessions, windows, isMobile, activePaneId, assignWindow, switchSession])

  const refreshAiData = useCallback(async () => {
    setAiLoading(true)
    try {
      const status = await getAiStatus()
      setAiStatus(status)
      if (status.show_plugin_button) {
        const catalog = await getAiCatalog()
        setAiCatalog(catalog)
        try {
          const gc = await getGlobalConfig()
          setGlobalConfig(gc)
        } catch {
          // Global config endpoint may not be available yet
        }
      } else {
        setAiCatalog(null)
        setGlobalConfig(null)
      }
    } catch {
      // Ignore plugin data errors to avoid blocking main UI
    } finally {
      setAiLoading(false)
    }
  }, [])

  const runAiSync = useCallback(
    async ({
      providers,
      types,
      ids,
    }: {
      providers: AiProvider[]
      types: AiSyncType[]
      ids?: string[]
    }) => {
      if (providers.length === 0) {
        addToast(t('toast.noProvider'), 'error')
        return
      }

      setAiSyncing(true)
      try {
        const result = await syncAi({
          providers,
          types,
          ids,
          dry_run: false,
        })
        setAiSyncResult(result)
        setAiUninstallResult(null)
        if (result.summary.failed > 0) {
          addToast(t('toast.syncPartialFail', { count: result.summary.failed }), 'error')
        } else {
          addToast(t('toast.syncDone'), 'success')
        }
        await refreshAiData()
      } catch {
        addToast(t('toast.syncFailed'), 'error')
      } finally {
        setAiSyncing(false)
      }
    },
    [addToast, refreshAiData, t]
  )

  const runAiUninstall = useCallback(
    async ({
      providers,
      types,
      ids,
      removeSource,
    }: {
      providers: AiProvider[]
      types: AiSyncType[]
      ids?: string[]
      removeSource?: boolean
    }) => {
      if (providers.length === 0 && !removeSource) {
        addToast(t('toast.noProvider'), 'error')
        return
      }

      setAiSyncing(true)
      try {
        const result = await uninstallAi({ providers, types, ids, remove_source: removeSource })
        setAiUninstallResult(result)
        setAiSyncResult(null)
        if (result.summary.failed > 0) {
          addToast(t('toast.uninstallPartialFail', { count: result.summary.failed }), 'error')
        } else {
          addToast(t('toast.uninstallDone'), 'success')
        }
        await refreshAiData()
      } catch {
        addToast(t('toast.uninstallFailed'), 'error')
      } finally {
        setAiSyncing(false)
      }
    },
    [addToast, refreshAiData, t]
  )

  const handleSaveGlobalConfig = useCallback(async (content: string) => {
    setGlobalConfigSaving(true)
    try {
      const result = await saveGlobalConfigApi({ content })
      setGlobalConfig(result)
      addToast(t('toast.globalConfigSaved'), 'success')
    } catch {
      addToast(t('toast.globalConfigSaveFailed'), 'error')
    } finally {
      setGlobalConfigSaving(false)
    }
  }, [addToast, t])

  const handleSyncGlobalConfig = useCallback(async () => {
    setGlobalConfigSaving(true)
    try {
      const result = await syncGlobalConfigApi({})
      setGlobalConfig(result)
      addToast(t('toast.globalConfigSynced'), 'success')
    } catch {
      addToast(t('toast.globalConfigSyncFailed'), 'error')
    } finally {
      setGlobalConfigSaving(false)
    }
  }, [addToast, t])

  // Enable image paste feature
  useImagePaste(activeTerminalRef)

  // Keep image registry in sync with server (polls every 3s)
  useImageSync()

  // Check if a window is part of the current split group.
  // Returns true even during quick-peek (when the split is temporarily hidden)
  // so the sidebar can maintain color indicators.
  const isInSplitGroup = useCallback(
    (sessionName: string, windowIndex: number): boolean => {
      return splitGroupKeys.has(`${sessionName}:${windowIndex}`)
    },
    [splitGroupKeys]
  )

  const needsSetup = deps && !allReady

  // Auto-collapse sidebar on compact screens (foldables / small tablets)
  useEffect(() => {
    if (isCompact) setSidebarCollapsed(true)
  }, [isCompact])

  useEffect(() => {
    if (!authStatus?.authenticated || needsSetup) return
    refreshAiData()
  }, [authStatus?.authenticated, needsSetup, refreshAiData])

  // Keep a ref to windows for use in stable callbacks
  const windowsRef = useRef(windows)
  windowsRef.current = windows

  // When windows change, clean up stale pane references
  useEffect(() => {
    const validKeys = new Set<string>()
    for (const [sessionName, wins] of windows) {
      for (const w of wins) {
        validKeys.add(`${sessionName}:${w.index}`)
      }
    }
    if (validKeys.size > 0) {
      cleanupStaleWindows(validKeys)
    }
  }, [windows, cleanupStaleWindows])

  // Auto-select first session on initial load
  const initDone = useRef(false)
  useEffect(() => {
    if (initDone.current) return
    if (sessions.length === 0) return

    // If server already restored a primary session, respect it
    if (primarySession && sessions.some((s) => s.name === primarySession)) {
      initDone.current = true
      return
    }

    const firstSession = sessions[0]
    const wins = windows.get(firstSession.name) || []
    const firstWin = wins[0]
    if (firstWin) {
      switchSession(firstSession.name, firstWin.index)
      setSelectedWindow({ sessionName: firstSession.name, windowIndex: firstWin.index })
      initDone.current = true
    }
  }, [sessions, windows, switchSession, primarySession])

  // If the primary session gets deleted, switch to the first available session
  useEffect(() => {
    if (!primarySession) return
    if (sessions.some((s) => s.name === primarySession)) return
    // Primary session no longer exists
    if (sessions.length > 0) {
      const firstSession = sessions[0]
      const wins = windows.get(firstSession.name) || []
      const firstWin = wins[0]
      switchSession(firstSession.name, firstWin?.index)
    }
  }, [sessions, primarySession, windows, switchSession])

  // Real-time window updates via WebSocket
  useEffect(() => {
    return mux.onWindowsUpdate((windowsBySession) => {
      const newWindows = new Map<string, TmuxWindow[]>()
      for (const [sessionName, wins] of Object.entries(windowsBySession)) {
        newWindows.set(sessionName, wins)
      }
      setWindows(newWindows)
    })
  }, [mux])

  // Subscribe to notification pushes via WebSocket
  useEffect(() => {
    return mux.onNotification((notification) => {
      pushNotification(notification)
      addToast(notification.title, 'info', {
        imageUrl: notification.image_url,
        onClick: notification.image_url
          ? () => setImageViewerSrc(notification.image_url!)
          : undefined,
      })
    })
  }, [mux, pushNotification, addToast])

  // Fallback polling (initial fetch + slow interval for resilience)
  useEffect(() => {
    const fetchWindows = async () => {
      if (sessions.length === 0) return

      const entries = await Promise.all(
        sessions.map(async (session) => {
          try {
            const wins = await getWindows(session.name)
            return [session.name, wins] as const
          } catch (error) {
            // Skip deleted sessions silently (404 is expected during deletion)
            if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
              return null
            }
            console.error(`Failed to get windows for session ${session.name}:`, error)
            return null
          }
        })
      )

      const newWindows = new Map<string, TmuxWindow[]>()
      for (const entry of entries) {
        if (!entry) continue
        newWindows.set(entry[0], entry[1])
      }
      setWindows(newWindows)
    }

    // Initial fetch (WebSocket may not be connected yet)
    fetchWindows()

    // Slow fallback poll (WebSocket provides real-time updates)
    const interval = setInterval(fetchWindows, 10000)
    return () => clearInterval(interval)
  }, [sessions])

  // Keyboard shortcuts (desktop only)
  useEffect(() => {
    if (isMobile) return

    const handler = (e: KeyboardEvent) => {
      // Ignore if target is an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Ctrl+\ — horizontal split
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        if (activePaneId && canSplit) {
          splitPane(activePaneId, 'horizontal')
        }
        return
      }

      // Ctrl+- — vertical split
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        if (activePaneId && canSplit) {
          splitPane(activePaneId, 'vertical')
        }
        return
      }

      // Ctrl+W — close current pane
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activePaneId) {
          closePane(activePaneId)
          // Select the first remaining pane
          const remaining = getPaneIds().filter((id) => id !== activePaneId)
          setActivePaneId(remaining[0] ?? null)
        }
        return
      }

      // Ctrl+B — toggle left sidebar (sessions)
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(prev => !prev)
        return
      }

      // Ctrl+E — toggle right panel / focus files tab
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        if (settings.rightPanelCollapsed) {
          updateSettings({ rightPanelCollapsed: false, rightPanelTab: 'files' })
        } else if (settings.rightPanelTab !== 'files') {
          updateSettings({ rightPanelTab: 'files' })
        } else {
          updateSettings({ rightPanelCollapsed: true })
        }
        return
      }

      // Ctrl+Shift+F — focus search tab in right panel
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        updateSettings({ rightPanelCollapsed: false, rightPanelTab: 'search' })
        return
      }

      // Ctrl+P — quick file search
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        setShowQuickFile(prev => !prev)
        return
      }

      // Ctrl+S — save file in editor
      if (e.ctrlKey && e.key === 's') {
        if (floatingEditor.state.isOpen && floatingEditor.state.activeTabId) {
          e.preventDefault()
          floatingEditor.saveCurrentFile()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isMobile, activePaneId, canSplit, splitPane, closePane, getPaneIds, setActivePaneId])

  // Sync selectedWindow with activePaneId
  useEffect(() => {
    // Mobile keeps its own selected window state; syncing from split panes
    // causes tap flicker and selection rollback in the session list.
    if (isMobile) return
    if (!activePaneId) return
    const pw = paneWindowMap[activePaneId]
    if (
      pw &&
      (selectedWindow?.sessionName !== pw.sessionName ||
        selectedWindow?.windowIndex !== pw.windowIndex)
    ) {
      setSelectedWindow({ sessionName: pw.sessionName, windowIndex: pw.windowIndex })
    }
  }, [isMobile, activePaneId, paneWindowMap, selectedWindow])

  const handleCreate = async (name: string, startDirectory?: string, initCommand?: string) => {
    try {
      // Persist init command for this session (used by every new window)
      if (initCommand) {
        setInitCommand(name, initCommand)
      }

      const session = await createSession(name, startDirectory)
      // Get the first window of the new session
      const wins = await getWindows(session.name)
      const firstWin = wins[0]

      if (firstWin) {
        // Mark the first window so TerminalPane executes the init command
        if (initCommand) {
          markWindowPending(session.name, firstWin.index)
        }
        // Switch to the new session's workspace
        switchSession(session.name, firstWin.index)
        setSelectedWindow({ sessionName: session.name, windowIndex: firstWin.index })
      }
    } catch {
      addToast(t('toast.createSessionFailed', { name }), 'error')
    }
  }

  const handleCreateWindow = async (sessionName: string) => {
    try {
      const newWindow = await createWindow(sessionName)
      // Mark the new window for init command execution
      markWindowPending(sessionName, newWindow.index)
      // Refresh windows list for this session
      const wins = await getWindows(sessionName)
      setWindows((prev) => new Map(prev).set(sessionName, wins))
      // Assign the new window to the active pane
      if (activePaneId) {
        assignWindow(activePaneId, sessionName, newWindow.index)
      }
      addToast(t('toast.createdWindow', { index: newWindow.index }), 'success')
    } catch {
      addToast(t('toast.createWindowFailed', { name: sessionName }), 'error')
    }
  }

  const handleDeleteWindow = async (sessionName: string, windowIndex: number) => {
    try {
      // Check if this is the last window
      const wins = windows.get(sessionName) || []
      if (wins.length <= 1) {
        // Last window — delete the entire session
        await deleteSession(sessionName)
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        addToast(t('toast.deletedSession', { name: sessionName }), 'success')
        return
      }

      // Normal window deletion
      await deleteWindow(sessionName, windowIndex)
      setWindows((prev) => {
        const next = new Map(prev)
        const currentWins = next.get(sessionName) || []
        const updated = currentWins.filter((w) => w.index !== windowIndex)
        next.set(sessionName, updated)
        return next
      })
      addToast(t('toast.deletedWindow', { index: windowIndex }), 'success')
    } catch (error: unknown) {
      const isLastWindowError =
        typeof error === 'object' &&
        error !== null &&
        'error' in error &&
        (error as { error?: string }).error === 'last_window'

      if (isLastWindowError) {
        // Fallback: if backend returns last_window error, delete the session
        await deleteSession(sessionName)
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        addToast(t('toast.deletedSession', { name: sessionName }), 'success')
      } else {
        addToast(t('toast.deleteWindowFailed', { index: windowIndex }), 'error')
      }
    }
  }

  const handleDeleteSession = async (sessionName: string) => {
    try {
      await deleteSession(sessionName)
      setWindows((prev) => {
        const next = new Map(prev)
        next.delete(sessionName)
        return next
      })
      addToast(t('toast.deletedSession', { name: sessionName }), 'success')
    } catch {
      addToast(t('toast.deleteSessionFailed', { name: sessionName }), 'error')
    }
  }

  const handleLogoClick = () => {
    setSelectedWindow(null)
  }

  // isWindowInUse is now provided by useSplitLayout hook

  /**
   * Handle clicking a session header in sidebar.
   * Saves current layout, switches to that session's workspace.
   */
  const handleSelectSession = useCallback((sessionName: string) => {
    const wins = windowsRef.current.get(sessionName) || []
    const firstWin = wins[0]
    switchSession(sessionName, firstWin?.index)
  }, [switchSession])

  /**
   * Handle clicking a specific window in sidebar.
   *
   * Cross-session: use switchSession to restore saved layout (preserves splits).
   * Same-session:  use selectWindow (focus if visible, restore saved split if
   *                the window was part of it, or fullscreen as last resort).
   */
  const handleSelectWindow = useCallback((sessionName: string, windowIndex: number) => {
    setSelectedWindow({ sessionName, windowIndex })

    // Mobile: update pane state so the sync effect doesn't revert selectedWindow
    if (isMobile) {
      if (activePaneId) {
        assignWindow(activePaneId, sessionName, windowIndex)
      }
      setMobileView('terminal')
      return
    }

    // Cross-session click: switch workspace (restores saved split layout)
    if (primarySession !== sessionName) {
      switchSession(sessionName, windowIndex)
      return
    }

    // Same-session click
    selectWindow(sessionName, windowIndex)
  }, [isMobile, activePaneId, assignWindow, selectWindow, switchSession, primarySession])

  /** Handle drag-and-drop of a window onto the CENTER of a pane (replace). */
  const handleDropWindow = useCallback(
    (paneId: string, sessionName: string, windowIndex: number) => {
      // Skip if target pane already shows this exact window
      const current = paneWindowMap[paneId]
      if (current && current.sessionName === sessionName && current.windowIndex === windowIndex) {
        return
      }
      assignWindow(paneId, sessionName, windowIndex)
      setActivePaneId(paneId)
      setSelectedWindow({ sessionName, windowIndex })
    },
    [assignWindow, setActivePaneId, paneWindowMap]
  )

  /** Handle drag-and-drop of a window onto an EDGE of a pane (split). */
  const handleSplitDrop = useCallback(
    (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => {
      splitAndAssign(paneId, zone, sessionName, windowIndex)
      setSelectedWindow({ sessionName, windowIndex })
    },
    [splitAndAssign]
  )

  const handleMobileBack = useCallback(() => {
    setMobileView('sessions')
  }, [])

  const handleRightPanelTabChange = useCallback((tab: RightPanelTab) => {
    updateSettings({ rightPanelTab: tab })
  }, [updateSettings])

  const handleRightPanelWidthChange = useCallback((nextWidth: number) => {
    updateSettings({ rightPanelWidth: nextWidth })
  }, [updateSettings])

  const handleRightPanelCollapsedChange = useCallback((collapsed: boolean) => {
    updateSettings({ rightPanelCollapsed: collapsed })
  }, [updateSettings])

  // Changes click → open right panel changes tab
  const handleChangesClick = useCallback(() => {
    updateSettings({ rightPanelCollapsed: false, rightPanelTab: 'changes' })
  }, [updateSettings])

  /** Create a new window in the given session and attach it to the active pane */
  const handleCreateAndAttachWindow = useCallback(async (sessionName: string) => {
    try {
      const newWindow = await createWindow(sessionName)
      markWindowPending(sessionName, newWindow.index)
      const wins = await getWindows(sessionName)
      setWindows((prev) => new Map(prev).set(sessionName, wins))
      if (activePaneId) {
        assignWindow(activePaneId, sessionName, newWindow.index)
      }
      setSelectedWindow({ sessionName, windowIndex: newWindow.index })
      addToast(t('toast.createdWindow', { index: newWindow.index }), 'success')
    } catch {
      addToast(t('toast.createWindowFailed', { name: sessionName }), 'error')
    }
  }, [activePaneId, assignWindow, addToast, t])

  /** Create a new window and attach to a specific pane (used by empty pane placeholder) */
  const handleCreateWindowForPane = useCallback(async (paneId: string) => {
    if (!primarySession) return
    try {
      const newWindow = await createWindow(primarySession)
      markWindowPending(primarySession, newWindow.index)
      const wins = await getWindows(primarySession)
      setWindows((prev) => new Map(prev).set(primarySession, wins))
      assignWindow(paneId, primarySession, newWindow.index)
      setActivePaneId(paneId)
      setSelectedWindow({ sessionName: primarySession, windowIndex: newWindow.index })
      addToast(t('toast.createdWindow', { index: newWindow.index }), 'success')
    } catch {
      addToast(t('toast.createWindowFailed', { name: primarySession }), 'error')
    }
  }, [primarySession, assignWindow, setActivePaneId, addToast, t])

  const activeWorkspace: WorkspaceContext | undefined = useMemo(
    () => selectedWindow
      ? { session: selectedWindow.sessionName, window: selectedWindow.windowIndex }
      : undefined,
    [selectedWindow?.sessionName, selectedWindow?.windowIndex]
  )

  // Git state — branch info + change count
  const [gitChangeCount, setGitChangeCount] = useState(0)
  const [gitBranch, setGitBranch] = useState('—')
  const [gitAhead, setGitAhead] = useState(0)
  const [gitBehind, setGitBehind] = useState(0)
  const [gitIsWorktree, setGitIsWorktree] = useState(false)
  const [gitBranches, setGitBranches] = useState<GitBranch[]>([])
  const [gitWorktrees, setGitWorktrees] = useState<WorktreeInfo[]>([])
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false)
  const [showWorktreeCreate, setShowWorktreeCreate] = useState(false)
  const [worktreeTargetSession, setWorktreeTargetSession] = useState<string | null>(null)
  const [branchSwitching, setBranchSwitching] = useState(false)
  const [worktreeCreating, setWorktreeCreating] = useState(false)

  // Fetch git status (branch, ahead/behind, changes, worktree)
  const refreshGitStatus = useCallback(() => {
    getGitStatus(activeWorkspace)
      .then(s => {
        setGitChangeCount(s.files.length)
        setGitBranch(s.branch)
        setGitAhead(s.ahead)
        setGitBehind(s.behind)
        setGitIsWorktree(s.is_worktree ?? false)
      })
      .catch(() => {})
  }, [activeWorkspace])

  // Full refresh including worktree list (expensive, don't call on every file change)
  const refreshGitInfo = useCallback(() => {
    refreshGitStatus()
    listWorktrees(activeWorkspace)
      .then(res => setGitWorktrees(res.worktrees))
      .catch(() => {})
  }, [activeWorkspace, refreshGitStatus])

  useEffect(() => {
    refreshGitInfo()
  }, [refreshGitInfo])

  // Auto-refresh git status on file changes (debounced, no worktree list)
  const refreshGitStatusRef = useRef(refreshGitStatus)
  refreshGitStatusRef.current = refreshGitStatus
  const fileChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return mux.onFileChange(() => {
      if (fileChangeTimerRef.current) clearTimeout(fileChangeTimerRef.current)
      fileChangeTimerRef.current = setTimeout(() => {
        refreshGitStatusRef.current()
      }, 2000)
    })
  }, [mux]) // stable deps only — no re-subscribe on state changes

  // Branch switcher: open popover and fetch branches
  const handleBranchClick = useCallback(() => {
    setShowBranchSwitcher(prev => !prev)
    getGitBranches(activeWorkspace)
      .then(res => setGitBranches(res.branches))
      .catch(() => {})
  }, [activeWorkspace])

  // Branch checkout
  const handleBranchCheckout = useCallback(async (branch: string) => {
    setBranchSwitching(true)
    try {
      await gitCheckout(branch, activeWorkspace)
      setShowBranchSwitcher(false)
      refreshGitInfo()
      addToast(t('git.switchedTo', { branch }), 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      addToast(t('branch.switchFailed', { msg }), 'error')
    } finally {
      setBranchSwitching(false)
    }
  }, [activeWorkspace, refreshGitInfo, addToast, t])

  // Worktree creation — uses the session that was clicked, not the active one
  const handleWorktreeCreate = useCallback(async (baseBranch: string, newBranch: string, dirName: string) => {
    setWorktreeCreating(true)
    const ws = worktreeTargetSession ? { session: worktreeTargetSession, window: 0 } : activeWorkspace
    try {
      const result = await createWorktree(baseBranch, newBranch, dirName, ws)
      setShowWorktreeCreate(false)
      addToast(t('worktree.created', { branch: result.branch }), 'success')
      // Create a session in the new worktree directory
      await handleCreate(newBranch, result.path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      addToast(t('worktree.createFailed', { msg }), 'error')
    } finally {
      setWorktreeCreating(false)
    }
  }, [worktreeTargetSession, activeWorkspace, addToast, t])

  // Project name for worktree directory naming
  const projectName = useMemo(() => {
    if (activeWorkspace?.session) return activeWorkspace.session.split('/').pop() ?? '0xmux'
    return '0xmux'
  }, [activeWorkspace])

  // Open file in floating editor from file explorer / search results
  const handleOpenFile = useCallback((path: string, line?: number) => {
    floatingEditor.openFile(path, line, 'edit', undefined, activeWorkspace)
  }, [floatingEditor, activeWorkspace])

  // @ trigger in terminal opens quick file search
  const handleAtTrigger = useCallback(() => {
    setShowQuickFile(true)
  }, [])

  // File path link clicked in terminal — open in floating editor
  const handleTerminalFileClick = useCallback((path: string, line?: number, workspace?: WorkspaceContext) => {
    floatingEditor.openFile(path, line, 'edit', undefined, workspace)
  }, [floatingEditor])

  // Image link clicked in terminal — open in ImageViewer
  const handleTerminalImageClick = useCallback((imageUrl: string) => {
    setImageViewerSrc(imageUrl)
  }, [])

  // Open diff in floating editor from git panel
  const handleOpenDiff = useCallback(async (path: string, staged: boolean) => {
    try {
      const diff = await getGitDiff(path, staged, activeWorkspace)
      floatingEditor.openFile(path, undefined, 'diff', diff.original, activeWorkspace)
    } catch {
      // fallback: open as normal file
      floatingEditor.openFile(path, undefined, 'edit', undefined, activeWorkspace)
    }
  }, [floatingEditor, activeWorkspace])

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    updateSettings({ sidebarWidth: nextWidth })
  }, [updateSettings])

  // ── Editor Drag & Drop ──
  const [editorDragOver, setEditorDragOver] = useState(false)

  const handleEditorDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Ignore app-internal drags
    if (isTerminalFileDrag(e.dataTransfer)) return
    if (Array.from(e.dataTransfer.types).includes('text/window-key')) return
    if (!Array.from(e.dataTransfer.types).includes('Files')) return

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setEditorDragOver(true)
  }, [])

  const handleEditorDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setEditorDragOver(false)
  }, [])

  const handleEditorDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    setEditorDragOver(false)
    // Ignore app-internal drags
    if (isTerminalFileDrag(e.dataTransfer)) return
    if (Array.from(e.dataTransfer.types).includes('text/window-key')) return

    const nativeFiles = Array.from(e.dataTransfer.files)
    if (nativeFiles.length === 0) return

    e.preventDefault()
    e.stopPropagation()

    // Determine target directory from active tab's file path
    const activeTab = floatingEditor.state.tabs.find(
      t => t.id === floatingEditor.state.activeTabId
    )
    let dir: string | undefined
    if (activeTab?.filePath) {
      const lastSlash = activeTab.filePath.lastIndexOf('/')
      if (lastSlash > 0) dir = activeTab.filePath.substring(0, lastSlash)
    }

    try {
      const results = await uploadFiles(nativeFiles, dir, activeWorkspace)
      // Open uploaded files in editor
      for (const result of results) {
        floatingEditor.openFile(result.path, undefined, 'edit', undefined, activeWorkspace)
      }
    } catch (error) {
      console.error('Failed to upload dropped files to editor', error)
    }
  }, [floatingEditor, activeWorkspace])

  // Auth loading — CRT boot sequence
  if (authLoading || depsLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: 'var(--color-bg)', animation: 'crt-boot 0.6s ease-out' }}
      >
        {/* Vault Boy ASCII / pixel icon */}
        <div
          className="text-[var(--color-primary)] opacity-80"
          style={{
            textShadow: '0 0 8px rgba(27,255,128,0.5), 0 0 20px rgba(27,255,128,0.2)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            lineHeight: '10px',
            letterSpacing: '1px',
            whiteSpace: 'pre',
          }}
        >
{`    ██
   ████
   ████
  ██████
 ██ ██ █
    ██
   ████
   █  █
   █  █  `}
        </div>
        {/* Boot text lines */}
        <div
          className="flex flex-col items-center gap-1 text-[var(--color-primary)]"
          style={{
            fontFamily: 'var(--font-mono)',
            textShadow: '0 0 6px rgba(27,255,128,0.4)',
          }}
        >
          <span className="text-xs tracking-widest opacity-60">VAULT-TEC INDUSTRIES</span>
          <span className="text-lg font-bold tracking-wider">0xMux TERMINAL</span>
          <span className="text-xs animate-pulse tracking-wide opacity-70 mt-2">
            {t('app.initializing')}
          </span>
          {/* Blinking cursor */}
          <span
            className="inline-block w-[8px] h-[14px] bg-[var(--color-primary)] mt-1"
            style={{ animation: 'blink 1s step-end infinite' }}
          />
        </div>
        <style>{`
          @keyframes crt-boot {
            0% { opacity: 0; transform: scaleY(0.01); filter: brightness(10); }
            40% { opacity: 1; transform: scaleY(0.01); filter: brightness(10); }
            50% { transform: scaleY(1.1); filter: brightness(2); }
            65% { transform: scaleY(0.95); filter: brightness(1.2); }
            80% { transform: scaleY(1.02); }
            100% { transform: scaleY(1); filter: brightness(1); }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  // Setup password (first time)
  if (!authStatus?.initialized) {
    return (
      <>
        <LocaleFontBridge />
        <SetupPasswordModal onSubmit={setup} onSkip={skip} />
      </>
    )
  }

  // Login required
  if (!authStatus?.authenticated) {
    return (
      <>
        <LocaleFontBridge />
        <LoginModal onSubmit={login} />
      </>
    )
  }

  if (needsSetup && deps) {
    return (
      <div className="min-h-screen p-4 md:p-8 pb-16 max-w-screen-xl mx-auto">
        <LocaleFontBridge />
        <SetupWizard
          deps={deps}
          onInstall={installPackage}
          allReady={allReady}
        />
      </div>
    )
  }

  const hasSessions = !loading && sessions.length > 0
  const mobileTerminalFontSize = isNarrowMobile
    ? Math.min(settings.fontSize, 9)
    : Math.min(settings.fontSize, 10)

  // Compact desktop (foldable split-screen, 640–768px): use mobile-level font
  const desktopTerminalFontSize = isCompact
    ? Math.min(settings.fontSize, 10)
    : settings.fontSize

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      <LocaleFontBridge />

      {/* Header */}
      <Header
        connectionStatus={connectionStatus}
        onLogoClick={handleLogoClick}
        onPluginClick={() => setShowPluginCenter(true)}
        showPluginButton={aiStatus?.show_plugin_button ?? false}
        onSettingsClick={() => setShowSettings(true)}
        unreadCount={unreadCount}
        showNotifications={showNotifications}
        onToggleNotifications={() => setShowNotifications(prev => !prev)}
        notifications={notifications}
        onMarkAllRead={markAllNotificationsRead}
        onMarkRead={markNotificationRead}
        onDismissNotification={dismissNotification}
        onImageClick={(url) => setImageViewerSrc(url)}
      />

      {/* Main area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="animate-pulse text-sm text-[var(--color-fg-muted)]">
            Loading sessions...
          </span>
        </div>
      ) : !hasSessions ? (
        <EmptyState
          onQuickCreate={() => handleCreate('main')}
          onCustomCreate={() => setShowCreate(true)}
        />
      ) : isMobile ? (
        /* ─── Mobile layout ─── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {mobileView === 'sessions' ? (
            /* ── Sessions list ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Create session button */}
              <div className="px-3 py-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-[length:var(--border-w)] border-[var(--color-primary)]
                    text-[var(--color-primary)] font-bold text-xs transition-colors
                    active:bg-[var(--color-primary)] active:text-[var(--color-primary-fg)]"
                >
                  <Icon icon={IconPlus} width={14} />
                  New Session
                </button>
              </div>

              {/* Session folders with windows */}
              <div className="flex-1 overflow-y-auto pb-14">
                {sessions.map((s) => {
                  const wins = windows.get(s.name) || []
                  const isExpanded = selectedWindow?.sessionName === s.name
                  return (
                    <div key={s.name}>
                      {/* Session header */}
                      <div
                        onClick={() => {
                          if (isExpanded) {
                            // Toggle collapse: clear selection to fold
                            setSelectedWindow(null)
                          } else {
                            const firstWin = wins[0]
                            if (firstWin) {
                              setSelectedWindow({ sessionName: s.name, windowIndex: firstWin.index })
                            }
                          }
                        }}
                        className={`flex items-center gap-3 px-4 min-h-[52px] cursor-pointer transition-colors border-b border-[var(--color-border-light)]
                          ${isExpanded ? 'bg-[var(--color-bg-alt)]' : 'active:bg-[var(--color-bg-alt)]'}`}
                        style={{ borderLeft: isExpanded ? '3px solid var(--color-primary)' : '3px solid transparent' }}
                      >
                        <Icon
                          icon={IconChevronRight}
                          width={12}
                          className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <div className={`w-2 h-2 shrink-0 rounded-full ${s.attached ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border-light)]'}`} />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm truncate block ${isExpanded ? 'font-black' : 'font-bold'}`}>{s.name}</span>
                        </div>
                        <span className="text-[10px] text-[var(--color-fg-muted)] tabular-nums shrink-0">{wins.length}w</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.name) }}
                          className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--color-fg-muted)] active:text-[var(--color-danger)]"
                        >
                          <Icon icon={IconTrash} width={14} />
                        </button>
                      </div>

                      {/* Expanded windows */}
                      {isExpanded && wins.map((w) => (
                        <div
                          key={w.index}
                          onClick={() => handleSelectWindow(s.name, w.index)}
                          className={`flex items-center gap-2.5 pl-10 pr-4 min-h-[44px] cursor-pointer transition-colors border-b border-[var(--color-border-light)]/50
                            ${selectedWindow?.windowIndex === w.index ? 'bg-[var(--color-bg-alt)]' : 'active:bg-[var(--color-bg-alt)]'}`}
                          style={{ borderLeft: selectedWindow?.windowIndex === w.index ? '3px solid var(--color-primary)' : '3px solid transparent' }}
                        >
                          <span className="text-xs font-mono flex-1 min-w-0 truncate">
                            <span className="text-[var(--color-fg-muted)]">{w.index}:</span> {w.name}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteWindow(s.name, w.index) }}
                            className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--color-fg-muted)] active:text-[var(--color-danger)]"
                          >
                            <Icon icon={IconTrash} width={12} />
                          </button>
                        </div>
                      ))}

                      {/* Add window button when expanded */}
                      {isExpanded && (
                        <div
                          onClick={() => handleCreateWindow(s.name)}
                          className="flex items-center gap-2 pl-10 pr-4 min-h-[40px] cursor-pointer text-[var(--color-fg-muted)] active:text-[var(--color-primary)] transition-colors border-b border-[var(--color-border-light)]/50"
                          style={{ borderLeft: '3px solid transparent' }}
                        >
                          <Icon icon={IconPlus} width={12} />
                          <span className="text-xs font-bold">New window</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bottom nav - sessions view */}
              <MobileNav activeView={mobileView} onViewChange={setMobileView} unreadCount={unreadCount} />
            </div>
          ) : mobileView === 'notifications' ? (
            /* ── Mobile notifications view ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pb-14">
                <NotificationPanel
                  notifications={notifications}
                  onMarkAllRead={markAllNotificationsRead}
                  onMarkRead={markNotificationRead}
                  onDismiss={dismissNotification}
                  onImageClick={(url) => setImageViewerSrc(url)}
                />
              </div>
              <MobileNav activeView={mobileView} onViewChange={setMobileView} unreadCount={unreadCount} />
            </div>
          ) : (
            /* ── Terminal view ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top bar: back + session name + window tabs */}
              <div className="border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
                {/* Session header row */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    onClick={handleMobileBack}
                    className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--color-fg-muted)] active:text-[var(--color-fg)]"
                  >
                    <Icon icon={IconChevronLeft} width={18} />
                  </button>
                  <span className="text-xs font-black truncate flex-1 min-w-0">
                    {selectedWindow?.sessionName ?? ''}
                  </span>
                  <button
                    onClick={() => selectedWindow && handleCreateWindow(selectedWindow.sessionName)}
                    className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--color-fg-muted)] active:text-[var(--color-primary)]"
                    title="New window"
                  >
                    <Icon icon={IconPlus} width={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedWindow) return
                      const { sessionName, windowIndex } = selectedWindow
                      const wins = windows.get(sessionName) || []
                      // Find next window to switch to after deletion
                      const remaining = wins.filter(w => w.index !== windowIndex)
                      handleDeleteWindow(sessionName, windowIndex)
                      if (remaining.length > 0) {
                        setSelectedWindow({ sessionName, windowIndex: remaining[0].index })
                      } else {
                        setSelectedWindow(null)
                        setMobileView('sessions')
                      }
                    }}
                    className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--color-fg-muted)] active:text-[var(--color-danger)]"
                    title="Close window"
                  >
                    <Icon icon={IconX} width={16} />
                  </button>
                </div>

                {/* Window tabs — horizontally scrollable */}
                {selectedWindow && (() => {
                  const wins = windows.get(selectedWindow.sessionName) || []
                  if (wins.length <= 1) return null
                  return (
                    <div className="flex overflow-x-auto px-2 pb-1.5 gap-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                      {wins.map((w) => {
                        const isActive = selectedWindow.windowIndex === w.index
                        return (
                          <button
                            key={w.index}
                            onClick={() => handleSelectWindow(selectedWindow.sessionName, w.index)}
                            className={`shrink-0 px-3 py-1.5 text-[11px] font-mono font-bold transition-colors
                              ${isActive
                                ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                                : 'bg-[var(--color-bg-alt)] text-[var(--color-fg-muted)] active:bg-[var(--color-border-light)]'
                              }`}
                          >
                            {w.index}:{w.name}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Terminal — padding-bottom reserves space for the fixed VirtualKeybar */}
              {selectedWindow && (
                <div className="flex-1 min-h-0" style={{ paddingBottom: VIRTUAL_KEYBAR_HEIGHT }}>
                  <TerminalPane
                    sessionName={selectedWindow.sessionName}
                    windowIndex={selectedWindow.windowIndex}
                    fontSize={mobileTerminalFontSize}
                    focused
                    terminalRef={mobileTerminalRef}
                    mobileBottomOffset={VIRTUAL_KEYBAR_HEIGHT}
                    onAtTrigger={handleAtTrigger}
                    atTriggerEnabled={settings.quickFileTrigger}
                    onFileClick={handleTerminalFileClick}
                    onImageClick={handleTerminalImageClick}
                  />
                </div>
              )}

              {/* Virtual keybar — fixed at bottom of visual viewport, stays above keyboard */}
              <VirtualKeybar terminalRef={mobileTerminalRef} onBack={handleMobileBack} />
            </div>
          )}
        </div>
      ) : (
        /* Desktop layout: SessionSidebar + Workspace + RightPanel + StatusBar */
        <>
        <div className="flex-1 flex overflow-hidden relative bg-[var(--color-bg)]">
          {/* Left: Sessions sidebar (reuses SidebarContainer-style resize) */}
          <div
            className="relative shrink-0 overflow-hidden flex flex-col bg-[var(--color-bg)] border-r border-r-[var(--color-border-light)]/30"
            style={{
              width: sidebarCollapsed ? 0 : settings.sidebarWidth,
              transition: 'width 200ms ease',
            }}
          >
            {!sidebarCollapsed && (
              <>
                <SessionSidebar
                  sessions={sessions}
                  windows={windows}
                  selectedWindow={selectedWindow}
                  selectedSession={primarySession}
                  onSelectSession={handleSelectSession}
                  onSelectWindow={handleSelectWindow}
                  onCreateSession={() => setShowCreate(true)}
                  onCreateWindow={handleCreateWindow}
                  onDeleteWindow={handleDeleteWindow}
                  onDeleteSession={handleDeleteSession}
                  onCreateWorktree={(sessionName) => {
                    setWorktreeTargetSession(sessionName)
                    setShowWorktreeCreate(true)
                    const ws = { session: sessionName, window: 0 }
                    getGitBranches(ws)
                      .then(res => setGitBranches(res.branches))
                      .catch(() => {})
                  }}
                  isWindowInUse={isWindowInUse}
                  isInSplitGroup={isInSplitGroup}
                  collapsed={false}
                />
                {/* Right-edge resize handle */}
                <div
                  className="absolute top-0 right-0 h-full w-1 cursor-col-resize z-10 hover:bg-[var(--color-primary)]/15"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const startW = settings.sidebarWidth
                    const onMove = (ev: MouseEvent) => {
                      const w = Math.max(220, Math.min(520, startW + ev.clientX - startX))
                      handleSidebarWidthChange(w)
                    }
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                  title="Resize sidebar"
                />
              </>
            )}
          </div>

          {/* Center: Workspace */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--color-bg)]">
            {selectedWindow || Object.keys(paneWindowMap).length > 0 ? (
              <div className="flex-1 flex flex-col min-h-0">
                  <SplitWorkspace
                    layout={layout}
                    fontSize={desktopTerminalFontSize}
                    canSplit={canSplit}
                    activePaneId={activePaneId}
                    paneCount={paneCount}
                    onSplit={splitPane}
                    onClose={closePane}
                    onPaneFocus={setActivePaneId}
                    paneWindowMap={paneWindowMap}
                    onDropWindow={handleDropWindow}
                    onSplitDrop={handleSplitDrop}
                    isWindowInUse={isWindowInUse}
                    activeTerminalRef={activeTerminalRef}
                    getAllTrackedWindowKeys={getAllTrackedWindowKeys}
                    onAtTrigger={handleAtTrigger}
                    atTriggerEnabled={settings.quickFileTrigger}
                    onFileClick={handleTerminalFileClick}
                    onImageClick={handleTerminalImageClick}
                    onCreateAndAttachWindow={handleCreateAndAttachWindow}
                    onCreateWindowForPane={handleCreateWindowForPane}
                  />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-[var(--color-fg-muted)]">
                  <Icon icon={IconTerminal} width={32} height={32} className="text-[var(--color-border-light)]" />
                  <p className="text-sm font-bold">Select a session to start</p>
                </div>
              </div>
            )}

            {/* Floating Editor Window */}
            {floatingEditor.state.isOpen && (
              <FloatingWindow
                isOpen={floatingEditor.state.isOpen}
                minimized={floatingEditor.state.minimized}
                x={floatingEditor.state.x}
                y={floatingEditor.state.y}
                width={floatingEditor.state.width}
                height={floatingEditor.state.height}
                opacity={settings.editorOpacity}
                title={
                  floatingEditor.state.tabs.find(t => t.id === floatingEditor.state.activeTabId)?.filePath.split('/').pop() ?? 'Editor'
                }
                onClose={floatingEditor.closeEditor}
                onMinimize={floatingEditor.minimizeEditor}
                onRestore={floatingEditor.restoreEditor}
                onPositionChange={floatingEditor.updatePosition}
                onSizeChange={floatingEditor.updateSize}
                onOpacityChange={(o) => updateSettings({ editorOpacity: o })}
              >
                {/* Wrapper: whole editor panel accepts external file drops */}
                <div
                  className="flex-1 flex flex-col min-h-0 relative"
                  onDragOver={handleEditorDragOver}
                >
                  {/* Editor Tabs */}
                  <EditorTabs
                    tabs={floatingEditor.state.tabs}
                    activeTabId={floatingEditor.state.activeTabId}
                    onSelectTab={floatingEditor.setActiveTab}
                    onCloseTab={floatingEditor.closeTab}
                    onCloseAllTabs={floatingEditor.closeAllTabs}
                    onCloseOtherTabs={floatingEditor.closeOtherTabs}
                    onCloseTabsToLeft={floatingEditor.closeTabsToLeft}
                    onCloseTabsToRight={floatingEditor.closeTabsToRight}
                  />

                  {/* Editor Content */}
                  {(() => {
                    const activeTab = floatingEditor.state.tabs.find(
                      t => t.id === floatingEditor.state.activeTabId
                    )
                    if (!activeTab) return null
                    return (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0">
                          <EditorPane
                            filePath={activeTab.filePath}
                            language={activeTab.language}
                            content={activeTab.content}
                            mode={activeTab.mode}
                            editorSettings={settings}
                            diffOriginal={activeTab.diffOriginal}
                            imageUrl={activeTab.imageUrl}
                            onSave={() => floatingEditor.saveCurrentFile()}
                            onChange={(value: string) => {
                              floatingEditor.updateTabContent(activeTab.id, value)
                            }}
                          />
                        </div>
                        <EditorStatusBar
                          language={activeTab.language}
                          line={1}
                          col={1}
                          fileSize={activeTab.content.length}
                          encoding="utf-8"
                        />
                      </div>
                    )
                  })()}

                  {/* Drop overlay — pointer-events:auto to capture drops above Monaco */}
                  {editorDragOver && (
                    <div
                      className="absolute inset-0 z-[8] bg-[var(--color-accent)]/10 border-2 border-dashed border-[var(--color-accent)]/70"
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                      onDragLeave={handleEditorDragLeave}
                      onDrop={handleEditorDrop}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="px-2 py-1 text-[10px] font-mono text-[var(--color-accent)] bg-[var(--color-bg)]/90 border border-[var(--color-accent)]/50">
                          {t('editor.dropHere')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </FloatingWindow>
            )}
          </main>

          {/* Right: File/Changes/Search panel */}
          <RightPanel
            activeTab={settings.rightPanelTab}
            onTabChange={handleRightPanelTabChange}
            width={settings.rightPanelWidth}
            onWidthChange={handleRightPanelWidthChange}
            collapsed={settings.rightPanelCollapsed}
            onCollapsedChange={handleRightPanelCollapsedChange}
            gitChangeCount={gitChangeCount}
          >
            {{
              files: <FileExplorer onFileOpen={handleOpenFile} workspace={activeWorkspace} />,
              changes: <GitPanel onOpenDiff={handleOpenDiff} workspace={activeWorkspace} addToast={addToast} onChangeCount={setGitChangeCount} />,
              search: <SearchPanel onOpenFile={handleOpenFile} workspace={activeWorkspace} />,
            }}
          </RightPanel>
        </div>

        {/* Bottom status bar */}
        <div className="relative">
          <StatusBar
            branch={gitBranch}
            ahead={gitAhead}
            behind={gitBehind}
            changeCount={gitChangeCount}
            isWorktree={gitIsWorktree}
            worktrees={gitWorktrees}
            connectionStatus={connectionStatus}
            onBranchClick={handleBranchClick}
            onChangesClick={handleChangesClick}
            onWorktreeListClick={() => {
              setShowBranchSwitcher(false)
              setShowWorktreeCreate(true)
              getGitBranches(activeWorkspace)
                .then(res => setGitBranches(res.branches))
                .catch(() => {})
            }}
          />
          <BranchSwitcher
            open={showBranchSwitcher}
            onClose={() => setShowBranchSwitcher(false)}
            branches={gitBranches}
            currentBranch={gitBranch}
            onCheckout={handleBranchCheckout}
            onNewWorktree={() => { setShowBranchSwitcher(false); setShowWorktreeCreate(true) }}
            loading={branchSwitching}
          />
        </div>
        </>
      )}

      {/* Create session modal */}
      <CreateSessionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />

      {/* Worktree create modal */}
      <WorktreeCreateModal
        open={showWorktreeCreate}
        onClose={() => setShowWorktreeCreate(false)}
        branches={gitBranches}
        currentBranch={gitBranch}
        projectName={projectName}
        onSubmit={handleWorktreeCreate}
        loading={worktreeCreating}
      />

      {/* Plugin center modal */}
      <PluginModal
        open={showPluginCenter}
        onClose={() => setShowPluginCenter(false)}
        status={aiStatus}
        catalog={aiCatalog}
        loading={aiLoading}
        syncing={aiSyncing}
        lastResultText={
          aiSyncResult
            ? `同步结果：总计 ${aiSyncResult.summary.total} / 更新 ${aiSyncResult.summary.updated} / 最新 ${aiSyncResult.summary.up_to_date} / 跳过 ${aiSyncResult.summary.skipped} / 失败 ${aiSyncResult.summary.failed}`
            : aiUninstallResult
              ? `卸载结果：总计 ${aiUninstallResult.summary.total} / 删除 ${aiUninstallResult.summary.removed} / 跳过 ${aiUninstallResult.summary.skipped} / 未找到 ${aiUninstallResult.summary.not_found} / 失败 ${aiUninstallResult.summary.failed}`
              : null
        }
        onRefresh={refreshAiData}
        onSyncAll={(providers) => runAiSync({ providers, types: ['skills', 'mcp'] })}
        onSyncItem={(kind, id, providers) =>
          runAiSync({ providers, types: [kind], ids: [id] })
        }
        onUninstallAll={(providers) => runAiUninstall({ providers, types: ['skills', 'mcp'] })}
        onUninstallItem={(kind, id, providers) => runAiUninstall({ providers, types: [kind], ids: [id] })}
        onDeleteAll={(providers) => runAiUninstall({ providers, types: ['skills', 'mcp'], removeSource: true })}
        onDeleteItem={(kind, id, providers) =>
          runAiUninstall({ providers, types: [kind], ids: [id], removeSource: true })
        }
        globalConfig={globalConfig}
        globalConfigSaving={globalConfigSaving}
        onSaveGlobalConfig={handleSaveGlobalConfig}
        onSyncGlobalConfig={handleSyncGlobalConfig}
      />

      {/* Settings modal */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onChangePassword={changePassword}
        onLogout={() => {
          logout()
          setShowSettings(false)
        }}
      />

      {/* Quick file search popup (@ trigger from terminal) */}
      <QuickFileSearch
        isOpen={showQuickFile}
        onClose={() => setShowQuickFile(false)}
        onSelectFile={handleOpenFile}
        workspace={activeWorkspace}
      />

      {/* Toast notifications */}
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Full-screen image viewer */}
      {imageViewerSrc && (
        <ImageViewer
          src={imageViewerSrc}
          onClose={() => setImageViewerSrc(null)}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <MuxProvider>
          <AppContent />
        </MuxProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}

export default App
