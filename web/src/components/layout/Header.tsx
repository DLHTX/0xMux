import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconPuzzle, IconSettings, IconBell } from '../../lib/icons'
import type { ConnectionStatus, Notification } from '../../lib/types'
import { ThemeConfigurator } from '../settings/ThemeConfigurator'
import { NotificationPopover } from './NotificationPopover'
import { Logo } from './Logo'
import { useI18n } from '../../hooks/useI18n'

interface HeaderProps {
  connectionStatus: ConnectionStatus
  onSettingsClick?: () => void
  onPluginClick?: () => void
  showPluginButton?: boolean
  onLogoClick?: () => void
  unreadCount?: number
  showNotifications?: boolean
  onToggleNotifications?: () => void
  notifications?: Notification[]
  onMarkAllRead?: () => void
  onMarkRead?: (id: string) => void
  onDismissNotification?: (id: string) => void
  onImageClick?: (url: string) => void
}

export function Header({
  connectionStatus,
  onSettingsClick,
  onPluginClick,
  showPluginButton = false,
  onLogoClick,
  unreadCount = 0,
  showNotifications = false,
  onToggleNotifications,
  notifications = [],
  onMarkAllRead,
  onMarkRead,
  onDismissNotification,
  onImageClick,
}: HeaderProps) {
  const { t } = useI18n()
  const [showConfig, setShowConfig] = useState(false)

  const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string }> = {
    connected: { dotClass: 'bg-[var(--color-success)]', label: t('header.connected') },
    connecting: { dotClass: 'bg-[var(--color-warning)]', label: t('header.connecting') },
    disconnected: { dotClass: 'bg-[var(--color-danger)]', label: t('header.offline') },
  }

  const status = statusConfig[connectionStatus]

  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick()
    } else {
      setShowConfig(true)
    }
  }

  return (
    <>
      <header
        className="flex items-center justify-between px-3 md:px-4 border-b-[length:var(--border-w)] border-b-[var(--color-border-light)] bg-[var(--color-bg)] shrink-0 h-10 md:h-12"
      >
        {/* Left: Logo + dev build number */}
        <div className="flex items-center gap-2">
          <Logo onClick={onLogoClick} className="hidden md:block" />
          {/* Dev build indicator — remove before release */}
          {/*<span className="text-[9px] text-[var(--color-fg-muted)] font-mono opacity-50">dev</span>*/}
        </div>

        {/* Right: status + notifications + plugins + settings */}
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 ${status.dotClass}`} />
            <span className="text-[10px] font-bold text-[var(--color-fg-muted)]">
              {status.label}
            </span>
          </div>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={onToggleNotifications}
              className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
                rounded-[var(--radius)] transition-colors cursor-pointer
                hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
              aria-label={t('activity.notifications')}
            >
              <Icon icon={IconBell} width={16} height={16} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center
                    bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[9px] font-black leading-none px-0.5"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <NotificationPopover
              open={showNotifications}
              onClose={() => onToggleNotifications?.()}
              notifications={notifications}
              onMarkAllRead={onMarkAllRead ?? (() => {})}
              onMarkRead={onMarkRead ?? (() => {})}
              onDismiss={onDismissNotification ?? (() => {})}
              onImageClick={onImageClick}
            />
          </div>

          {showPluginButton && (
            <button
              onClick={onPluginClick}
              className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
                rounded-[var(--radius)] transition-colors cursor-pointer
                hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
              aria-label={t('header.plugins')}
            >
              <Icon icon={IconPuzzle} width={16} height={16} />
            </button>
          )}

          {/* Settings button */}
          <button
            onClick={handleSettingsClick}
            className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
              rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
            aria-label={t('header.settings')}
          >
            <Icon icon={IconSettings} width={16} height={16} />
          </button>
        </div>
      </header>

      <ThemeConfigurator open={showConfig} onClose={() => setShowConfig(false)} />
    </>
  )
}
