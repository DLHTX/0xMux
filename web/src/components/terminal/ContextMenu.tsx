import { useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import type { IconifyIcon } from '@iconify/react'

interface ContextMenuItem {
  label: string
  icon?: IconifyIcon
  disabled?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
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
      className="bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] py-1 min-w-[160px] shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            if (!item.disabled) {
              item.onClick()
              onClose()
            }
          }}
          disabled={item.disabled}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
            hover:bg-[var(--color-bg-alt)] disabled:opacity-30 disabled:cursor-not-allowed
            transition-colors"
        >
          {item.icon && <Icon icon={item.icon} width={14} />}
          {item.label}
        </button>
      ))}
    </div>
  )
}
