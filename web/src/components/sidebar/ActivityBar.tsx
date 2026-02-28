import { Icon } from '@iconify/react'
import {
  IconTerminal,
  IconFolder,
  IconSearch,
  IconGitBranch,
  IconBell,
} from '../../lib/icons'
import type { ActivityView } from '../../lib/types'
import type { MessageKey } from '../../lib/i18n'
import { useI18n } from '../../hooks/useI18n'

interface ActivityBarProps {
  activeView: ActivityView | null
  onViewChange: (view: ActivityView) => void
  unreadCount?: number
  gitChangeCount?: number
}

const items: { view: ActivityView; icon: typeof IconTerminal; labelKey: MessageKey }[] = [
  { view: 'sessions', icon: IconTerminal, labelKey: 'activity.sessions' },
  { view: 'files', icon: IconFolder, labelKey: 'activity.files' },
  { view: 'search', icon: IconSearch, labelKey: 'activity.search' },
  { view: 'git', icon: IconGitBranch, labelKey: 'activity.git' },
  { view: 'notifications', icon: IconBell, labelKey: 'activity.notifications' },
]

export function ActivityBar({ activeView, onViewChange, unreadCount = 0, gitChangeCount = 0 }: ActivityBarProps) {
  const { t } = useI18n()
  return (
    <aside
      className="flex flex-col items-center shrink-0 bg-[var(--color-bg)] border-r border-r-[var(--color-border-light)]/10"
      style={{ width: 48 }}
    >
      <nav className="flex flex-col w-full flex-1">
        {items.map(({ view, icon, labelKey }) => {
          const isActive = activeView === view
          const showBadge = (view === 'notifications' && unreadCount > 0) || (view === 'git' && gitChangeCount > 0)
          const badgeCount = view === 'git' ? gitChangeCount : unreadCount
          return (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`
                relative w-full h-12 flex items-center justify-center
                transition-colors cursor-pointer
                ${isActive
                  ? 'text-[var(--color-fg)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)]'
                }
              `}
              title={t(labelKey)}
            >
              {/* Left border indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[var(--border-w)] h-6 bg-[var(--color-primary)]"
                  style={{ minWidth: 2 }}
                />
              )}
              <Icon icon={icon} width={20} height={20} />
              {/* Badge */}
              {showBadge && (
                <span
                  className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] flex items-center justify-center
                    bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[9px] font-black leading-none px-0.5"
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
