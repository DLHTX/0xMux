import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { IconGitBranch, IconRefreshCw, IconChevronDown, IconChevronRight } from '../../lib/icons'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useState } from 'react'
import type { GitChangedFile, WorkspaceContext } from '../../lib/types'
import { getGitStatusBadge, getGitStatusColor } from '../../lib/gitDecorations'

interface GitPanelProps {
  onOpenDiff: (path: string, staged: boolean) => void
  workspace?: WorkspaceContext
}

function FileItem({ file, onOpen }: { file: GitChangedFile; onOpen: () => void }) {
  const filename = file.path.split('/').pop() ?? file.path
  const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-3 py-0.5 flex items-center gap-1.5 hover:bg-[var(--color-bg-alt)] transition-colors text-xs group"
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
  )
}

function CollapsibleSection({ title, count, children, defaultOpen = true }: {
  title: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (count === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1 text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] transition-colors"
      >
        <Icon icon={open ? IconChevronDown : IconChevronRight} width={12} />
        <span className="flex-1 text-left">{title}</span>
        <span className="text-[var(--color-fg-muted)] text-[10px] tabular-nums">{count}</span>
      </button>
      {open && children}
    </div>
  )
}

export function GitPanel({ onOpenDiff, workspace }: GitPanelProps) {
  const { status, commits, branches, loading, error, refresh } = useGitStatus(workspace)
  const [showCommits, setShowCommits] = useState(false)
  const [showBranches, setShowBranches] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh, workspace?.session, workspace?.window])

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

      {/* File changes */}
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection title="Staged Changes" count={staged.length}>
          {staged.map(f => (
            <FileItem key={`s-${f.path}`} file={f} onOpen={() => onOpenDiff(f.path, true)} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Changes" count={unstaged.length}>
          {unstaged.map(f => (
            <FileItem key={`u-${f.path}`} file={f} onOpen={() => onOpenDiff(f.path, false)} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Untracked" count={untracked.length}>
          {untracked.map(f => (
            <FileItem key={`t-${f.path}`} file={f} onOpen={() => onOpenDiff(f.path, false)} />
          ))}
        </CollapsibleSection>

        {/* Commits */}
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
