import { useState, useEffect, useRef, useCallback } from 'react'
import { Header, EmptyState, MobileNav, type MobileView } from './components/layout'
import { SessionSidebar, CreateSessionModal } from './components/session'
import { SplitWorkspace, TerminalPane, WindowTabs } from './components/terminal'
import { VirtualKeybar } from './components/mobile/VirtualKeybar'
import { SetupWizard } from './components/setup'
import { SetupPasswordModal, LoginModal, SettingsModal } from './components/auth'
import { ToastContainer } from './components/ui/Toast'
import { useSessions } from './hooks/useSessions'
import { useDeps } from './hooks/useDeps'
import { useSplitLayout } from './hooks/useSplitLayout'
import { useSettings } from './hooks/useSettings'
import { useMobile } from './hooks/useMobile'
import { useToast } from './hooks/useToast'
import { useAuth } from './hooks/useAuth'
import { useImagePaste } from './hooks/useImagePaste'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { I18nProvider, useI18n } from './hooks/useI18n'
import { FUSION_PIXEL_FONT, SILKSCREEN_FONT } from './lib/theme'
import { Icon } from '@iconify/react'
import { IconTerminal, IconChevronLeft } from './lib/icons'
import type { Terminal } from '@xterm/xterm'
import { getWindows, createWindow, deleteWindow } from './lib/api'

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
    renameSession,
  } = useSessions()

  const { deps, loading: depsLoading, allReady, installPackage } = useDeps()

  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedWindow, setSelectedWindow] = useState<{ sessionName: string; windowIndex: number } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('sessions')
  const [windows, setWindows] = useState<Map<string, import('./lib/types').TmuxWindow[]>>(new Map())

  const { settings } = useSettings()
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
    switchToWindow,
  } = useSplitLayout()
  const isMobile = useMobile()
  const { toasts, addToast, removeToast } = useToast()
  const mobileTerminalRef = useRef<Terminal | null>(null)
  const activeTerminalRef = useRef<Terminal | null>(null)

  // Enable image paste feature
  useImagePaste(activeTerminalRef)

  const needsSetup = deps && !allReady

  // Auto-select first window if none selected and sessions exist
  useEffect(() => {
    if (selectedWindow && sessions.some((s) => s.name === selectedWindow.sessionName)) return
    if (sessions.length > 0) {
      const firstSession = sessions[0]
      const wins = windows.get(firstSession.name) || []
      const firstWin = wins[0]

      if (firstWin) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedWindow({ sessionName: firstSession.name, windowIndex: firstWin.index })
        // Initialize with single pane
        const leafIds = getPaneIds()
        if (leafIds.length === 1 && !paneWindowMap[leafIds[0]]) {
          assignWindow(leafIds[0], firstSession.name, firstWin.index)
          setActivePaneId(leafIds[0])
        }
      }
    } else {
      setSelectedWindow(null)
    }
  }, [sessions, selectedWindow, windows, getPaneIds, paneWindowMap, assignWindow, setActivePaneId])

  // Refresh windows list for all sessions
  // Use a ref to track sessions to avoid re-triggering on deletion
  const sessionsRef = useRef<TmuxSession[]>([])
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    const fetchWindows = async () => {
      // Read from ref to get latest sessions without triggering re-render
      const currentSessions = sessionsRef.current
      if (currentSessions.length === 0) return

      const newWindows = new Map<string, import('./lib/types').TmuxWindow[]>()
      for (const session of currentSessions) {
        try {
          const wins = await getWindows(session.name)
          newWindows.set(session.name, wins)
        } catch (error) {
          // Skip deleted sessions silently (404 is expected during deletion)
          if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            continue
          }
          console.error(`Failed to get windows for session ${session.name}:`, error)
        }
      }
      setWindows(newWindows)
    }

    // Initial fetch
    fetchWindows()

    // Poll every 2 seconds - independent of sessions changes
    const interval = setInterval(fetchWindows, 2000)
    return () => clearInterval(interval)
  }, [])

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

      // Ctrl+B — toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed((prev) => !prev)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isMobile, activePaneId, canSplit, splitPane, closePane, getPaneIds, setActivePaneId])

  // Sync selectedWindow with activePaneId
  useEffect(() => {
    if (!activePaneId) return
    const pw = paneWindowMap[activePaneId]
    if (
      pw &&
      (selectedWindow?.sessionName !== pw.sessionName ||
        selectedWindow?.windowIndex !== pw.windowIndex)
    ) {
      setSelectedWindow({ sessionName: pw.sessionName, windowIndex: pw.windowIndex })
    }
  }, [activePaneId, paneWindowMap, selectedWindow])

  const handleCreate = async (name: string, startDirectory?: string) => {
    try {
      const session = await createSession(name, startDirectory)
      // Get the first window of the new session
      const wins = await getWindows(session.name)
      const firstWin = wins[0]

      if (firstWin) {
        setSelectedWindow({ sessionName: session.name, windowIndex: firstWin.index })
        // Assign to active pane
        const paneIds = getPaneIds()
        if (activePaneId && paneIds.includes(activePaneId)) {
          assignWindow(activePaneId, session.name, firstWin.index)
        }
      }
    } catch {
      addToast(`Failed to create session "${name}"`, 'error')
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteSession(name)
    } catch {
      addToast(`Failed to delete session "${name}"`, 'error')
    }
  }

  const handleRename = async (oldName: string, newName: string) => {
    try {
      await renameSession(oldName, newName)
      if (selectedWindow?.sessionName === oldName) {
        setSelectedWindow({ sessionName: newName, windowIndex: selectedWindow.windowIndex })
      }
    } catch {
      addToast(`Failed to rename session "${oldName}"`, 'error')
    }
  }

  const handleCreateWindow = async (sessionName: string) => {
    try {
      const newWindow = await createWindow(sessionName)
      // Refresh windows list for this session
      const wins = await getWindows(sessionName)
      setWindows((prev) => new Map(prev).set(sessionName, wins))
      addToast(`Created window ${newWindow.index}`, 'success')
    } catch {
      addToast(`Failed to create window in "${sessionName}"`, 'error')
    }
  }

  const handleDeleteWindow = async (sessionName: string, windowIndex: number) => {
    try {
      // Check if this is the last window
      const wins = windows.get(sessionName) || []
      if (wins.length <= 1) {
        // This is the last window, delete the entire session directly
        await deleteSession(sessionName)
        // Immediately remove from local state
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        setSessions((prev) => prev.filter((s) => s.name !== sessionName))
        addToast(`Deleted session "${sessionName}"`, 'success')
        return
      }

      // Normal window deletion - immediately remove from local state
      await deleteWindow(sessionName, windowIndex)
      setWindows((prev) => {
        const next = new Map(prev)
        const currentWins = next.get(sessionName) || []
        const updated = currentWins.filter((w) => w.index !== windowIndex)
        next.set(sessionName, updated)
        return next
      })
      addToast(`Deleted window ${windowIndex}`, 'success')
    } catch (error: any) {
      if (error.error === 'last_window') {
        // Fallback: if backend returns last_window error, delete the session
        await deleteSession(sessionName)
        // Immediately remove from local state
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        setSessions((prev) => prev.filter((s) => s.name !== sessionName))
        addToast(`Deleted session "${sessionName}"`, 'success')
      } else {
        addToast(`Failed to delete window ${windowIndex}`, 'error')
      }
    }
  }

  const handleDeleteSession = async (sessionName: string) => {
    try {
      await deleteSession(sessionName)
      // Immediately remove from local state
      setWindows((prev) => {
        const next = new Map(prev)
        next.delete(sessionName)
        return next
      })
      setSessions((prev) => prev.filter((s) => s.name !== sessionName))
      addToast(`Deleted session "${sessionName}"`, 'success')
    } catch {
      addToast(`Failed to delete session "${sessionName}"`, 'error')
    }
  }

  const handleLogoClick = () => {
    setSelectedWindow(null)
  }

  /** Check if a window is already open in any pane */
  const isWindowInUse = useCallback(
    (sessionName: string, windowIndex: number): boolean => {
      return Object.values(paneWindowMap).some(
        (pw) => pw.sessionName === sessionName && pw.windowIndex === windowIndex
      )
    },
    [paneWindowMap]
  )

  const handleSelectWindow = useCallback((sessionName: string, windowIndex: number) => {
    setSelectedWindow({ sessionName, windowIndex })

    // Mobile: simple view switch
    if (isMobile) {
      setMobileView('terminal')
      return
    }

    // Desktop: intelligent layout switching
    const switchResult = switchToWindow(sessionName, windowIndex)

    // Show visual feedback
    if (switchResult === 'focus') {
      addToast(`已切换到窗格中的窗口 ${windowIndex}`, 'success')
    } else if (switchResult === 'restore') {
      addToast(`恢复窗口 ${windowIndex} 的分屏布局`, 'success')
    }
  }, [isMobile, switchToWindow, addToast])

  const handleMobileBack = useCallback(() => {
    setMobileView('sessions')
  }, [])

  /** Handle drag-and-drop of a window from sidebar onto a pane edge (split) */
  const handleDropSession = useCallback(
    async (_paneId: string, _direction: import('./lib/types').SplitDirection, _sessionName: string) => {
      // TODO: Update for window-based architecture
      // Drag-and-drop functionality needs to be redesigned for windows
      addToast('Drag-and-drop not yet supported in new architecture', 'info')
    },
    [addToast]
  )

  /** Handle drag-and-drop of a window to center of a pane (replace) */
  const handleReplaceSession = useCallback(
    (_paneId: string, _sessionName: string) => {
      // TODO: Update for window-based architecture
      // Drag-and-drop functionality needs to be redesigned for windows
      addToast('Drag-and-drop not yet supported in new architecture', 'info')
    },
    [addToast]
  )

  // Auth loading
  if (authLoading || depsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="animate-pulse text-sm text-[var(--color-fg-muted)]">
          {t('app.initializing')}
        </span>
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <LocaleFontBridge />

      {/* Header */}
      <Header
        connectionStatus={connectionStatus}
        onLogoClick={handleLogoClick}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Main area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="animate-pulse text-sm text-[var(--color-fg-muted)]">
            Loading sessions...
          </span>
        </div>
      ) : !hasSessions ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : isMobile ? (
        /* Mobile layout */
        <div className="flex-1 flex flex-col overflow-hidden pb-14">
          {mobileView === 'sessions' ? (
            <div className="flex-1 overflow-y-auto">
              {sessions.map((s) => {
                const wins = windows.get(s.name) || []
                const firstWin = wins[0]
                return (
                  <div
                    key={s.name}
                    onClick={() => {
                      if (firstWin) {
                        handleSelectWindow(s.name, firstWin.index)
                      }
                    }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b-[length:var(--border-w)] border-[var(--color-border-light)]
                      ${selectedWindow?.sessionName === s.name ? 'bg-[var(--color-bg-alt)]' : 'hover:bg-[var(--color-bg-alt)]'}
                      min-h-[56px] transition-colors`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.attached ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border-light)]'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold truncate block">{s.name}</span>
                      <span className="text-[10px] text-[var(--color-fg-muted)]">{s.windows} windows</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
                <button onClick={handleMobileBack} className="p-1 text-[var(--color-fg-muted)]">
                  <Icon icon={IconChevronLeft} width={18} />
                </button>
                <span className="text-xs font-bold truncate">
                  {selectedWindow ? `${selectedWindow.sessionName}:${selectedWindow.windowIndex}` : ''}
                </span>
              </div>
              {selectedWindow && (
                <div className="flex-1 min-h-0">
                  <TerminalPane
                    sessionName={selectedWindow.sessionName}
                    fontSize={settings.fontSize}
                    focused
                    terminalRef={mobileTerminalRef}
                  />
                </div>
              )}
              {mobileView === 'terminal' && <VirtualKeybar terminalRef={mobileTerminalRef} />}
            </div>
          )}
          <MobileNav activeView={mobileView} onViewChange={setMobileView} />
        </div>
      ) : (
        /* Desktop layout: sidebar + workspace */
        <div className="flex-1 flex overflow-hidden">
          <SessionSidebar
            sessions={sessions}
            windows={windows}
            selectedWindow={selectedWindow}
            onSelectWindow={handleSelectWindow}
            onCreateSession={() => setShowCreate(true)}
            onCreateWindow={handleCreateWindow}
            onDeleteWindow={handleDeleteWindow}
            onDeleteSession={handleDeleteSession}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />

          {/* Workspace */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--color-bg)]">
            {selectedWindow ? (
              <div className="flex-1 flex flex-col min-h-0">
                  <WindowTabs sessionName={selectedWindow.sessionName} />
                  <SplitWorkspace
                    layout={layout}
                    fontSize={settings.fontSize}
                    canSplit={canSplit}
                    activePaneId={activePaneId}
                    paneCount={paneCount}
                    onSplit={splitPane}
                    onClose={closePane}
                    onPaneFocus={setActivePaneId}
                    paneWindowMap={paneWindowMap}
                    onDropSession={handleDropSession}
                    onReplaceSession={handleReplaceSession}
                    isWindowInUse={isWindowInUse}
                    activeTerminalRef={activeTerminalRef}
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
          </main>
        </div>
      )}

      {/* Create session modal */}
      <CreateSessionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
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

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}

function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </I18nProvider>
  )
}

export default App
