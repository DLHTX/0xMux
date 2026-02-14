import { Icon } from '@iconify/react'
import { IconLayoutGrid, IconTerminal, IconBell } from '../../lib/icons'

export type MobileView = 'sessions' | 'terminal' | 'notifications'

interface MobileNavProps {
  activeView: MobileView
  onViewChange: (view: MobileView) => void
  unreadCount?: number
}

export function MobileNav({ activeView, onViewChange, unreadCount = 0 }: MobileNavProps) {
  const items: { view: MobileView; icon: typeof IconLayoutGrid; label: string }[] = [
    { view: 'sessions', icon: IconLayoutGrid, label: 'Sessions' },
    { view: 'terminal', icon: IconTerminal, label: 'Terminal' },
    { view: 'notifications', icon: IconBell, label: 'Alerts' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-[var(--color-bg)] border-t-[length:var(--border-w)] border-[var(--color-border-light)] flex items-center justify-around z-40">
      {items.map((item) => (
        <button
          key={item.view}
          onClick={() => onViewChange(item.view)}
          className={`relative flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
            activeView === item.view
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-fg-muted)]'
          }`}
        >
          <Icon icon={item.icon} width={20} />
          <span className="text-[10px] font-bold">{item.label}</span>
          {/* Square unread badge */}
          {item.view === 'notifications' && unreadCount > 0 && (
            <span
              className="absolute -top-0.5 right-1 min-w-[14px] h-[14px] flex items-center justify-center
                bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[9px] font-black leading-none px-0.5"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
