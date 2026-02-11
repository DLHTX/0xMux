import { Icon } from '@iconify/react'
import { IconChevronRight, IconTrash, IconPlus } from '../../lib/icons'
import type { TmuxSession, TmuxWindow } from '../../lib/types'
import { extractProjectName, getProjectColor } from '../../hooks/useSplitLayout'
import { WindowItem } from './WindowItem'

interface SessionFolderProps {
  session: TmuxSession
  windows: TmuxWindow[]
  selectedWindow: { sessionName: string; windowIndex: number } | null
  onSelectWindow: (sessionName: string, windowIndex: number) => void
  onCreateWindow: (sessionName: string) => void
  onDeleteWindow: (sessionName: string, windowIndex: number) => void
  onDeleteSession: (sessionName: string) => void
  collapsed: boolean
  onToggle: () => void
}

export function SessionFolder({
  session,
  windows,
  selectedWindow,
  onSelectWindow,
  onCreateWindow,
  onDeleteWindow,
  onDeleteSession,
  collapsed,
  onToggle,
}: SessionFolderProps) {
  const projectName = extractProjectName(session.name)
  const projectColor = getProjectColor(projectName)

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
        onClick={onToggle}
        className={`
          group relative flex items-center gap-2.5 py-2.5 px-3 cursor-pointer transition-colors
          border-l-[length:var(--border-w)]
          hover:bg-[var(--color-bg-alt)]
        `}
        style={{
          borderLeftColor: session.attached ? projectColor : 'var(--color-border-light)',
        }}
      >
        {/* Chevron icon */}
        <Icon
          icon={IconChevronRight}
          width={12}
          height={12}
          className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />

        {/* Status dot */}
        <div
          className="w-2.5 h-2.5 shrink-0 rounded-[var(--radius)]"
          style={{
            background: session.attached ? projectColor : 'var(--color-border-light)',
            animation: session.attached ? 'breathe 2s ease-in-out infinite' : undefined,
          }}
        />

        {/* Session name */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold truncate block">{session.name}</span>
        </div>

        {/* Window count */}
        <span className="text-[10px] text-[var(--color-fg-muted)] tabular-nums shrink-0">
          {windows.length}w
        </span>

        {/* Create window button */}
        <button
          onClick={handleCreateWindow}
          onMouseDown={(e) => e.stopPropagation()}
          className="
            shrink-0 w-5 h-5 flex items-center justify-center transition-all
            opacity-0 group-hover:opacity-100
            text-[var(--color-fg-muted)] hover:text-[var(--color-success)]
          "
          title="Create new window"
        >
          <Icon icon={IconPlus} width={12} height={12} />
        </button>

        {/* Delete session button */}
        <button
          onClick={handleDeleteSession}
          onMouseDown={(e) => e.stopPropagation()}
          className="
            shrink-0 w-5 h-5 flex items-center justify-center transition-all text-[10px]
            opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]
          "
          title="Delete session"
        >
          <Icon icon={IconTrash} width={12} height={12} />
        </button>

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
              onSelect={onSelectWindow}
              onDelete={onDeleteWindow}
            />
          ))}
        </div>
      )}
    </div>
  )
}
