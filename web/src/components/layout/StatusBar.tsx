import { Icon } from '@iconify/react'
import { IconGitBranch, IconFolder } from '../../lib/icons'
import type { ConnectionStatus, WorktreeInfo } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface StatusBarProps {
  branch: string
  ahead: number
  behind: number
  changeCount: number
  isWorktree: boolean
  worktrees: WorktreeInfo[]
  connectionStatus: ConnectionStatus
  onBranchClick: () => void
  onChangesClick: () => void
  onWorktreeListClick: () => void
}

export function StatusBar({
  branch,
  ahead,
  behind,
  changeCount,
  isWorktree,
  worktrees,
  connectionStatus,
  onBranchClick,
  onChangesClick,
  onWorktreeListClick,
}: StatusBarProps) {
  const { t } = useI18n()

  const statusColor: Record<ConnectionStatus, string> = {
    connected: 'var(--color-success)',
    connecting: 'var(--color-warning)',
    disconnected: 'var(--color-danger)',
  }

  // Count non-main worktrees
  const worktreeCount = worktrees.filter(w => !w.is_main).length

  return (
    <div
      className="shrink-0 flex items-center justify-between px-2 bg-[var(--color-bg)] border-t border-t-[var(--color-border-light)]/30 text-[10px] font-mono select-none"
      style={{ height: 24 }}
    >
      {/* Left: Git info */}
      <div className="flex items-center gap-0">
        {/* Branch name */}
        <button
          onClick={onBranchClick}
          className="flex items-center gap-1 px-1.5 h-full text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
          title={t('statusBar.switchBranch')}
        >
          <Icon icon={IconGitBranch} width={12} />
          <span className="font-bold">{branch}</span>
        </button>

        {/* Ahead/Behind */}
        {(ahead > 0 || behind > 0) && (
          <span className="px-1.5 text-[var(--color-fg-muted)]">
            {ahead > 0 && <span>↑{ahead}</span>}
            {behind > 0 && <span className={ahead > 0 ? 'ml-0.5' : ''}>↓{behind}</span>}
          </span>
        )}

        {/* Separator */}
        <span className="text-[var(--color-border-light)]/50 mx-0.5">│</span>

        {/* Change count */}
        <button
          onClick={onChangesClick}
          className="px-1.5 h-full text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
        >
          {changeCount > 0 ? (
            <span>
              <span className="text-[var(--color-warning)]">{changeCount}</span> {t('statusBar.changed', { n: '' }).trim()}
            </span>
          ) : (
            <span>{t('statusBar.noChanges')}</span>
          )}
        </button>

        {/* Separator */}
        <span className="text-[var(--color-border-light)]/50 mx-0.5">│</span>

        {/* Worktree info */}
        <button
          onClick={onWorktreeListClick}
          className="flex items-center gap-1 px-1.5 h-full text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
          title={t('statusBar.worktreeList')}
        >
          <Icon icon={IconFolder} width={11} />
          {worktreeCount > 0 ? (
            <span>
              worktrees: <span className="text-[var(--color-accent)]">{worktreeCount}</span>
            </span>
          ) : (
            <span>worktree</span>
          )}
        </button>

        {/* Current is worktree indicator */}
        {isWorktree && (
          <>
            <span className="text-[var(--color-border-light)]/50 mx-0.5">│</span>
            <span className="px-1.5 text-[var(--color-accent)] font-bold">
              {t('statusBar.inWorktree')}
            </span>
          </>
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
