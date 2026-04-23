import { useState, useEffect, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { IconChevronRight, IconChevronDown, IconFolder, IconFile } from '../../lib/icons'
import type { GitBranch } from '../../lib/types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useI18n } from '../../hooks/useI18n'
import { loadJSON, saveJSON } from '../../lib/storage'

const LINK_PREFS_KEY = '0xmux-worktree-copy-prefs'

function randomBranchName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `wt-${suffix}`
}

// ── Tree node structure ──

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }

  for (const p of paths) {
    const isDir = p.endsWith('/')
    const clean = p.replace(/\/$/, '')
    const parts = clean.split('/')

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const partPath = parts.slice(0, i + 1).join('/')

      let child = current.children.find(c => c.name === part)
      if (!child) {
        child = {
          name: part,
          path: isLast ? (isDir ? partPath + '/' : partPath) : partPath + '/',
          isDir: isLast ? isDir : true,
          children: [],
        }
        current.children.push(child)
      }
      current = child
    }
  }

  // Sort: dirs first, then alphabetical
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortChildren)
  }
  sortChildren(root)

  return root.children
}

/** Get all leaf paths under a tree node */
function getAllPaths(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.path]
  return node.children.flatMap(getAllPaths)
}

// ── Tree row component ──

function TreeRow({
  node,
  depth,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: {
  node: TreeNode
  depth: number
  selected: Set<string>
  expanded: Set<string>
  onToggleSelect: (node: TreeNode) => void
  onToggleExpand: (path: string) => void
}) {
  const allPaths = useMemo(() => getAllPaths(node), [node])
  const allSelected = allPaths.every(p => selected.has(p))
  const someSelected = !allSelected && allPaths.some(p => selected.has(p))
  const isExpanded = expanded.has(node.path)

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-1 hover:bg-[var(--color-bg)] cursor-pointer text-xs"
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => onToggleSelect(node)}
      >
        {/* Expand/collapse for dirs */}
        {node.isDir && node.children.length > 0 ? (
          <span
            className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-[var(--color-fg-muted)]"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.path) }}
          >
            <Icon icon={isExpanded ? IconChevronDown : IconChevronRight} width={10} />
          </span>
        ) : (
          <span className="shrink-0 w-3.5" />
        )}

        {/* Checkbox — styled as a small box */}
        <span
          className={`shrink-0 w-4 h-4 border flex items-center justify-center text-[10px] font-bold
            ${allSelected
              ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-primary-fg)]'
              : someSelected
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/30 text-[var(--color-primary)]'
                : 'border-[var(--color-border-light)] text-transparent'
            }`}
        >
          {allSelected ? '✓' : someSelected ? '–' : ''}
        </span>

        {/* Icon */}
        <Icon
          icon={node.isDir ? IconFolder : IconFile}
          width={12}
          className={`shrink-0 ${node.isDir ? 'text-[var(--color-accent)]' : 'text-[var(--color-fg-muted)]'}`}
        />

        {/* Name */}
        <span className="truncate text-[var(--color-fg)]">{node.name}</span>
      </div>

      {/* Children */}
      {node.isDir && isExpanded && node.children.map(child => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          expanded={expanded}
          onToggleSelect={onToggleSelect}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  )
}

// ── Modal ──

interface WorktreeCreateModalProps {
  open: boolean
  onClose: () => void
  branches: GitBranch[]
  currentBranch: string
  projectName: string
  untrackedFiles: string[]
  onSubmit: (baseBranch: string, newBranch: string, dirName: string, linkPaths: string[]) => void
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
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(untrackedFiles), [untrackedFiles])

  // All leaf paths for select all/none
  const allLeafPaths = useMemo(() => tree.flatMap(getAllPaths), [tree])

  useEffect(() => {
    if (open) {
      const name = randomBranchName()
      setBaseBranch(currentBranch)
      setNewBranch(name)
      setDirName(`${projectName}-${name}`)
      setDirManuallyEdited(false)

      // Restore saved preferences
      const saved = loadJSON<string[]>(LINK_PREFS_KEY)
      const available = new Set(untrackedFiles)
      const restored = new Set<string>()
      if (saved) {
        for (const p of saved) {
          if (available.has(p)) restored.add(p)
        }
      }
      setSelectedPaths(restored)

      // Auto-expand top-level dirs
      setExpandedDirs(new Set(tree.filter(n => n.isDir).map(n => n.path)))
    }
  }, [open, currentBranch, projectName, untrackedFiles, tree])

  useEffect(() => {
    if (!dirManuallyEdited && newBranch) {
      const sanitized = newBranch.replace(/[/\\]/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
      setDirName(`${projectName}-${sanitized}`)
    }
  }, [newBranch, projectName, dirManuallyEdited])

  const localBranches = useMemo(() => branches.filter(b => !b.is_remote), [branches])

  const toggleSelect = useCallback((node: TreeNode) => {
    const paths = getAllPaths(node)
    setSelectedPaths(prev => {
      const next = new Set(prev)
      const allSelected = paths.every(p => next.has(p))
      if (allSelected) {
        paths.forEach(p => next.delete(p))
      } else {
        paths.forEach(p => next.add(p))
      }
      return next
    })
  }, [])

  const toggleExpand = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelectedPaths(new Set(allLeafPaths)), [allLeafPaths])
  const selectNone = useCallback(() => setSelectedPaths(new Set()), [])

  const canSubmit = newBranch.trim().length > 0 && dirName.trim().length > 0 && !loading

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const linkPaths = [...selectedPaths]
    saveJSON(LINK_PREFS_KEY, linkPaths)
    onSubmit(baseBranch, newBranch.trim(), dirName.trim(), linkPaths)
  }

  const selectedCount = selectedPaths.size

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
          <span className="text-[9px] text-[var(--color-fg-muted)] mt-0.5 block">../ {dirName || '...'}</span>
        </div>

        {/* Untracked files tree */}
        {untrackedFiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider">
                {t('worktree.copyFiles')} {selectedCount > 0 && `(${selectedCount})`}
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
            <div className="max-h-40 overflow-y-auto border border-[var(--color-border-light)] bg-[var(--color-bg-alt)] py-1">
              {tree.map(node => (
                <TreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  selected={selectedPaths}
                  expanded={expandedDirs}
                  onToggleSelect={toggleSelect}
                  onToggleExpand={toggleExpand}
                />
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
