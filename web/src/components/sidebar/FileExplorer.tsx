import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import {
  IconChevronRight,
  IconChevronDown,
  IconChevronsDown,
  IconChevronsUp,
  IconRefreshCw,
} from '../../lib/icons'
import { getFileTree, getGitStatus } from '../../lib/api'
import type { FileTreeNode, GitFileStatus, WorkspaceContext } from '../../lib/types'
import { getFileIcon } from '../../lib/file-icons'
import { buildGitStatusMap, getGitStatusBadge, getGitStatusColor } from '../../lib/gitDecorations'
import { setTerminalFileDragData } from '../../lib/terminalFileDrag'

interface FileExplorerProps {
  onFileOpen: (path: string) => void
  workspace?: WorkspaceContext
}

/** Directories that start collapsed by default */
const COLLAPSED_BY_DEFAULT = new Set(['.git', 'node_modules', 'target'])
const EXPANDED_STORAGE_PREFIX = '0xmux-file-explorer-expanded'

/** Check if a filename is a dotfile */
function isDotfile(name: string): boolean {
  return name.startsWith('.') && name !== '.' && name !== '..'
}

/** Sort: directories first, then alphabetical (case-insensitive) */
function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function getExpandedStorageKey(workspace?: WorkspaceContext): string {
  const session = workspace?.session ?? 'default'
  const window = workspace?.window ?? 'default'
  return `${EXPANDED_STORAGE_PREFIX}:${session}:${window}`
}

function loadPersistedExpanded(workspace?: WorkspaceContext): Set<string> | null {
  try {
    const raw = localStorage.getItem(getExpandedStorageKey(workspace))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return null
  }
}

// ── Tree Node Component ──

interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onExpand: (path: string) => void
  onFileOpen: (path: string) => void
  loading: Set<string>
  gitStatusByPath: Map<string, GitFileStatus>
  workspace?: WorkspaceContext
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onExpand,
  onFileOpen,
  loading,
  gitStatusByPath,
  workspace,
}: TreeNodeProps) {
  const isDir = node.type === 'directory'
  const isExpanded = expanded.has(node.path)
  const isLoading = loading.has(node.path)
  const isDot = isDotfile(node.name)
  const fileIcon = getFileIcon(node.name)
  const fileStatus = isDir ? undefined : gitStatusByPath.get(node.path)
  const nameColor = fileStatus ? getGitStatusColor(fileStatus) : 'var(--color-fg)'

  const handleClick = () => {
    if (isDir) {
      if (!isExpanded) {
        onExpand(node.path)
      }
      onToggle(node.path)
    } else {
      onFileOpen(node.path)
    }
  }

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDir) return
    setTerminalFileDragData(event.dataTransfer, node.path, workspace)
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        className={`
          flex items-center gap-1 h-7 cursor-pointer select-none
          text-xs transition-colors
          hover:bg-[var(--color-bg-alt)]
          ${isDot ? 'opacity-50' : ''}
        `}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        draggable={!isDir}
        onDragStart={isDir ? undefined : handleDragStart}
      >
        {/* Expand/collapse chevron for directories */}
        {isDir ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center text-[var(--color-fg-muted)]">
            {isLoading ? (
              <Icon icon={IconRefreshCw} width={12} height={12} className="animate-spin" />
            ) : (
              <Icon
                icon={isExpanded ? IconChevronDown : IconChevronRight}
                width={12}
                height={12}
              />
            )}
          </span>
        ) : (
          <span className="shrink-0 w-4 h-4" />
        )}

        {/* VSCode-like tree: only files show icons */}
        {!isDir && (
          <Icon icon={fileIcon.icon} width={14} height={14} className={fileIcon.className} />
        )}

        {/* Name + git badge */}
        <span className="truncate min-w-0 flex-1" style={{ color: nameColor }}>
          {node.name}
        </span>
        {fileStatus && (
          <span
            className="shrink-0 mr-3 text-[10px] tabular-nums font-bold"
            style={{ color: getGitStatusColor(fileStatus) }}
            title={`Git: ${fileStatus}`}
          >
            {getGitStatusBadge(fileStatus)}
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {isDir && isExpanded && node.children && (
        <div role="group">
          {sortNodes(node.children).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={onExpand}
              onFileOpen={onFileOpen}
              loading={loading}
              gitStatusByPath={gitStatusByPath}
              workspace={workspace}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── FileExplorer Component ──

export function FileExplorer({ onFileOpen, workspace }: FileExplorerProps) {
  const [roots, setRoots] = useState<FileTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [gitStatusByPath, setGitStatusByPath] = useState<Map<string, GitFileStatus>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const loadedDirs = useRef<Set<string>>(new Set())

  useEffect(() => {
    try {
      localStorage.setItem(getExpandedStorageKey(workspace), JSON.stringify([...expanded]))
    } catch {
      // Ignore storage errors
    }
  }, [workspace?.session, workspace?.window, expanded])

  // Load root tree on mount
  useEffect(() => {
    void loadRoot(false)
  }, [workspace?.session, workspace?.window])

  const loadRoot = useCallback(async (preserveExpanded = false) => {
    setError(null)
    try {
      const [treeRes, gitRes] = await Promise.all([
        getFileTree(undefined, workspace),
        getGitStatus(workspace).catch(() => null),
      ])
      const sorted = sortNodes(treeRes.children)
      setRoots(sorted)
      setGitStatusByPath(gitRes ? buildGitStatusMap(gitRes.files) : new Map())
      loadedDirs.current = new Set()
      setExpanded((prev) => {
        if (preserveExpanded) {
          return new Set(prev)
        }
        const persisted = loadPersistedExpanded(workspace)
        if (persisted) {
          return persisted
        }
        // Auto-expand root dirs that are not in COLLAPSED_BY_DEFAULT
        const autoExpand = new Set<string>()
        sorted.forEach((node) => {
          if (node.type === 'directory' && !COLLAPSED_BY_DEFAULT.has(node.name)) {
            autoExpand.add(node.path)
          }
        })
        return autoExpand
      })
    } catch {
      setError('Failed to load file tree')
    }
  }, [workspace])

  const handleRefresh = useCallback(() => {
    void loadRoot(true)
  }, [loadRoot])

  const loadChildren = useCallback(async (dirPath: string) => {
    if (loadedDirs.current.has(dirPath)) return

    setLoading((prev) => new Set(prev).add(dirPath))
    try {
      const res = await getFileTree(dirPath, workspace)
      loadedDirs.current.add(dirPath)

      // Merge children into the tree
      setRoots((prev) => insertChildren(prev, dirPath, sortNodes(res.children)))
    } catch {
      // Silently fail; user can retry by collapsing/expanding
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }, [workspace])

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleExpand = useCallback(
    (path: string) => {
      loadChildren(path)
    },
    [loadChildren]
  )

  // Keep expanded directories hydrated after refresh/load so expanded roots don't look empty.
  useEffect(() => {
    const toLoad: string[] = []

    function walk(nodes: FileTreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'directory') {
          if (expanded.has(node.path) && !node.children && !loading.has(node.path)) {
            toLoad.push(node.path)
          }
          if (node.children) walk(node.children)
        }
      }
    }

    walk(roots)
    toLoad.forEach((path) => {
      void loadChildren(path)
    })
  }, [roots, expanded, loading, loadChildren])

  const expandAll = useCallback(() => {
    const allDirs = new Set<string>()
    function walk(nodes: FileTreeNode[]) {
      for (const n of nodes) {
        if (n.type === 'directory') {
          allDirs.add(n.path)
          if (n.children) walk(n.children)
        }
      }
    }
    walk(roots)
    setExpanded(allDirs)
  }, [roots])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <p className="text-xs text-[var(--color-fg-muted)]">{error}</p>
        <button
          onClick={handleRefresh}
          className="text-xs text-[var(--color-primary)] hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={expandAll}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer rounded-[var(--radius)] hover:bg-[var(--color-bg-alt)]"
            title="Expand all"
          >
            <Icon icon={IconChevronsDown} width={14} height={14} />
          </button>
          <button
            onClick={collapseAll}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer rounded-[var(--radius)] hover:bg-[var(--color-bg-alt)]"
            title="Collapse all"
          >
            <Icon icon={IconChevronsUp} width={14} height={14} />
          </button>
          <button
            onClick={handleRefresh}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer rounded-[var(--radius)] hover:bg-[var(--color-bg-alt)]"
            title="Refresh"
          >
            <Icon icon={IconRefreshCw} width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1" role="tree">
        {roots.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-[var(--color-fg-muted)]">No files found</p>
          </div>
        ) : (
          sortNodes(roots).map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              onExpand={handleExpand}
              onFileOpen={onFileOpen}
              loading={loading}
              gitStatusByPath={gitStatusByPath}
              workspace={workspace}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Helper: recursively insert children into the tree ──

function insertChildren(
  nodes: FileTreeNode[],
  targetPath: string,
  children: FileTreeNode[]
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children }
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return { ...node, children: insertChildren(node.children, targetPath, children) }
    }
    return node
  })
}
