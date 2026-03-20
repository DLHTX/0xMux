import { useState, useEffect, useMemo, useCallback } from 'react'
import type { GitBranch } from '../../lib/types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useI18n } from '../../hooks/useI18n'
import { loadJSON, saveJSON } from '../../lib/storage'

const COPY_PREFS_KEY = '0xmux-worktree-copy-prefs'

/** Generate a random short branch name like "wt-a3f9" */
function randomBranchName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `wt-${suffix}`
}

interface WorktreeCreateModalProps {
  open: boolean
  onClose: () => void
  branches: GitBranch[]
  currentBranch: string
  projectName: string
  untrackedFiles: string[]
  onSubmit: (baseBranch: string, newBranch: string, dirName: string, copyPaths: string[]) => void
  loading?: boolean
}

export function WorktreeCreateModal({
  open,
  onClose,
  branches,
  currentBranch,
  projectName,
  untrackedFiles,
  onSubmit,
  loading = false,
}: WorktreeCreateModalProps) {
  const { t } = useI18n()
  const [baseBranch, setBaseBranch] = useState(currentBranch)
  const [newBranch, setNewBranch] = useState('')
  const [dirName, setDirName] = useState('')
  const [dirManuallyEdited, setDirManuallyEdited] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Load saved copy preferences
  const loadSavedPrefs = useCallback((): Set<string> => {
    const saved = loadJSON<string[]>(COPY_PREFS_KEY)
    return saved ? new Set(saved) : new Set()
  }, [])

  // Reset form on open
  useEffect(() => {
    if (open) {
      const name = randomBranchName()
      setBaseBranch(currentBranch)
      setNewBranch(name)
      setDirName(`${projectName}-${name}`)
      setDirManuallyEdited(false)

      // Restore saved preferences, intersected with current untracked files
      const saved = loadSavedPrefs()
      const available = new Set(untrackedFiles)
      const restored = new Set<string>()
      for (const p of saved) {
        if (available.has(p)) restored.add(p)
      }
      setSelectedPaths(restored)
    }
  }, [open, currentBranch, projectName, untrackedFiles, loadSavedPrefs])

  // Auto-update dir name when branch name changes
  useEffect(() => {
    if (!dirManuallyEdited && newBranch) {
      const sanitized = newBranch.replace(/[/\\]/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
      setDirName(`${projectName}-${sanitized}`)
    }
  }, [newBranch, projectName, dirManuallyEdited])

  const localBranches = useMemo(() =>
    branches.filter((b) => !b.is_remote),
    [branches]
  )

  const togglePath = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(untrackedFiles))
  }, [untrackedFiles])

  const selectNone = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  const canSubmit = newBranch.trim().length > 0 && dirName.trim().length > 0 && !loading

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const copyPaths = [...selectedPaths]
    // Save preferences for next time
    saveJSON(COPY_PREFS_KEY, copyPaths)

    onSubmit(baseBranch, newBranch.trim(), dirName.trim(), copyPaths)
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 max-h-[80vh] overflow-hidden">
        <h3 className="text-sm font-black text-[var(--color-fg)]">{t('worktree.title')}</h3>

        {/* Base branch */}
        <div>
          <label className="text-[10px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1">
            {t('worktree.baseBranch')}
          </label>
          <select
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className="w-full bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1.5 border border-[var(--color-border-light)] outline-none"
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* New branch name */}
        <div>
          <label className="text-[10px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1">
            {t('worktree.newBranch')}
          </label>
          <input
            type="text"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            className="w-full bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1.5 border border-[var(--color-border-light)] outline-none"
          />
        </div>

        {/* Directory name */}
        <div>
          <label className="text-[10px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider block mb-1">
            {t('worktree.dirName')}
          </label>
          <input
            type="text"
            value={dirName}
            onChange={(e) => { setDirName(e.target.value); setDirManuallyEdited(true) }}
            className="w-full bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1.5 border border-[var(--color-border-light)] outline-none"
          />
          <span className="text-[9px] text-[var(--color-fg-muted)] mt-0.5 block">
            ../  {dirName || '...'}
          </span>
        </div>

        {/* Untracked files to copy */}
        {untrackedFiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider">
                {t('worktree.copyFiles')}
              </label>
              <div className="flex gap-2 text-[9px]">
                <button type="button" onClick={selectAll} className="text-[var(--color-primary)] hover:underline cursor-pointer">
                  {t('worktree.selectAll')}
                </button>
                <button type="button" onClick={selectNone} className="text-[var(--color-fg-muted)] hover:underline cursor-pointer">
                  {t('worktree.selectNone')}
                </button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto border border-[var(--color-border-light)] bg-[var(--color-bg-alt)] p-1">
              {untrackedFiles.map((path) => (
                <label
                  key={path}
                  className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-[var(--color-fg)] hover:bg-[var(--color-bg)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPaths.has(path)}
                    onChange={() => togglePath(path)}
                    className="shrink-0"
                  />
                  <span className="truncate font-mono">{path}</span>
                </label>
              ))}
            </div>
            <span className="text-[9px] text-[var(--color-fg-muted)] mt-0.5 block">
              {t('worktree.copyHint')}
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            {t('ctx.cancel')}
          </Button>
          <Button variant="primary" size="sm" disabled={!canSubmit} type="submit">
            {loading ? t('worktree.creating') : t('worktree.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
