import { useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import type { IconifyIcon } from '@iconify/react'

export interface ContextMenuItem {
  label: string
  icon?: IconifyIcon
  disabled?: boolean
  onClick: () => void
}

export type ContextMenuEntry = ContextMenuItem | { separator: true }

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

function isSeparator(entry: ContextMenuEntry): entry is { separator: true } {
  return 'separator' in entry
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 100,
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] py-1 min-w-[180px] shadow-lg"
    >
      {items.map((entry, i) => {
        if (isSeparator(entry)) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 border-t-[length:var(--border-w)] border-[var(--color-border-light)]"
            />
          )
        }
        return (
          <button
            key={entry.label}
            onClick={() => {
              if (!entry.disabled) {
                entry.onClick()
                onClose()
              }
            }}
            disabled={entry.disabled}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
              hover:bg-[var(--color-bg-alt)] disabled:opacity-30 disabled:cursor-not-allowed
              transition-colors cursor-pointer"
          >
            {entry.icon && <Icon icon={entry.icon} width={14} />}
            {entry.label}
          </button>
        )
      })}
    </div>
  )
}
