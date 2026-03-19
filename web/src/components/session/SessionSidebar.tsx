import { useState } from 'react'
import { Icon } from '@iconify/react'
import {
  IconPlus,
  IconSearch,
} from '../../lib/icons'
import { SessionFolder } from './SessionFolder'
import type { TmuxSession, TmuxWindow } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface SessionSidebarProps {
  sessions: TmuxSession[]
  windows: Map<string, TmuxWindow[]>
  selectedWindow: { sessionName: string; windowIndex: number } | null
  selectedSession: string | null
  onSelectSession: (sessionName: string) => void
  onSelectWindow: (sessionName: string, windowIndex: number) => void
  onCreateSession: () => void
  onCreateWindow: (sessionName: string) => void
  onDeleteWindow: (sessionName: string, windowIndex: number) => void
  onDeleteSession: (sessionName: string) => void
  onCreateWorktree?: (sessionName: string) => void
  isWindowInUse?: (sessionName: string, windowIndex: number) => boolean
  isInSplitGroup?: (sessionName: string, windowIndex: number) => boolean
  collapsed: boolean
}

export function SessionSidebar({
  sessions,
  windows,
  selectedWindow,
  selectedSession,
  onSelectSession,
  onSelectWindow,
  onCreateSession,
  onCreateWindow,
  onDeleteWindow,
  onDeleteSession,
  onCreateWorktree,
  isWindowInUse,
  isInSplitGroup,
  collapsed,
}: SessionSidebarProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(sessions.map((s) => s.name))
  )

  const filtered = sessions.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSession = (sessionName: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionName)) {
        next.delete(sessionName)
      } else {
        next.add(sessionName)
      }
      return next
    })
  }

  return (
    <aside
      className="flex flex-col bg-[var(--color-bg)] shrink-0 overflow-hidden"
      style={{
        width: collapsed ? 48 : '100%',
        transition: 'width 200ms ease',
      }}
    >
      {/* Top: search + create button */}
      {!collapsed && (
        <div className="p-2 flex items-center gap-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 border border-[var(--color-border-light)] rounded-[var(--radius)]
            focus-within:border-[var(--color-primary)] transition-colors">
            <Icon icon={IconSearch} width={12} height={12} className="text-[var(--color-fg-muted)] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('session.search')}
              className="flex-1 bg-transparent outline-none text-xs placeholder:text-[var(--color-fg-faint)] min-w-0"
            />
          </div>
          <button
            onClick={onCreateSession}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-primary)]
              text-[var(--color-primary)] rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)]"
            title={t('session.newSession')}
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Collapsed: just a + button */}
      {collapsed && (
        <div className="p-1.5 flex justify-center border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <button
            onClick={onCreateSession}
            className="w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
              rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
            title={t('session.newSession')}
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Session folders list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((session) => (
              <SessionFolder
                key={session.name}
                session={session}
                windows={windows.get(session.name) || []}
                selectedWindow={selectedWindow}
                isSelected={selectedSession === session.name}
                onSelectSession={onSelectSession}
                onSelectWindow={onSelectWindow}
                onCreateWindow={onCreateWindow}
                onCreateWorktree={onCreateWorktree}
                onDeleteWindow={onDeleteWindow}
                onDeleteSession={onDeleteSession}
                isWindowInUse={isWindowInUse}
                isInSplitGroup={isInSplitGroup}
                collapsed={!expandedSessions.has(session.name)}
                onToggle={() => toggleSession(session.name)}
              />
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-[var(--color-fg-faint)]">
                {search ? t('session.noMatch') : t('session.noSessions')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed: minimal session indicators */}
      {collapsed && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-2">
          {sessions.map((session) => {
            const isSelected = selectedSession === session.name
            return (
              <button
                key={session.name}
                onClick={() => onSelectSession(session.name)}
                className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold rounded-[var(--radius)]
                  transition-colors cursor-pointer
                  ${isSelected
                    ? 'bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border)]'
                    : 'border-[length:var(--border-w)] border-transparent hover:bg-[var(--color-bg-alt)]'
                  }
                `}
                title={session.name}
              >
                {session.name.charAt(0).toUpperCase()}
              </button>
            )
          })}
        </div>
      )}

    </aside>
  )
}
