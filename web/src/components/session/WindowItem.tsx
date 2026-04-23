import { Icon } from '@iconify/react'
import { IconTrash } from '../../lib/icons'
import type { TmuxWindow } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface WindowItemProps {
  sessionName: string
  window: TmuxWindow
  selected: boolean
  inUse?: boolean
  /** True when this window belongs to the current split group */
  inSplitGroup?: boolean
  /** True when this is the last window in the split group (for └ vs ├) */
  isLastInSplitGroup?: boolean
  onSelect: (sessionName: string, windowIndex: number) => void
  onDelete: (sessionName: string, windowIndex: number) => void
  onHoverStart?: (sessionName: string, windowIndex: number) => void
  onHoverEnd?: () => void
}

export function WindowItem({
  sessionName,
  window,
  selected,
  inSplitGroup,
  isLastInSplitGroup,
  onSelect,
  onDelete,
  onHoverStart,
  onHoverEnd,
}: WindowItemProps) {
  const { t } = useI18n()
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(sessionName, window.index)
  }

  const handleDragStart = (e: React.DragEvent) => {
    const windowKey = `${sessionName}:${window.index}`
    e.dataTransfer.setData('text/window-key', windowKey)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      onClick={() => onSelect(sessionName, window.index)}
      onMouseEnter={() => onHoverStart?.(sessionName, window.index)}
      onMouseLeave={() => onHoverEnd?.()}
      draggable
      onDragStart={handleDragStart}
      className={`
        group relative flex items-center gap-1.5 py-2 pl-6 pr-3 cursor-pointer transition-colors
        select-none
        ${selected ? 'bg-[var(--color-bg-alt)]' : 'hover:bg-[var(--color-bg-alt)]'}
        ${'border-l-2 border-l-transparent'}
      `}
    >
      {/* Split group tree connector */}
      {inSplitGroup && (
        <span className="text-[var(--color-fg-faint)] text-[11px] font-mono shrink-0 w-4 text-center leading-none">
          {isLastInSplitGroup ? '└' : '├'}
        </span>
      )}

      {/* Window index and name */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-xs font-mono truncate">
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
        title={t('session.deleteWindow')}
      >
        <Icon icon={IconTrash} width={12} height={12} />
      </button>
    </div>
  )
}
