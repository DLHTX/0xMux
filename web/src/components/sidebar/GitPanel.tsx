import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { IconGitBranch, IconRefreshCw, IconChevronDown, IconChevronRight, IconCheck, IconArrowUp, IconPlus, IconMinus } from '../../lib/icons'
import type { ToastItem } from '../../hooks/useToast'
import { useGitStatus } from '../../hooks/useGitStatus'
import { gitCommit, gitPush, gitStage, gitUnstage, gitStageAll, gitUnstageAll } from '../../lib/api'
import type { GitChangedFile, WorkspaceContext } from '../../lib/types'
import { getGitStatusBadge, getGitStatusColor } from '../../lib/gitDecorations'
import { getErrorMessage } from '../../lib/error'

interface GitPanelProps {
  onOpenDiff: (path: string, staged: boolean) => void
  workspace?: WorkspaceContext
  addToast: (message: string, type: ToastItem['type']) => void
  onChangeCount?: (count: number) => void
}

function FileItem({ file, onOpen, action, actionIcon, actionTitle }: {
  file: GitChangedFile
  onOpen: () => void
  action: () => void
  actionIcon: typeof IconPlus
  actionTitle: string
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
      <button
        onClick={e => { e.stopPropagation(); action() }}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] opacity-0 group-hover:opacity-100 transition-opacity mr-1"
        title={actionTitle}
      >
        <Icon icon={actionIcon} width={12} />
      </button>
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
  const [showCommits, setShowCommits] = useState(false)
  const [showBranches, setShowBranches] = useState(false)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [untrackedOpen, setUntrackedOpen] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const hasStagedChanges = status ? status.files.some(f => f.staged) : false
  const hasUnpushedCommits = status ? status.ahead > 0 : false

  async function handleStage(paths: string[]) {
    setActionError(null)
    try { await gitStage(paths, workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, 'Stage failed')) }
  }

  async function handleUnstage(paths: string[]) {
    setActionError(null)
    try { await gitUnstage(paths, workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, 'Unstage failed')) }
  }

  async function handleStageAll() {
    setActionError(null)
    try { await gitStageAll(workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, 'Stage all failed')) }
  }

  async function handleUnstageAll() {
    setActionError(null)
    try { await gitUnstageAll(workspace); refresh() } catch (e) { setActionError(getErrorMessage(e, 'Unstage all failed')) }
  }

  async function handleCommit() {
    if (!commitMsg.trim() || !hasStagedChanges) return
    setCommitting(true)
    setActionError(null)
    try {
      const result = await gitCommit(commitMsg.trim(), workspace)
      setCommitMsg('')
      addToast(`Committed ${result.short_hash}`, 'success')
      refresh()
    } catch (e) {
      const msg = getErrorMessage(e, 'Commit failed')
      setActionError(msg)
      addToast(`Commit failed: ${msg}`, 'error')
    } finally { setCommitting(false) }
  }

  async function handlePush() {
    setPushing(true)
    setActionError(null)
    try {
      await gitPush(workspace)
      addToast('Push completed', 'success')
      refresh()
    } catch (e) {
      const msg = getErrorMessage(e, 'Push failed')
      setActionError(msg)
      addToast(`Push failed: ${msg}`, 'error')
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
          Retry
        </button>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-[var(--color-fg-muted)] animate-pulse">Loading...</span>
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
          title="Refresh"
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
          placeholder="Commit message"
          className="w-full text-xs px-1.5 py-1 bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-[var(--color-primary)]"
          disabled={committing}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || !hasStagedChanges || committing}
            className="flex-1 h-6 flex items-center justify-center gap-1 text-xs font-bold bg-[var(--color-primary)] text-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title={!hasStagedChanges ? 'No staged changes' : 'Commit (Enter)'}
          >
            {committing
              ? <Icon icon={IconRefreshCw} width={12} className="animate-spin" />
              : <Icon icon={IconCheck} width={12} />
            }
            <span>{committing ? 'Committing...' : 'Commit'}</span>
          </button>
          {hasUnpushedCommits && (
            <button
              onClick={handlePush}
              disabled={pushing}
              className="flex-1 h-6 flex items-center justify-center gap-1 text-xs font-bold bg-[var(--color-bg-alt)] text-[var(--color-fg)] border-[length:var(--border-w)] border-[var(--color-border)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] transition-all disabled:opacity-40"
              title={`Push ${status.ahead} commit(s) to remote`}
            >
              {pushing
                ? <Icon icon={IconRefreshCw} width={12} className="animate-spin" />
                : <Icon icon={IconArrowUp} width={12} />
              }
              <span>{pushing ? 'Pushing...' : `Push ${status.ahead}`}</span>
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
              title="Staged Changes"
              count={staged.length}
              open={stagedOpen}
              onToggle={() => setStagedOpen(!stagedOpen)}
              actions={
                <button
                  onClick={handleUnstageAll}
                  className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  title="Unstage All"
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
                actionTitle="Unstage"
              />
            ))}
          </div>
        )}

        {/* Changes (unstaged) */}
        {unstaged.length > 0 && (
          <div>
            <SectionHeader
              title="Changes"
              count={unstaged.length}
              open={changesOpen}
              onToggle={() => setChangesOpen(!changesOpen)}
              actions={
                <button
                  onClick={() => handleStage(unstaged.map(f => f.path))}
                  className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  title="Stage All Changes"
                >
                  <Icon icon={IconPlus} width={12} />
                </button>
              }
            />
            {changesOpen && unstaged.map(f => (
              <FileItem
                key={`u-${f.path}`}
                file={f}
                onOpen={() => onOpenDiff(f.path, false)}
                action={() => handleStage([f.path])}
                actionIcon={IconPlus}
                actionTitle="Stage"
              />
            ))}
          </div>
        )}

        {/* Untracked */}
        {untracked.length > 0 && (
          <div>
            <SectionHeader
              title="Untracked"
              count={untracked.length}
              open={untrackedOpen}
              onToggle={() => setUntrackedOpen(!untrackedOpen)}
              actions={
                <button
                  onClick={() => handleStage(untracked.map(f => f.path))}
                  className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  title="Stage All Untracked"
                >
                  <Icon icon={IconPlus} width={12} />
                </button>
              }
            />
            {untrackedOpen && untracked.map(f => (
              <FileItem
                key={`t-${f.path}`}
                file={f}
                onOpen={() => onOpenDiff(f.path, false)}
                action={() => handleStage([f.path])}
                actionIcon={IconPlus}
                actionTitle="Stage"
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
            <span className="flex-1 text-left">Recent Commits</span>
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
            <span className="flex-1 text-left">Branches</span>
            <span className="text-[var(--color-fg-muted)] text-[10px] tabular-nums">{branches.length}</span>
          </button>
          {showBranches && branches.map(b => (
            <div key={b.name} className="px-3 py-0.5 text-xs flex items-center gap-1.5">
              {b.is_current && <span className="text-[var(--color-primary)]">*</span>}
              <span className={`truncate ${b.is_current ? 'font-bold text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}`}>
                {b.name}
              </span>
              <span className="text-[10px] text-[var(--color-fg-muted)] font-mono">{b.short_hash}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
