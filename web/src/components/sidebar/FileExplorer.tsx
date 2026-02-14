import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Icon } from '@iconify/react'
import {
  IconChevronRight,
  IconChevronDown,
  IconChevronsDown,
  IconChevronsUp,
  IconRefreshCw,
  IconFile,
  IconFilePlus,
  IconFolderPlus,
  IconClipboard,
  IconEdit,
  IconTrash,
  IconExternalLink,
} from '../../lib/icons'
import { loadJSON, saveJSON } from '../../lib/storage'
import {
  getFileTree,
  getGitStatus,
  deleteFile,
  renameFile,
  createFile,
  revealInFileManager,
  resolveAbsoluteFilePath,
  uploadFiles,
} from '../../lib/api'
import type { FileTreeNode, GitFileStatus, WorkspaceContext } from '../../lib/types'
import { getFileIcon } from '../../lib/file-icons'
import { buildGitStatusMap, getGitStatusBadge, getGitStatusColor } from '../../lib/gitDecorations'
import { setTerminalFileDragData } from '../../lib/terminalFileDrag'
import { ContextMenu } from '../terminal/ContextMenu'
import type { ContextMenuEntry } from '../terminal/ContextMenu'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useI18n } from '../../hooks/useI18n'

const DELETE_SKIP_CONFIRM_KEY = '0xmux-delete-skip-confirm'
const UNDO_STACK_MAX = 50

/** Undo action types */
type UndoAction =
  | { type: 'rename'; oldPath: string; newPath: string; oldName: string; newName: string }
  | { type: 'create'; path: string; isDirectory: boolean }

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

