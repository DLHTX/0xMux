import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { IconGitBranch, IconRefreshCw, IconChevronDown, IconChevronRight, IconCheck, IconArrowUp, IconPlus, IconMinus, IconUndo } from '../../lib/icons'
import type { ToastItem } from '../../hooks/useToast'
import { useGitStatus } from '../../hooks/useGitStatus'
import { gitCommit, gitPush, gitStage, gitUnstage, gitUnstageAll, gitCheckout, gitDiscard } from '../../lib/api'
import type { GitChangedFile, WorkspaceContext } from '../../lib/types'
import { getGitStatusBadge, getGitStatusColor } from '../../lib/gitDecorations'
import { getErrorMessage } from '../../lib/error'
import { useI18n } from '../../hooks/useI18n'

interface GitPanelProps {
  onOpenDiff: (path: string, staged: boolean) => void
  workspace?: WorkspaceContext
  addToast: (message: string, type: ToastItem['type']) => void
  onChangeCount?: (count: number) => void
}

function FileItem({ file, onOpen, action, actionIcon, actionTitle, secondaryAction, secondaryIcon, secondaryTitle }: {
  file: GitChangedFile
  onOpen: () => void
  action: () => void
  actionIcon: typeof IconPlus
  actionTitle: string
  secondaryAction?: () => void
  secondaryIcon?: typeof IconPlus
  secondaryTitle?: string
}) {
  const filename = file.path.split('/').pop() ?? file.path
  const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  return (
    <div className="w-full flex items-center hover:bg-[var(--color-bg-alt)] transition-colors text-xs group">
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left px-3 py-0.5 flex items-center gap-1.5"
      >
        <span
          className="shrink-0 w-4 text-center font-bold text-[10px]"
          style={{ color: getGitStatusColor(file.status) }}
        >
          {getGitStatusBadge(file.status)}
        </span>
        <span className="truncate text-[var(--color-fg)]">{filename}</span>
        {dir && <span className="truncate text-[var(--color-fg-muted)] text-[10px]">{dir}</span>}
      </button>
      {/* Line change stats */}
      {(file.additions != null || file.deletions != null) && (
        <div className="shrink-0 flex items-center gap-0.5 mr-1 text-[10px] font-mono tabular-nums">
          {file.additions != null && file.additions > 0 && (
            <span className="text-[var(--color-success)]">+{file.additions}</span>
          )}
          {file.deletions != null && file.deletions > 0 && (
            <span className="text-[var(--color-danger)]">-{file.deletions}</span>
          )}
        </div>
      )}
      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity mr-1">
        {secondaryAction && secondaryIcon && (
          <button
            onClick={e => { e.stopPropagation(); secondaryAction() }}
            className="shrink-0 w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
            title={secondaryTitle}
          >
            <Icon icon={secondaryIcon} width={12} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); action() }}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          title={actionTitle}
        >
          <Icon icon={actionIcon} width={12} />
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, open, onToggle, actions }: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="w-full flex items-center px-2 py-1 text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors group">
      <button onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-1 text-left">
        <Icon icon={open ? IconChevronDown : IconChevronRight} width={12} />
        <span className="flex-1 text-left">{title}</span>
        <span className="text-[var(--color-fg-muted)] text-[10px] tabular-nums font-normal">{count}</span>
      </button>
      {actions && (
        <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  )
}

