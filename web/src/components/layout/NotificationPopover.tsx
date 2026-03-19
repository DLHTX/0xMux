import { useEffect, useRef } from 'react'
import { NotificationPanel } from '../sidebar/NotificationPanel'
import type { Notification } from '../../lib/types'

interface NotificationPopoverProps {
  open: boolean
  onClose: () => void
  notifications: Notification[]
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onDismiss: (id: string) => void
  onImageClick?: (url: string) => void
}

export function NotificationPopover({
  open,
  onClose,
  notifications,
  onMarkAllRead,
  onMarkRead,
  onDismiss,
  onImageClick,
}: NotificationPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the button click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 w-80 max-h-96 bg-[var(--color-bg)] border border-[var(--color-border-light)] shadow-lg z-50 flex flex-col overflow-hidden"
    >
      <NotificationPanel
        notifications={notifications}
        onMarkAllRead={onMarkAllRead}
        onMarkRead={onMarkRead}
        onDismiss={onDismiss}
        onImageClick={onImageClick}
      />
    </div>
  )
}
