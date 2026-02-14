import { Icon } from '@iconify/react'
import { IconTrash, IconCheck } from '../../lib/icons'
import { useI18n } from '../../hooks/useI18n'
import type { Notification } from '../../lib/types'

interface NotificationPanelProps {
  notifications: Notification[]
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onDismiss: (id: string) => void
  onImageClick: (url: string) => void
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function NotificationPanel({
  notifications,
  onMarkAllRead,
  onMarkRead,
  onDismiss,
  onImageClick,
}: NotificationPanelProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
        <span className="text-xs font-black uppercase tracking-wider">{t('activity.notifications')}</span>
        <button
          onClick={onMarkAllRead}
          className="text-[10px] font-bold text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-1"
        >
          <Icon icon={IconCheck} width={12} />
          {t('notification.markAllRead')}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-fg-muted)] text-xs">
            {t('notification.empty')}
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.read) onMarkRead(n.id)
                if (n.image_url) onImageClick(n.image_url)
              }}
              className={`
                relative flex gap-2.5 px-3 py-2.5 border-b border-[var(--color-border-light)]/50
                cursor-pointer transition-colors hover:bg-[var(--color-bg-alt)]
                min-h-[48px]
              `}
              style={{
                borderLeft: n.read
                  ? '3px solid transparent'
                  : '3px solid var(--color-primary)',
              }}
            >
              {/* Thumbnail */}
              {n.image_url && (
                <div
                  className="shrink-0 w-10 h-10 border-[length:var(--border-w)] border-[var(--color-border-light)] overflow-hidden bg-[var(--color-bg-alt)]"
                >
                  <img
                    src={n.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-xs truncate ${n.read ? 'font-bold' : 'font-black'}`}>
                    {n.title}
                  </span>
                  <span className="text-[10px] text-[var(--color-fg-muted)] shrink-0 tabular-nums">
                    {timeAgo(n.timestamp)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-fg-muted)] truncate mt-0.5">
                  {n.message}
                </p>

              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDismiss(n.id)
                }}
                className="shrink-0 self-center w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors"
              >
                <Icon icon={IconTrash} width={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