export function GitPanel({ onOpenDiff, workspace, addToast, onChangeCount }: GitPanelProps) {
  const { status, commits, branches, loading, error, refresh } = useGitStatus(workspace)
  const { t } = useI18n()
  const [showCommits, setShowCommits] = useState(false)
  const [showBranches, setShowBranches] = useState(false)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [untrackedOpen, setUntrackedOpen] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const hasStagedChanges = status ? status.files.some(f => f.staged) : false
  const hasUnpushedCommits = status ? status.ahead > 0 : false

  async function handleStage(paths: string[]) {
    setActionError(null)
    try { await gitStage(paths, workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, t('git.stageFailed'))) }
  }

  async function handleUnstage(paths: string[]) {
    setActionError(null)
    try { await gitUnstage(paths, workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, t('git.unstageFailed'))) }
  }

  async function handleUnstageAll() {
    setActionError(null)
    try { await gitUnstageAll(workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, t('git.unstageAllFailed'))) }
  }

  async function handleDiscard(paths: string[]) {
    setActionError(null)
    try { await gitDiscard(paths, workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, t('git.discardFailed'))) }
  }

  async function handleCheckout(branch: string) {
    setCheckingOut(branch)
    setActionError(null)
    try {
      await gitCheckout(branch, workspace)
      addToast(t('git.switchedTo', { branch }), 'success')
      refresh()
    } catch (e) {
      const msg = getErrorMessage(e, 'Checkout failed')
      setActionError(msg)
      addToast(t('git.checkoutFailed', { msg }), 'error')
    } finally { setCheckingOut(null) }
  }

  async function handleCommit() {
    if (!commitMsg.trim() || !hasStagedChanges) return
    setCommitting(true)
    setActionError(null)
    try {
      const result = await gitCommit(commitMsg.trim(), workspace)
      setCommitMsg('')
      addToast(t('git.committed', { hash: result.short_hash }), 'success')
      refresh()
    } catch (e) {
      const msg = getErrorMessage(e, 'Commit failed')
      setActionError(msg)
      addToast(t('git.commitFailed', { msg }), 'error')
    } finally { setCommitting(false) }
  }

  async function handlePush() {
    setPushing(true)
    setActionError(null)
    try {
      await gitPush(workspace)
      addToast(t('git.pushCompleted'), 'success')
      refresh()
    } catch (e) {
      const msg = getErrorMessage(e, 'Push failed')
      setActionError(msg)
      addToast(t('git.pushFailed', { msg }), 'error')
    } finally { setPushing(false) }
  }

  useEffect(() => {
    refresh()
  }, [refresh, workspace?.session, workspace?.window])

  // Report change count to parent for badge
  useEffect(() => {
    onChangeCount?.(status?.files.length ?? 0)
  }, [status, onChangeCount])

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 p-4">
        <Icon icon={IconGitBranch} width={24} className="text-[var(--color-fg-muted)]" />
        <span className="text-xs text-[var(--color-fg-muted)] text-center">{error}</span>
        <button
          onClick={refresh}
          className="text-xs text-[var(--color-primary)] font-bold hover:underline"
        >
          {t('git.retry')}
        </button>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-[var(--color-fg-muted)] animate-pulse">{t('git.loading')}</span>
      </div>
    )
  }

  if (!status) return null

  const staged = status.files.filter(f => f.staged)
  const unstaged = status.files.filter(f => !f.staged && f.status !== 'untracked')
  const untracked = status.files.filter(f => f.status === 'untracked')

  return (
    <div className="flex flex-col h-full">
      {/* Branch header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0">
        <Icon icon={IconGitBranch} width={14} className="text-[var(--color-primary)]" />
        <span className="text-xs font-bold truncate flex-1">{status.branch}</span>
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="text-[10px] text-[var(--color-fg-muted)] tabular-nums">
            {status.ahead > 0 && `+${status.ahead}`}
            {status.ahead > 0 && status.behind > 0 && ' '}
            {status.behind > 0 && `-${status.behind}`}
          </span>
        )}
        <button
          onClick={refresh}
          className={`shrink-0 w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors ${loading ? 'animate-spin' : ''}`}
          title={t('git.refresh')}
        >
          <Icon icon={IconRefreshCw} width={12} />
        </button>
      </div>

      {/* Commit input + action buttons */}
      <div className="px-2 py-1.5 border-b-[length:var(--border-w)] border-[var(--color-border-light)] shrink-0 flex flex-col gap-1">
        <input
          type="text"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit() }}
          placeholder={t('git.commitPlaceholder')}
          className="w-full text-xs px-1.5 py-1 bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-[var(--color-primary)]"
          disabled={committing}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || !hasStagedChanges || committing}
            className="flex-1 h-6 flex items-center justify-center gap-1 text-xs font-bold bg-[var(--color-primary)] text-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title={!hasStagedChanges ? t('git.noStagedChanges') : t('git.commitHint')}
          >
            {committing
              ? <Icon icon={IconRefreshCw} width={12} className="animate-spin" />
              : <Icon icon={IconCheck} width={12} />
            }
            <span>{committing ? t('git.committing') : t('git.commit')}</span>
          </button>
          {hasUnpushedCommits && (
            <button
              onClick={handlePush}
              disabled={pushing}
              className="flex-1 h-6 flex items-center justify-center gap-1 text-xs font-bold bg-[var(--color-bg-alt)] text-[var(--color-fg)] border-[length:var(--border-w)] border-[var(--color-border)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] transition-all disabled:opacity-40"
              title={t('git.pushHint', { n: status.ahead })}
            >
              {pushing
                ? <Icon icon={IconRefreshCw} width={12} className="animate-spin" />
                : <Icon icon={IconArrowUp} width={12} />
              }
              <span>{pushing ? t('git.pushing') : t('git.push', { n: status.ahead })}</span>
            </button>
          )}
        </div>
        {actionError && (
          <div className="text-[10px] text-[var(--color-danger)] px-0.5 break-all">{actionError}</div>
        )}
      </div>

      {/* File changes */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged Changes */}
        {staged.length > 0 && (
          <div>
            <SectionHeader
              title={t('git.staged')}
              count={staged.length}
              open={stagedOpen}
              onToggle={() => setStagedOpen(!stagedOpen)}
              actions={
                <button
                  onClick={handleUnstageAll}
                  className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  title={t('git.unstageAll')}
                >
                  <Icon icon={IconMinus} width={12} />
                </button>
              }
            />
            {stagedOpen && staged.map(f => (
              <FileItem
                key={`s-${f.path}`}
                file={f}
                onOpen={() => onOpenDiff(f.path, true)}
                action={() => handleUnstage([f.path])}
                actionIcon={IconMinus}
                actionTitle={t('git.unstage')}
              />
            ))}
          </div>
        )}

        {/* Changes (unstaged) */}
        {unstaged.length > 0 && (
          <div>
            <SectionHeader
              title={t('git.unstaged')}
              count={unstaged.length}
              open={changesOpen}
              onToggle={() => setChangesOpen(!changesOpen)}
              actions={
                <>
                  <button
                    onClick={() => handleDiscard(unstaged.map(f => f.path))}
                    className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
                    title={t('git.discardAll')}
                  >
                    <Icon icon={IconUndo} width={12} />
                  </button>
                  <button
                    onClick={() => handleStage(unstaged.map(f => f.path))}
                    className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                    title={t('git.stageAll')}
                  >
                    <Icon icon={IconPlus} width={12} />
                  </button>
                </>
              }
            />
            {changesOpen && unstaged.map(f => (
              <FileItem
                key={`u-${f.path}`}
                file={f}
                onOpen={() => onOpenDiff(f.path, false)}
                action={() => handleStage([f.path])}
                actionIcon={IconPlus}
                actionTitle={t('git.stage')}
                secondaryAction={() => handleDiscard([f.path])}
                secondaryIcon={IconUndo}
                secondaryTitle={t('git.discard')}
              />
            ))}
          </div>
        )}

        {/* Untracked */}
        {untracked.length > 0 && (
          <div>
            <SectionHeader
              title={t('git.untracked')}
              count={untracked.length}
              open={untrackedOpen}
              onToggle={() => setUntrackedOpen(!untrackedOpen)}
              actions={
                <>
                  <button
                    onClick={() => handleDiscard(untracked.map(f => f.path))}
                    className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
                    title={t('git.discardAllUntracked')}
                  >
                    <Icon icon={IconUndo} width={12} />
                  </button>
                  <button
                    onClick={() => handleStage(untracked.map(f => f.path))}
                    className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                    title={t('git.stageAllUntracked')}
                  >
                    <Icon icon={IconPlus} width={12} />
                  </button>
                </>
              }
            />
            {untrackedOpen && untracked.map(f => (
              <FileItem
                key={`t-${f.path}`}
                file={f}
                onOpen={() => onOpenDiff(f.path, false)}
                action={() => handleStage([f.path])}
                actionIcon={IconPlus}
                actionTitle={t('git.stage')}
                secondaryAction={() => handleDiscard([f.path])}
                secondaryIcon={IconUndo}
                secondaryTitle={t('git.discard')}
              />
            ))}
          </div>
        )}

        {/* Recent Commits */}
        <div className="border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
          <button
            onClick={() => setShowCommits(!showCommits)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors"
          >
            <Icon icon={showCommits ? IconChevronDown : IconChevronRight} width={12} />
            <span className="flex-1 text-left">{t('git.commits')}</span>
            <span className="text-[var(--color-fg-muted)] text-[10px] tabular-nums">{commits.length}</span>
          </button>
          {showCommits && commits.map(c => (
            <div key={c.hash} className="px-3 py-0.5 text-xs flex items-baseline gap-1.5">
              <span className="text-[var(--color-primary)] font-mono shrink-0">{c.short_hash}</span>
              <span className="truncate text-[var(--color-fg)]">{c.message}</span>
            </div>
          ))}
        </div>

        {/* Branches */}
        <div className="border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
          <button
            onClick={() => setShowBranches(!showBranches)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors"
          >
            <Icon icon={showBranches ? IconChevronDown : IconChevronRight} width={12} />
            <span className="flex-1 text-left">{t('git.branches')}</span>
            <span className="text-[var(--color-fg-muted)] text-[10px] tabular-nums">{branches.length}</span>
          </button>
          {showBranches && branches.map(b => (
            <div key={b.name} className="px-3 py-0.5 text-xs flex items-center gap-1.5">
              {b.is_current && <span className="text-[var(--color-primary)]">*</span>}
              {b.is_current ? (
                <span className="truncate font-bold text-[var(--color-fg)]">{b.name}</span>
              ) : (
                <button
                  onClick={() => handleCheckout(b.name)}
                  disabled={checkingOut !== null}
                  className="truncate text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] hover:underline disabled:opacity-40 text-left"
                >
                  {checkingOut === b.name ? t('git.switching') : b.name}
                </button>
              )}
              <span className="text-[10px] text-[var(--color-fg-muted)] font-mono">{b.short_hash}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
