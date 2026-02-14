import { Icon } from '@iconify/react'
import { IconTrash } from '../../lib/icons'
import type { TmuxWindow } from '../../lib/types'
import { SPLIT_GROUP_COLOR } from '../../lib/session-utils'

interface WindowItemProps {
  sessionName: string
  window: TmuxWindow
  selected: boolean
  inUse?: boolean
  /** True when this window belongs to the current split group */
  inSplitGroup?: boolean
  onSelect: (sessionName: string, windowIndex: number) => void
  onDelete: (sessionName: string, windowIndex: number) => void
}

export function WindowItem({
  sessionName,
  window,
  selected,
  inSplitGroup,
  onSelect,
  onDelete,
}: WindowItemProps) {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(sessionName, window.index)
  }

  const handleDragStart = (e: React.DragEvent) => {
    // Set the window key for drag-and-drop onto workspace panes
    const windowKey = `${sessionName}:${window.index}`
    e.dataTransfer.setData('text/window-key', windowKey)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      onClick={() => onSelect(sessionName, window.index)}
      draggable
      onDragStart={handleDragStart}
      className={`
        group relative flex items-center gap-2.5 py-2 pl-9 pr-3 cursor-pointer transition-colors
        select-none
        ${selected ? 'bg-[var(--color-bg-alt)]' : 'hover:bg-[var(--color-bg-alt)]'}
      `}
      style={{
        borderLeft: inSplitGroup
          ? `3px solid ${SPLIT_GROUP_COLOR}`
          : selected
            ? '3px solid var(--color-primary)'
            : '3px solid transparent',
      }}
    >
      {/* Window index and name */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono truncate block">
          <span className="text-[var(--color-fg-muted)]">{window.index}:</span>{' '}
          <span className={selected ? 'font-bold' : ''}>{window.name}</span>
        </span>
      </div>


      {/* Delete button */}
      <button
        onClick={handleDeleteClick}
        onMouseDown={(e) => e.stopPropagation()}
        className="
          shrink-0 w-5 h-5 flex items-center justify-center transition-colors
          text-[var(--color-border-light)] hover:text-[var(--color-danger)]
        "
        title="Delete window"
      >
        <Icon icon={IconTrash} width={12} height={12} />
      </button>
    </div>
  )
}
