import { Icon } from '@iconify/react'
import { IconChevronRight, IconTrash, IconPlus, IconGitBranch } from '../../lib/icons'
import type { TmuxSession, TmuxWindow } from '../../lib/types'
import { WindowItem } from './WindowItem'
import { useI18n } from '../../hooks/useI18n'

interface SessionFolderProps {
  session: TmuxSession
  windows: TmuxWindow[]
  selectedWindow: { sessionName: string; windowIndex: number } | null
  isSelected: boolean
  onSelectSession: (sessionName: string) => void
  onSelectWindow: (sessionName: string, windowIndex: number) => void
  onCreateWindow: (sessionName: string) => void
  onCreateWorktree?: (sessionName: string) => void
  onDeleteWindow: (sessionName: string, windowIndex: number) => void
  onDeleteSession: (sessionName: string) => void
  isWindowInUse?: (sessionName: string, windowIndex: number) => boolean
  isInSplitGroup?: (sessionName: string, windowIndex: number) => boolean
  collapsed: boolean
  onToggle: () => void
}

export function SessionFolder({
  session,
  windows,
  selectedWindow,
  isSelected,
  onSelectSession,
  onSelectWindow,
  onCreateWindow,
  onCreateWorktree,
  onDeleteWindow,
  onDeleteSession,
  isWindowInUse,
  isInSplitGroup,
  collapsed,
  onToggle,
}: SessionFolderProps) {
  const { t } = useI18n()

  const handleHeaderClick = () => {
    if (!isSelected) {
      // Switch to this session's workspace + auto-expand
      onSelectSession(session.name)
      if (collapsed) onToggle()
    } else {
      // Already selected — just toggle expand/collapse
      onToggle()
    }
  }

  const handleDeleteSession = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteSession(session.name)
  }

  const handleCreateWindow = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCreateWindow(session.name)
  }

  return (
    <div className="select-none">
      {/* Session folder header */}
      <div
        onClick={handleHeaderClick}
        className={`
          group relative flex items-center gap-2.5 py-2.5 px-3 cursor-pointer transition-colors
          hover:bg-[var(--color-bg-alt)]
          ${isSelected ? 'bg-[var(--color-bg-alt)]' : ''}
        `}
        style={{
          borderLeft: isSelected ? '3px solid var(--color-primary)' : '3px solid transparent',
        }}
      >
        {/* Chevron icon */}
        <Icon
          icon={IconChevronRight}
          width={12}
          height={12}
          className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />

        {/* Status dot — simple green/gray for attached state */}
        <div
          className={`w-2 h-2 shrink-0 ${
            session.attached
              ? 'bg-[var(--color-success)]'
              : 'bg-[var(--color-border-light)]'
          }`}
          style={{
            animation: session.attached ? 'breathe 2s ease-in-out infinite' : undefined,
          }}
        />

        {/* Session name */}
        <div className="flex-1 min-w-0">
          <span className={`text-xs truncate block ${isSelected ? 'font-black' : 'font-bold'}`}>{session.name}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0">
          <button
            onClick={handleCreateWindow}
            onMouseDown={(e) => e.stopPropagation()}
            className="shrink-0 w-5 h-5 flex items-center justify-center transition-colors text-[var(--color-fg-muted)] hover:text-[var(--color-success)]"
            title={t('session.createWindow')}
          >
            <Icon icon={IconPlus} width={12} height={12} />
          </button>
          {onCreateWorktree && (
            <button
              onClick={(e) => { e.stopPropagation(); onCreateWorktree(session.name) }}
              onMouseDown={(e) => e.stopPropagation()}
              className="shrink-0 w-5 h-5 flex items-center justify-center transition-colors text-[var(--color-fg-muted)] hover:text-[var(--color-accent)]"
              title={t('branch.newWorktree')}
            >
              <Icon icon={IconGitBranch} width={12} height={12} />
            </button>
          )}
          <button
            onClick={handleDeleteSession}
            onMouseDown={(e) => e.stopPropagation()}
            className="shrink-0 w-5 h-5 flex items-center justify-center transition-colors text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
            title={t('session.deleteSession')}
          >
            <Icon icon={IconTrash} width={12} height={12} />
          </button>
        </div>

        {/* Breathing animation */}
        <style>{`
          @keyframes breathe {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>

      {/* Windows list */}
      {!collapsed && (
        <div>
          {windows.map((window) => (
            <WindowItem
              key={window.index}
              sessionName={session.name}
              window={window}
              selected={
                selectedWindow?.sessionName === session.name &&
                selectedWindow?.windowIndex === window.index
              }
              inUse={isWindowInUse?.(session.name, window.index) ?? false}
              inSplitGroup={isInSplitGroup?.(session.name, window.index) ?? false}
              onSelect={onSelectWindow}
              onDelete={onDeleteWindow}
            />
          ))}
        </div>
      )}
    </div>
  )
}
