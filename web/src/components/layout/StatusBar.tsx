import { Icon } from '@iconify/react'
import { IconGitBranch } from '../../lib/icons'
import type { ConnectionStatus } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface StatusBarProps {
  branch: string
  ahead: number
  behind: number
  changeCount: number
  isWorktree: boolean
  connectionStatus: ConnectionStatus
  onBranchClick: () => void
  onChangesClick: () => void
}

export function StatusBar({
  branch,
  ahead,
  behind,
  changeCount,
  isWorktree,
  connectionStatus,
  onBranchClick,
  onChangesClick,
}: StatusBarProps) {
  const { t } = useI18n()

  const statusColor: Record<ConnectionStatus, string> = {
    connected: 'var(--color-success)',
    connecting: 'var(--color-warning)',
    disconnected: 'var(--color-danger)',
  }

  return (
    <div
      className="shrink-0 flex items-center justify-between px-2 bg-[var(--color-bg)] border-t border-t-[var(--color-border-light)]/30 text-[10px] font-mono select-none"
      style={{ height: 24 }}
    >
      {/* Left: Git info */}
      <div className="flex items-center gap-3">
        {/* Branch name */}
        <button
          onClick={onBranchClick}
          className="flex items-center gap-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
          title={t('statusBar.switchBranch')}
        >
          <Icon icon={IconGitBranch} width={12} />
          <span className="font-bold">{branch}</span>
        </button>

        {/* Ahead/Behind */}
        {(ahead > 0 || behind > 0) && (
          <span className="text-[var(--color-fg-muted)]">
            {ahead > 0 && <span>↑{ahead}</span>}
            {behind > 0 && <span className={ahead > 0 ? 'ml-1' : ''}>↓{behind}</span>}
          </span>
        )}

        {/* Change count */}
        {changeCount > 0 && (
          <button
            onClick={onChangesClick}
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
          >
            {t('statusBar.changed', { n: changeCount })}
          </button>
        )}

        {/* Worktree indicator */}
        {isWorktree && (
          <span className="text-[var(--color-accent)] font-bold">
            {t('statusBar.worktree')}
          </span>
        )}
      </div>

      {/* Right: Connection status */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5"
          style={{ backgroundColor: statusColor[connectionStatus] }}
        />
        <span className="text-[var(--color-fg-muted)]">
          {connectionStatus}
        </span>
      </div>
    </div>
  )
}
