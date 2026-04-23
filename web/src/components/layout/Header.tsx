import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconPuzzle, IconSettings, IconBell, IconExternalLink, IconGitPullRequest } from '../../lib/icons'
import type { ConnectionStatus, CurrentPrResponse, CurrentPrStatus, Notification } from '../../lib/types'
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
  currentPr?: CurrentPrResponse | null
  currentPrLoading?: boolean
  onOpenCurrentPr?: (url: string) => void
}

interface CurrentPrCardProps {
  currentPr?: CurrentPrResponse | null
  currentPrLoading?: boolean
  onOpenCurrentPr?: (url: string) => void
}

function CurrentPrCard({
  currentPr,
  currentPrLoading = false,
  onOpenCurrentPr,
}: CurrentPrCardProps) {
  const { t } = useI18n()

  const statusLabels: Record<CurrentPrStatus, string> = {
    draft: t('header.prStatusDraft'),
    approved: t('header.prStatusApproved'),
    changes_requested: t('header.prStatusChangesRequested'),
    review_required: t('header.prStatusReviewRequired'),
    open: t('header.prStatusOpen'),
  }

  const statusClasses: Record<CurrentPrStatus, string> = {
    draft: 'border-[var(--color-warning)] text-[var(--color-warning)]',
    approved: 'border-[var(--color-success)] text-[var(--color-success)]',
    changes_requested: 'border-[var(--color-danger)] text-[var(--color-danger)]',
    review_required: 'border-[var(--color-primary)] text-[var(--color-primary)]',
    open: 'border-[var(--color-fg-muted)] text-[var(--color-fg-muted)]',
  }

  if (!currentPrLoading && !currentPr) return null

  const shellClass = `hidden md:flex items-center gap-2 px-2 h-8 border-[length:var(--border-w)] border-[var(--color-border)] min-w-[220px] max-w-[360px]`

  if (currentPrLoading) {
    return (
      <div className={shellClass}>
        <Icon icon={IconGitPullRequest} width={14} className="shrink-0 animate-pulse" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            {t('header.prLabel')}
          </div>
          <div className="truncate text-[11px] font-bold text-[var(--color-fg)]">
            {t('header.prChecking')}
          </div>
        </div>
      </div>
    )
  }

  if (!currentPr) return null

  if (currentPr.kind !== 'ready') {
    const label = currentPr.kind === 'no_pr'
      ? t('header.prNoPr')
      : currentPr.kind === 'gh_unavailable'
        ? t('header.prGhUnavailable')
        : t('header.prLookupFailed')
    const title = currentPr.kind === 'error'
      ? currentPr.message
      : currentPr.kind === 'gh_unavailable'
        ? currentPr.message ?? label
        : label

    return (
      <div className={shellClass} title={title}>
        <Icon icon={IconGitPullRequest} width={14} className="shrink-0 text-[var(--color-fg-muted)]" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            {t('header.prLabel')}
          </div>
          <div className="truncate text-[11px] font-bold text-[var(--color-fg-muted)]">
            {label}
          </div>
        </div>
      </div>
    )
  }

  const subtitle = `#${currentPr.number}${currentPr.extra_count > 0 ? ` +${currentPr.extra_count}` : ''}`

  return (
    <div className={shellClass} title={`#${currentPr.number} ${currentPr.title}`}>
      <Icon icon={IconGitPullRequest} width={14} className="shrink-0 text-[var(--color-primary)]" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          <span>{t('header.prLabel')}</span>
          <span>{subtitle}</span>
        </div>
        <div className="truncate text-[11px] font-bold text-[var(--color-fg)]">
          {currentPr.title}
        </div>
      </div>
      <span className={`hidden lg:inline-flex px-1 py-0.5 border-[length:var(--border-w)] text-[9px] font-bold uppercase tracking-[0.08em] ${statusClasses[currentPr.status]}`}>
        {statusLabels[currentPr.status]}
      </span>
      <button
        onClick={() => onOpenCurrentPr?.(currentPr.url)}
        className="shrink-0 h-6 px-2 flex items-center gap-1 border-[length:var(--border-w)] border-[var(--color-primary)] text-[var(--color-primary)] text-[10px] font-bold transition-colors cursor-pointer hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)]"
        aria-label={t('ctx.open')}
      >
        <Icon icon={IconExternalLink} width={12} height={12} />
        <span className="hidden lg:inline">{t('ctx.open')}</span>
      </button>
    </div>
  )
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
  currentPr,
  currentPrLoading = false,
  onOpenCurrentPr,
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
          <CurrentPrCard
            currentPr={currentPr}
            currentPrLoading={currentPrLoading}
            onOpenCurrentPr={onOpenCurrentPr}
          />

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
