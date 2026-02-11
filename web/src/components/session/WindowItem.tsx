import { Icon } from '@iconify/react'
import { IconTrash } from '../../lib/icons'
import type { TmuxWindow } from '../../lib/types'

interface WindowItemProps {
  sessionName: string
  window: TmuxWindow
  selected: boolean
  onSelect: (sessionName: string, windowIndex: number) => void
  onDelete: (sessionName: string, windowIndex: number) => void
}

export function WindowItem({
  sessionName,
  window,
  selected,
  onSelect,
  onDelete,
}: WindowItemProps) {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(sessionName, window.index)
  }

  return (
    <div
      onClick={() => onSelect(sessionName, window.index)}
      className={`
        group relative flex items-center gap-2.5 py-2 pl-9 pr-3 cursor-pointer transition-colors
        border-l-[length:var(--border-w)] select-none
        ${selected
          ? 'bg-[var(--color-bg-alt)] border-l-[var(--color-primary)]'
          : 'border-l-transparent hover:bg-[var(--color-bg-alt)]'
        }
      `}
    >
      {/* Window index and name */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono truncate block">
          <span className="text-[var(--color-fg-muted)]">{window.index}:</span>{' '}
          <span className={selected ? 'font-bold' : ''}>{window.name}</span>
        </span>
      </div>

      {/* Active indicator */}
      {window.active && (
        <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
      )}

      {/* Delete button */}
      <button
        onClick={handleDeleteClick}
        onMouseDown={(e) => e.stopPropagation()}
        className="
          shrink-0 w-5 h-5 flex items-center justify-center transition-all text-[10px]
          opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]
        "
        title="Delete window"
      >
        <Icon icon={IconTrash} width={12} height={12} />
      </button>
    </div>
  )
}
