import { Icon } from '@iconify/react'
import {
  IconTerminal,
  IconFolder,
  IconSearch,
  IconGitBranch,
} from '../../lib/icons'
import type { ActivityView } from '../../lib/types'

interface ActivityBarProps {
  activeView: ActivityView | null
  onViewChange: (view: ActivityView) => void
}

const items: { view: ActivityView; icon: typeof IconTerminal; label: string }[] = [
  { view: 'sessions', icon: IconTerminal, label: 'Sessions' },
  { view: 'files', icon: IconFolder, label: 'Files' },
  { view: 'search', icon: IconSearch, label: 'Search' },
  { view: 'git', icon: IconGitBranch, label: 'Git' },
]

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <aside
      className="flex flex-col items-center shrink-0 bg-[var(--color-bg)] border-r-[length:var(--border-w)] border-[var(--color-border)]"
      style={{ width: 48 }}
    >
      <nav className="flex flex-col w-full flex-1">
        {items.map(({ view, icon, label }) => {
          const isActive = activeView === view
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
              title={label}
            >
              {/* Left border indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[var(--border-w)] h-6 bg-[var(--color-primary)]"
                  style={{ minWidth: 2 }}
                />
              )}
              <Icon icon={icon} width={20} height={20} />
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
