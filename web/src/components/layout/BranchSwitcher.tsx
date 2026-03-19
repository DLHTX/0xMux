import { useState, useEffect, useRef, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { IconSearch, IconGitBranch, IconPlus } from '../../lib/icons'
import type { GitBranch } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface BranchSwitcherProps {
  open: boolean
  onClose: () => void
  branches: GitBranch[]
  currentBranch: string
  onCheckout: (branch: string) => void
  onNewWorktree: () => void
  loading?: boolean
}

export function BranchSwitcher({
  open,
  onClose,
  branches,
  currentBranch,
  onCheckout,
  onNewWorktree,
  loading = false,
}: BranchSwitcherProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on open
  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return branches.filter((b) => b.name.toLowerCase().includes(q))
  }, [branches, search])

  const localBranches = filtered.filter((b) => !b.is_remote)
  const remoteBranches = filtered.filter((b) => b.is_remote)

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-72 max-h-80 bg-[var(--color-bg)] border border-[var(--color-border-light)] shadow-lg z-50 flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border-light)]/30">
        <Icon icon={IconSearch} width={12} className="text-[var(--color-fg-muted)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('branch.search')}
          className="flex-1 bg-transparent text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
        />
      </div>

      {/* Branch lists */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--color-fg-muted)]">
            {t('branch.switching')}
          </div>
        ) : (
          <>
            {/* Local branches */}
            {localBranches.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[9px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider">
                  {t('branch.local')}
                </div>
                {localBranches.map((b) => {
                  const isCurrent = b.name === currentBranch
                  return (
                    <button
                      key={b.name}
                      onClick={() => { if (!isCurrent) onCheckout(b.name) }}
                      disabled={isCurrent}
                      className={`w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 transition-colors
                        ${isCurrent
                          ? 'text-[var(--color-primary)] font-bold'
                          : 'text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)] cursor-pointer'
                        }`}
                    >
                      <Icon icon={IconGitBranch} width={12} className="shrink-0" />
                      <span className="truncate flex-1">{b.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] text-[var(--color-primary)]">{t('branch.current')}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Remote branches */}
            {remoteBranches.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[9px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider mt-1">
                  {t('branch.remote')}
                </div>
                {remoteBranches.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => onCheckout(b.name)}
                    className="w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
                  >
                    <Icon icon={IconGitBranch} width={12} className="shrink-0" />
                    <span className="truncate flex-1">{b.name}</span>
                  </button>
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[var(--color-fg-muted)]">
                No branches found
              </div>
            )}
          </>
        )}
      </div>

      {/* New Worktree button */}
      <div className="border-t border-[var(--color-border-light)]/30">
        <button
          onClick={() => { onClose(); onNewWorktree() }}
          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
        >
          <Icon icon={IconPlus} width={12} />
          <span className="font-bold">{t('branch.newWorktree')}</span>
        </button>
      </div>
    </div>
  )
}
