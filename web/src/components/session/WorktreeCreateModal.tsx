import { useState, useEffect, useMemo } from 'react'
import type { GitBranch } from '../../lib/types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useI18n } from '../../hooks/useI18n'

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
  onSubmit: (baseBranch: string, newBranch: string, dirName: string) => void
  loading?: boolean
}

export function WorktreeCreateModal({
  open,
  onClose,
  branches,
  currentBranch,
  projectName,
  onSubmit,
  loading = false,
}: WorktreeCreateModalProps) {
  const { t } = useI18n()
  const [baseBranch, setBaseBranch] = useState(currentBranch)
  const [newBranch, setNewBranch] = useState('')
  const [dirName, setDirName] = useState('')
  const [dirManuallyEdited, setDirManuallyEdited] = useState(false)

  // Reset form on open — auto-generate branch name
  useEffect(() => {
    if (open) {
      const name = randomBranchName()
      setBaseBranch(currentBranch)
      setNewBranch(name)
      setDirName(`${projectName}-${name}`)
      setDirManuallyEdited(false)
    }
  }, [open, currentBranch, projectName])

  // Auto-update dir name when branch name changes (unless manually edited)
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

  const canSubmit = newBranch.trim().length > 0 && dirName.trim().length > 0 && !loading

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSubmit) {
      onSubmit(baseBranch, newBranch.trim(), dirName.trim())
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
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

        {/* New branch name — pre-filled, editable */}
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

        {/* Directory name — auto-generated, editable */}
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

        {/* Submit — one click to create */}
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
