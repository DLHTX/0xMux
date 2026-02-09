import { useState, useEffect, useRef, useCallback } from 'react'
import { Header, EmptyState, MobileNav, type MobileView } from './components/layout'
import { SessionSidebar, CreateSessionModal } from './components/session'
import { SplitWorkspace, TerminalPane } from './components/terminal'
import { SetupWizard } from './components/setup'
import { ToastContainer } from './components/ui/Toast'
import { useSessions } from './hooks/useSessions'
import { useDeps } from './hooks/useDeps'
import { useSplitLayout } from './hooks/useSplitLayout'
import { useSettings } from './hooks/useSettings'
import { useMobile } from './hooks/useMobile'
import { useToast } from './hooks/useToast'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { I18nProvider, useI18n } from './hooks/useI18n'
import { FUSION_PIXEL_FONT, SILKSCREEN_FONT } from './lib/theme'
import { Icon } from '@iconify/react'
import { IconTerminal, IconChevronLeft } from './lib/icons'

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
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('sessions')

  const { settings } = useSettings()
  const {
    layout,
    splitPane,
    closePane,
    getPaneIds,
    paneCount,
    canSplit,
    paneSessionMap,
    assignSession,
  } = useSplitLayout()
  const [activePaneId, setActivePaneId] = useState<string | null>(() => getPaneIds()[0] ?? null)
  const isMobile = useMobile()
  const { toasts, addToast, removeToast } = useToast()

  const needsSetup = deps && !allReady

  // Auto-select first session if none selected and sessions exist
  useEffect(() => {
    if (selectedSession && sessions.some((s) => s.name === selectedSession)) return
    if (sessions.length > 0) {
      setSelectedSession(sessions[0].name)
    } else {
      setSelectedSession(null)
    }
  }, [sessions, selectedSession])

  // Ensure the initial pane is registered in paneSessionMap
  useEffect(() => {
    if (!selectedSession) return
    const paneIds = getPaneIds()
    for (const id of paneIds) {
      if (!paneSessionMap[id]) {
        assignSession(id, selectedSession)
        break
      }
    }
  }, [selectedSession, getPaneIds, paneSessionMap, assignSession])

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
  }, [isMobile, activePaneId, canSplit, splitPane, closePane, getPaneIds])

  const handleCreate = async (name: string, startDirectory?: string) => {
    try {
      const session = await createSession(name, startDirectory)
      setSelectedSession(session.name)
      // Assign to active pane
      const paneIds = getPaneIds()
      if (activePaneId && paneIds.includes(activePaneId)) {
        assignSession(activePaneId, session.name)
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
      if (selectedSession === oldName) {
        setSelectedSession(newName)
      }
    } catch {
      addToast(`Failed to rename session "${oldName}"`, 'error')
    }
  }

  const handleLogoClick = () => {
    setSelectedSession(null)
  }

  /** Check if a session is already open in any pane */
  const isSessionInUse = useCallback(
    (sessionName: string): boolean => {
      return Object.values(paneSessionMap).includes(sessionName)
    },
    [paneSessionMap]
  )

  const handleSelectSession = useCallback((name: string) => {
    setSelectedSession(name)
    // Assign session to active pane (desktop)
    if (!isMobile && activePaneId) {
      // 如果该 session 已经在另一个窗格中打开，不重复分配
      const currentPaneSession = paneSessionMap[activePaneId]
      if (currentPaneSession === name) return // 已经是当前 session
      if (isSessionInUse(name)) {
        addToast(`Session "${name}" 已在其他窗格中打开`, 'error')
        return
      }
      assignSession(activePaneId, name)
    }
    if (isMobile) setMobileView('terminal')
  }, [isMobile, activePaneId, assignSession, paneSessionMap, isSessionInUse, addToast])

  const handleMobileBack = useCallback(() => {
    setMobileView('sessions')
  }, [])

  /** Handle drag-and-drop of a session from sidebar onto a pane edge (split) */
  const handleDropSession = useCallback(
    async (paneId: string, direction: import('./lib/types').SplitDirection, sessionName: string) => {
      if (isSessionInUse(sessionName)) {
        addToast(`Session "${sessionName}" 已在其他窗格中打开`, 'error')
        return
      }
      const newPaneId = await splitPane(paneId, direction)
      if (newPaneId) {
        // Override the auto-created session — assign the dragged session instead
        assignSession(newPaneId, sessionName)
      }
    },
    [splitPane, assignSession, isSessionInUse, addToast]
  )

  /** Handle drag-and-drop of a session to center of a pane (replace) */
  const handleReplaceSession = useCallback(
    (paneId: string, sessionName: string) => {
      if (isSessionInUse(sessionName)) {
        addToast(`Session "${sessionName}" 已在其他窗格中打开`, 'error')
        return
      }
      assignSession(paneId, sessionName)
      setSelectedSession(sessionName)
    },
    [assignSession, isSessionInUse, addToast]
  )

  if (depsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="animate-pulse text-sm text-[var(--color-fg-muted)]">
          {t('app.initializing')}
        </span>
      </div>
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
              {sessions.map((s) => (
                <div
                  key={s.name}
                  onClick={() => handleSelectSession(s.name)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b-[length:var(--border-w)] border-[var(--color-border-light)]
                    ${selectedSession === s.name ? 'bg-[var(--color-bg-alt)]' : 'hover:bg-[var(--color-bg-alt)]'}
                    min-h-[56px] transition-colors`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.attached ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border-light)]'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold truncate block">{s.name}</span>
                    <span className="text-[10px] text-[var(--color-fg-muted)]">{s.windows} windows</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
                <button onClick={handleMobileBack} className="p-1 text-[var(--color-fg-muted)]">
                  <Icon icon={IconChevronLeft} width={18} />
                </button>
                <span className="text-xs font-bold truncate">{selectedSession}</span>
              </div>
              {selectedSession && (
                <div className="flex-1 min-h-0">
                  <TerminalPane
                    sessionName={selectedSession}
                    fontSize={settings.fontSize}
                    focused
                  />
                </div>
              )}
            </div>
          )}
          <MobileNav activeView={mobileView} onViewChange={setMobileView} />
        </div>
      ) : (
        /* Desktop layout: sidebar + workspace */
        <div className="flex-1 flex overflow-hidden">
          <SessionSidebar
            sessions={sessions}
            selectedSession={selectedSession}
            onSelect={handleSelectSession}
            onCreate={() => setShowCreate(true)}
            onDelete={handleDelete}
            onRename={handleRename}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />

          {/* Workspace */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--color-bg)]">
            {selectedSession ? (
              <div className="flex-1 min-h-0">
                  <SplitWorkspace
                    layout={layout}
                    sessionName={selectedSession}
                    fontSize={settings.fontSize}
                    canSplit={canSplit}
                    activePaneId={activePaneId}
                    paneCount={paneCount}
                    onSplit={splitPane}
                    onClose={closePane}
                    onPaneFocus={setActivePaneId}
                    paneSessionMap={paneSessionMap}
                    onDropSession={handleDropSession}
                    onReplaceSession={handleReplaceSession}
                    isSessionInUse={isSessionInUse}
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

      {/* Settings panel is now integrated in Header via ThemeConfigurator */}

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

declare const __APP_VERSION__: string

export default App