/** Flatten tree into visible order (respecting expanded state) */
function flattenVisible(nodes: FileTreeNode[], expanded: Set<string>): FileTreeNode[] {
  const result: FileTreeNode[] = []
  function walk(list: FileTreeNode[]) {
    for (const node of sortNodes(list)) {
      result.push(node)
      if (node.type === 'directory' && expanded.has(node.path) && node.children) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return result
}

function getExpandedStorageKey(workspace?: WorkspaceContext): string {
  const session = workspace?.session ?? 'default'
  const window = workspace?.window ?? 'default'
  return `${EXPANDED_STORAGE_PREFIX}:${session}:${window}`
}

function loadPersistedExpanded(workspace?: WorkspaceContext): Set<string> | null {
  const parsed = loadJSON<unknown>(getExpandedStorageKey(workspace))
  if (!Array.isArray(parsed)) return null
  return new Set(parsed.filter((value): value is string => typeof value === 'string'))
}

/** Detect Ctrl (Windows/Linux) or Cmd (macOS) */
function isCtrlOrCmd(e: React.MouseEvent | MouseEvent): boolean {
  return e.metaKey || e.ctrlKey
}

// ── Inline Input Component ──

interface InlineInputProps {
  defaultValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
  depth: number
  isDirectory: boolean
}

function InlineInput({ defaultValue, onSubmit, onCancel, depth, isDirectory }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    if (!isDirectory && defaultValue.includes('.')) {
      el.setSelectionRange(0, defaultValue.lastIndexOf('.'))
    } else {
      el.select()
    }
  }, [defaultValue, isDirectory])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = inputRef.current?.value.trim()
      if (val) {
        submittedRef.current = true
        onSubmit(val)
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const handleBlur = () => {
    if (!submittedRef.current) {
      onCancel()
    }
  }

  return (
    <div
      className="flex items-center gap-1 h-7"
      style={{ paddingLeft: depth * 16 + 8 }}
    >
      <span className="shrink-0 w-4 h-4" />
      {!isDirectory && (
        <Icon icon={IconFile} width={14} height={14} className="text-[var(--color-fg-muted)]" />
      )}
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="flex-1 min-w-0 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-primary)] text-xs text-[var(--color-fg)] px-1 py-0 h-5 outline-none rounded-[var(--radius)]"
      />
    </div>
  )
}

// ── Tree Node Component ──

interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  expanded: Set<string>
  selected: Set<string>
  onToggle: (path: string) => void
  onExpand: (path: string) => void
  onNodeClick: (node: FileTreeNode, e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void
  loading: Set<string>
  gitStatusByPath: Map<string, GitFileStatus>
  workspace?: WorkspaceContext
  renamingPath: string | null
  onRenameSubmit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
  creatingIn: string | null
  creatingType: 'file' | 'directory' | null
  onCreateSubmit: (parentPath: string, name: string, isDir: boolean) => void
  onCreateCancel: () => void
  externalDropDir: string | null
}

function TreeNode({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onExpand,
  onNodeClick,
  onContextMenu,
  loading,
  gitStatusByPath,
  workspace,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  creatingType,
  onCreateSubmit,
  onCreateCancel,
  externalDropDir,
}: TreeNodeProps) {
  const isDir = node.type === 'directory'
  const isExpanded = expanded.has(node.path)
  const isLoading = loading.has(node.path)
  const isDot = isDotfile(node.name)
  const isIgnored = node.ignored === true
  const isSelected = selected.has(node.path)
  const fileIcon = getFileIcon(node.name)
  const fileStatus = isDir ? undefined : gitStatusByPath.get(node.path)
  const nameColor = isIgnored
    ? 'var(--color-fg-muted)'
    : fileStatus
      ? getGitStatusColor(fileStatus)
      : 'var(--color-fg)'

  const isDropTarget = isDir && externalDropDir === node.path
  const isRenaming = renamingPath === node.path
  const isCreatingHere = isDir && creatingIn === node.path

  const handleClick = (e: React.MouseEvent) => {
    onNodeClick(node, e)
  }

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDir) return
    setTerminalFileDragData(event.dataTransfer, node.path, workspace)
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, node)
  }

  if (isRenaming) {
    return (
      <InlineInput
        defaultValue={node.name}
        onSubmit={(newName) => onRenameSubmit(node.path, newName)}
        onCancel={onRenameCancel}
        depth={depth}
        isDirectory={isDir}
      />
    )
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        aria-selected={isSelected}
        data-path={node.path}
        data-node-type={node.type}
        className={`
          flex items-center gap-1 h-7 cursor-pointer select-none
          text-xs transition-colors
          ${isDropTarget
            ? 'bg-[var(--color-accent)]/20 outline outline-1 outline-[var(--color-accent)]/60'
            : isSelected
              ? 'bg-[var(--color-primary)]/15'
              : 'hover:bg-[var(--color-bg-alt)]'
          }
          ${isIgnored ? 'opacity-60' : isDot ? 'opacity-65' : ''}
        `}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
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

      {/* Inline create input at top of expanded directory */}
      {isDir && isExpanded && isCreatingHere && creatingType && (
        <InlineInput
          defaultValue=""
          onSubmit={(name) => onCreateSubmit(node.path, name, creatingType === 'directory')}
          onCancel={onCreateCancel}
          depth={depth + 1}
          isDirectory={creatingType === 'directory'}
        />
      )}

      {/* Render children if expanded */}
      {isDir && isExpanded && node.children && (
        <div role="group">
          {sortNodes(node.children).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onExpand={onExpand}
              onNodeClick={onNodeClick}
              onContextMenu={onContextMenu}
              loading={loading}
              gitStatusByPath={gitStatusByPath}
              workspace={workspace}
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              creatingIn={creatingIn}
              creatingType={creatingType}
              onCreateSubmit={onCreateSubmit}
              onCreateCancel={onCreateCancel}
              externalDropDir={externalDropDir}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── FileExplorer Component ──

export function FileExplorer({ onFileOpen, workspace }: FileExplorerProps) {
  const { t } = useI18n()
  const [roots, setRoots] = useState<FileTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [gitStatusByPath, setGitStatusByPath] = useState<Map<string, GitFileStatus>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const loadedDirs = useRef<Set<string>>(new Set())

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<string | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileTreeNode } | null>(null)

  // Delete confirmation modal state
  const [deleteTargets, setDeleteTargets] = useState<FileTreeNode[] | null>(null)
  const [dontAskDelete, setDontAskDelete] = useState(false)

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  // Inline create state
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'directory' | null>(null)

  // External file drop state
  const [externalDropDir, setExternalDropDir] = useState<string | null>(null)

  // Undo stack
  const undoStackRef = useRef<UndoAction[]>([])
  const [undoToast, setUndoToast] = useState<string | null>(null)

  // Flat visible node list for Shift-range selection
  const visibleNodes = useMemo(() => flattenVisible(roots, expanded), [roots, expanded])

  useEffect(() => {
    saveJSON(getExpandedStorageKey(workspace), [...expanded])
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

  // Keep expanded directories hydrated
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

  // ── Selection ──

  const handleNodeClick = useCallback((node: FileTreeNode, e: React.MouseEvent) => {
    const isDir = node.type === 'directory'

    if (e.shiftKey && anchorRef.current) {
      // Shift+click: range select
      e.preventDefault()
      const anchorIdx = visibleNodes.findIndex((n) => n.path === anchorRef.current)
      const targetIdx = visibleNodes.findIndex((n) => n.path === node.path)
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx)
        const end = Math.max(anchorIdx, targetIdx)
        const rangePaths = visibleNodes.slice(start, end + 1).map((n) => n.path)
        setSelected((prev) => {
          const next = new Set(prev)
          for (const p of rangePaths) next.add(p)
          return next
        })
      }
      return
    }

    if (isCtrlOrCmd(e)) {
      // Ctrl/Cmd+click: toggle single item
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(node.path)) {
          next.delete(node.path)
        } else {
          next.add(node.path)
        }
        return next
      })
      anchorRef.current = node.path
      return
    }

    // Normal click: clear selection, select this one
    setSelected(new Set([node.path]))
    anchorRef.current = node.path

    if (isDir) {
      if (!expanded.has(node.path)) {
        handleExpand(node.path)
      }
      handleToggle(node.path)
    } else {
      onFileOpen(node.path)
    }
  }, [visibleNodes, expanded, handleExpand, handleToggle, onFileOpen])

  // Clear selection when clicking empty area
  const handleTreeBgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelected(new Set())
      anchorRef.current = null
    }
  }, [])

  // ── Context Menu Handlers ──

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode) => {
    // If right-clicked node is not in selection, select only it
    if (!selected.has(node.path)) {
      setSelected(new Set([node.path]))
      anchorRef.current = node.path
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [selected])

  const closeContextMenu = useCallback(() => {
    setCtxMenu(null)
  }, [])

  // ── Undo ──

  const pushUndo = useCallback((action: UndoAction) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(UNDO_STACK_MAX - 1)), action]
  }, [])

  const showToast = useCallback((msg: string) => {
    setUndoToast(msg)
    setTimeout(() => setUndoToast(null), 2000)
  }, [])

  const executeUndo = useCallback(async () => {
    const action = undoStackRef.current.pop()
    if (!action) {
      showToast(t('undo.empty'))
      return
    }

    try {
      if (action.type === 'rename') {
        await renameFile(action.newPath, action.oldName, workspace)
        showToast(t('undo.rename', { old: action.newName, new: action.oldName }))
      } else if (action.type === 'create') {
        await deleteFile(action.path, workspace)
        showToast(t('undo.create', { name: action.path.split('/').pop() ?? action.path }))
      }
      await loadRoot(true)
    } catch (e) {
      console.error('[FileExplorer] undo failed:', e)
    }
  }, [workspace, loadRoot, showToast, t])

  // Listen for Ctrl+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.target as HTMLElement).closest('.monaco-editor')) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void executeUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [executeUndo])

  // ── Delete ──

  const executeDeletePaths = useCallback(async (paths: string[]) => {
    try {
      for (const p of paths) {
        await deleteFile(p, workspace)
      }
      setSelected(new Set())
      await loadRoot(true)
    } catch (e) {
      console.error('[FileExplorer] delete failed:', e)
    }
  }, [workspace, loadRoot])

  const handleDeleteNodes = useCallback((nodes: FileTreeNode[]) => {
    const skipConfirm = localStorage.getItem(DELETE_SKIP_CONFIRM_KEY) === 'true'
    if (skipConfirm) {
      void executeDeletePaths(nodes.map((n) => n.path))
    } else {
      setDontAskDelete(false)
      setDeleteTargets(nodes)
    }
  }, [executeDeletePaths])

  const confirmDelete = useCallback(() => {
    if (!deleteTargets) return
    if (dontAskDelete) {
      localStorage.setItem(DELETE_SKIP_CONFIRM_KEY, 'true')
    }
    void executeDeletePaths(deleteTargets.map((n) => n.path))
    setDeleteTargets(null)
  }, [deleteTargets, dontAskDelete, executeDeletePaths])

  const cancelDelete = useCallback(() => {
    setDeleteTargets(null)
  }, [])

  // ── Rename ──

  const handleRename = useCallback((node: FileTreeNode) => {
    setRenamingPath(node.path)
  }, [])

  const handleRenameSubmit = useCallback(async (oldPath: string, newName: string) => {
    setRenamingPath(null)
    const oldName = oldPath.split('/').pop() ?? oldPath
    if (newName === oldName) return
    try {
      const res = await renameFile(oldPath, newName, workspace)
      pushUndo({ type: 'rename', oldPath, newPath: res.new_path, oldName, newName })
      await loadRoot(true)
    } catch (e) {
      console.error('[FileExplorer] rename failed:', e)
    }
  }, [workspace, loadRoot, pushUndo])

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null)
  }, [])

  // ── Create ──

  const handleNewFile = useCallback((dirPath: string) => {
    setExpanded((prev) => new Set(prev).add(dirPath))
    void loadChildren(dirPath)
    setCreatingIn(dirPath)
    setCreatingType('file')
  }, [loadChildren])

  const handleNewFolder = useCallback((dirPath: string) => {
    setExpanded((prev) => new Set(prev).add(dirPath))
    void loadChildren(dirPath)
    setCreatingIn(dirPath)
    setCreatingType('directory')
  }, [loadChildren])

  const handleCreateSubmit = useCallback(async (parentPath: string, name: string, isDir: boolean) => {
    setCreatingIn(null)
    setCreatingType(null)
    const newPath = parentPath ? `${parentPath}/${name}` : name
    try {
      await createFile(newPath, isDir, workspace)
      pushUndo({ type: 'create', path: newPath, isDirectory: isDir })
      loadedDirs.current.delete(parentPath)
      await loadRoot(true)
      if (!isDir) {
        onFileOpen(newPath)
      }
    } catch (e) {
      console.error('[FileExplorer] create failed:', e)
    }
  }, [workspace, loadRoot, onFileOpen, pushUndo])

  const handleCreateCancel = useCallback(() => {
    setCreatingIn(null)
    setCreatingType(null)
  }, [])

  // ── Clipboard / Reveal ──

  const handleCopyPath = useCallback((path: string) => {
    void navigator.clipboard.writeText(path)
  }, [])

  const handleCopyAbsPath = useCallback(async (path: string) => {
    try {
      const res = await resolveAbsoluteFilePath(path, workspace)
      void navigator.clipboard.writeText(res.path)
    } catch {
      void navigator.clipboard.writeText(path)
    }
  }, [workspace])

  const handleCopyName = useCallback((name: string) => {
    void navigator.clipboard.writeText(name)
  }, [])

  const handleReveal = useCallback(async (path: string) => {
    try {
      await revealInFileManager(path, workspace)
    } catch (e) {
      console.error('[FileExplorer] reveal failed:', e)
    }
  }, [workspace])

  // ── External File Drop ──

  /** Walk up from event target to find the tree node's data-path */
  const resolveDropDir = useCallback((target: EventTarget | null): string => {
    let el = target as HTMLElement | null
    while (el) {
      const path = el.getAttribute('data-path')
      const nodeType = el.getAttribute('data-node-type')
      if (path != null) {
        if (nodeType === 'directory') return path
        // File node: use parent directory
        const slash = path.lastIndexOf('/')
        return slash > 0 ? path.substring(0, slash) : ''
      }
      if (el.getAttribute('role') === 'tree') break
      el = el.parentElement
    }
    return '' // workspace root
  }, [])

  const handleExternalDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Ignore internal drags
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('application/x-0xmux-file-ref') || types.includes('text/0xmux-file-ref')) return
    if (!types.includes('Files')) return

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setExternalDropDir(resolveDropDir(e.target))
  }, [resolveDropDir])

  const handleExternalDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setExternalDropDir(null)
  }, [])

  const handleExternalDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    const targetDir = externalDropDir
    setExternalDropDir(null)

    const types = Array.from(e.dataTransfer.types)
    if (types.includes('application/x-0xmux-file-ref') || types.includes('text/0xmux-file-ref')) return
    const nativeFiles = Array.from(e.dataTransfer.files)
    if (nativeFiles.length === 0) return

    e.preventDefault()
    e.stopPropagation()

    try {
      const dir = targetDir || undefined
      const results = await uploadFiles(nativeFiles, dir, workspace)
      // Refresh tree to show new files
      await loadRoot(true)
      // Open first uploaded file
      if (results.length === 1 && results[0].path) {
        onFileOpen(results[0].path)
      }
    } catch (error) {
      console.error('[FileExplorer] upload failed:', error)
    }
  }, [externalDropDir, workspace, loadRoot, onFileOpen])

  // ── Build Context Menu ──

  const buildContextMenuItems = useCallback((node: FileTreeNode): ContextMenuEntry[] => {
    const multiSelected = selected.size > 1 && selected.has(node.path)

    if (multiSelected) {
      // Multi-selection context menu
      const selectedNodes = visibleNodes.filter((n) => selected.has(n.path))
      return [
        {
          label: t('ctx.deleteSelected', { n: selected.size }),
          icon: IconTrash,
          onClick: () => handleDeleteNodes(selectedNodes),
        },
        { separator: true },
        {
          label: t('ctx.copyPath'),
          icon: IconClipboard,
          onClick: () => {
            const paths = selectedNodes.map((n) => n.path).join('\n')
            void navigator.clipboard.writeText(paths)
          },
        },
      ]
    }

    // Single-selection context menu
    const isDir = node.type === 'directory'
    const items: ContextMenuEntry[] = []

    if (isDir) {
      items.push(
        { label: t('ctx.newFile'), icon: IconFilePlus, onClick: () => handleNewFile(node.path) },
        { label: t('ctx.newFolder'), icon: IconFolderPlus, onClick: () => handleNewFolder(node.path) },
        { separator: true },
      )
    } else {
      items.push(
        { label: t('ctx.open'), icon: IconFile, onClick: () => onFileOpen(node.path) },
        { separator: true },
      )
    }

    items.push(
      { label: t('ctx.copyPath'), icon: IconClipboard, onClick: () => handleCopyPath(node.path) },
      { label: t('ctx.copyAbsPath'), onClick: () => { void handleCopyAbsPath(node.path) } },
      { label: t('ctx.copyName'), onClick: () => handleCopyName(node.name) },
      { separator: true },
      { label: t('ctx.rename'), icon: IconEdit, onClick: () => handleRename(node) },
      { label: t('ctx.delete'), icon: IconTrash, onClick: () => handleDeleteNodes([node]) },
      { separator: true },
      { label: t('ctx.reveal'), icon: IconExternalLink, onClick: () => { void handleReveal(node.path) } },
    )

    return items
  }, [selected, visibleNodes, t, onFileOpen, handleNewFile, handleNewFolder, handleCopyPath, handleCopyAbsPath, handleCopyName, handleRename, handleDeleteNodes, handleReveal])

  // ── Delete modal label ──

  const deleteModalLabel = useMemo(() => {
    if (!deleteTargets) return ''
    if (deleteTargets.length === 1) {
      return t('ctx.deleteConfirm', { name: deleteTargets[0].name })
    }
    return t('ctx.deleteMultiple', { n: deleteTargets.length })
  }, [deleteTargets, t])

  // ── Render ──

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
    <div className="flex flex-col h-full relative">
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
      <div
        className="flex-1 overflow-y-auto py-1 relative"
        role="tree"
        onClick={handleTreeBgClick}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
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
              selected={selected}
              onToggle={handleToggle}
              onExpand={handleExpand}
              onNodeClick={handleNodeClick}
              onContextMenu={handleContextMenu}
              loading={loading}
              gitStatusByPath={gitStatusByPath}
              workspace={workspace}
              renamingPath={renamingPath}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              creatingIn={creatingIn}
              creatingType={creatingType}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={handleCreateCancel}
              externalDropDir={externalDropDir}
            />
          ))
        )}

        {/* External file drop overlay (when hovering over empty area / root) */}
        {externalDropDir === '' && (
          <div className="absolute inset-0 z-[8] pointer-events-none bg-[var(--color-accent)]/10 border-2 border-dashed border-[var(--color-accent)]/60">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-2 py-1 text-[10px] font-mono text-[var(--color-accent)] bg-[var(--color-bg)]/90 border border-[var(--color-accent)]/50">
                {t('editor.dropHere')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildContextMenuItems(ctxMenu.node)}
          onClose={closeContextMenu}
        />
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border)] text-xs text-[var(--color-fg)] whitespace-nowrap">
          {undoToast}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal open={deleteTargets !== null} onClose={cancelDelete}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)]">
              <Icon icon={IconTrash} width={18} height={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-fg)]">
                {deleteModalLabel}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)] mt-1">
                {t('ctx.deleteHint')}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span
              className={`
                w-4 h-4 flex items-center justify-center border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors
                ${dontAskDelete
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                  : 'border-[var(--color-border)] bg-transparent'
                }
              `}
              onClick={() => setDontAskDelete(!dontAskDelete)}
            >
              {dontAskDelete && <span className="text-[10px] font-bold">x</span>}
            </span>
            <span
              className="text-xs text-[var(--color-fg-muted)]"
              onClick={() => setDontAskDelete(!dontAskDelete)}
            >
              {t('ctx.dontAskAgain')}
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelDelete}>
              {t('ctx.cancel')}
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>
              {t('ctx.confirmDelete')}
            </Button>
          </div>
        </div>
      </Modal>
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
