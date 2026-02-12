import { useState, useEffect, useRef, useCallback } from 'react'
import { Header, EmptyState, MobileNav, type MobileView } from './components/layout'
import { SessionSidebar, CreateSessionModal } from './components/session'
import { SplitWorkspace, TerminalPane } from './components/terminal'
import { VirtualKeybar, VIRTUAL_KEYBAR_HEIGHT } from './components/mobile/VirtualKeybar'
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
import { MuxProvider, useMux } from './contexts/MuxContext'
import { FUSION_PIXEL_FONT, SILKSCREEN_FONT } from './lib/theme'
import { Icon } from '@iconify/react'
import { IconTerminal, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconX } from './lib/icons'
import type { Terminal } from '@xterm/xterm'
import type { TmuxSession, TmuxWindow } from './lib/types'
import { getWindows, createWindow, deleteWindow } from './lib/api'
import { setInitCommand, markWindowPending } from './lib/init-commands'

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

  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedWindow, setSelectedWindow] = useState<{ sessionName: string; windowIndex: number } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('sessions')
  const [windows, setWindows] = useState<Map<string, TmuxWindow[]>>(new Map())

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
  const { toasts, addToast, removeToast } = useToast()
  const mobileTerminalRef = useRef<Terminal | null>(null)
  const activeTerminalRef = useRef<Terminal | null>(null)

  // Enable image paste feature
  useImagePaste(activeTerminalRef)

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

  // Refresh windows list for all sessions
  const sessionsRef = useRef<TmuxSession[]>([])
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

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

  // Fallback polling (initial fetch + slow interval for resilience)
  useEffect(() => {
    const fetchWindows = async () => {
      const currentSessions = sessionsRef.current
      if (currentSessions.length === 0) return

      const newWindows = new Map<string, TmuxWindow[]>()
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

    // Initial fetch (WebSocket may not be connected yet)
    fetchWindows()

    // Slow fallback poll (WebSocket provides real-time updates)
    const interval = setInterval(fetchWindows, 10000)
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
      addToast(`Failed to create session "${name}"`, 'error')
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
        // Last window — delete the entire session
        await deleteSession(sessionName)
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        addToast(`Deleted session "${sessionName}"`, 'success')
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
      addToast(`Deleted window ${windowIndex}`, 'success')
    } catch (error: any) {
      if (error.error === 'last_window') {
        // Fallback: if backend returns last_window error, delete the session
        await deleteSession(sessionName)
        setWindows((prev) => {
          const next = new Map(prev)
          next.delete(sessionName)
          return next
        })
        addToast(`Deleted session "${sessionName}"`, 'success')
      } else {
        addToast(`Failed to delete window ${windowIndex}`, 'error')
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
      addToast(`Deleted session "${sessionName}"`, 'success')
    } catch {
      addToast(`Failed to delete session "${sessionName}"`, 'error')
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

    // Mobile: simple view switch
    if (isMobile) {
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
  }, [isMobile, selectWindow, switchSession, primarySession])

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
              <MobileNav activeView={mobileView} onViewChange={setMobileView} />
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
                    fontSize={Math.min(settings.fontSize, 12)}
                    focused
                    terminalRef={mobileTerminalRef}
                    mobileBottomOffset={VIRTUAL_KEYBAR_HEIGHT}
                  />
                </div>
              )}

              {/* Virtual keybar — fixed at bottom of visual viewport, stays above keyboard */}
              <VirtualKeybar terminalRef={mobileTerminalRef} onBack={handleMobileBack} />
            </div>
          )}
        </div>
      ) : (
        /* Desktop layout: sidebar + workspace */
        <div className="flex-1 flex overflow-hidden">
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
            isWindowInUse={isWindowInUse}
            isInSplitGroup={isInSplitGroup}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />

          {/* Workspace */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--color-bg)]">
            {selectedWindow || Object.keys(paneWindowMap).length > 0 ? (
              <div className="flex-1 flex flex-col min-h-0">
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
                    onDropWindow={handleDropWindow}
                    onSplitDrop={handleSplitDrop}
                    isWindowInUse={isWindowInUse}
                    activeTerminalRef={activeTerminalRef}
                    getAllTrackedWindowKeys={getAllTrackedWindowKeys}
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
        <MuxProvider>
          <AppContent />
        </MuxProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}

export default App
