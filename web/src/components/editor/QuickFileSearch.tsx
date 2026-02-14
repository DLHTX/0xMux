import { useState, useEffect, useRef, useCallback } from 'react'
import { getFileTree } from '../../lib/api'
import { Icon } from '@iconify/react'
import { IconSearch, IconFile } from '../../lib/icons'
import type { WorkspaceContext } from '../../lib/types'

interface QuickFileSearchProps {
  isOpen: boolean
  onClose: () => void
  onSelectFile: (path: string) => void
  /** Called on Escape — parent can send '@' to terminal */
  onEscapeFallback?: () => void
  workspace?: WorkspaceContext
}

/** Directories to skip when scanning the file tree */
const SKIP_DIRS = new Set([
  'node_modules', 'target', '.git', 'dist', 'build',
  '__pycache__', '.next', '.nuxt', 'vendor', '.venv', 'venv',
])

/** Max files to collect before stopping the scan */
const MAX_FILES = 5000

/** Simple subsequence fuzzy match — returns true if all chars of query appear in order in candidate */
function fuzzyMatch(candidate: string, query: string): boolean {
  const lower = candidate.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

/** Score a fuzzy match — lower is better. Prefers filename matches and shorter paths */
function fuzzyScore(filePath: string, query: string): number {
  const filename = filePath.split('/').pop() ?? filePath
  const nameMatch = fuzzyMatch(filename, query)
  // Strong boost for filename-only match
  let score = nameMatch ? 0 : 1000
  // Prefer shorter paths
  score += filePath.length
  // Prefer exact prefix match in filename
  if (filename.toLowerCase().startsWith(query.toLowerCase())) {
    score -= 500
  }
  return score
}

export function QuickFileSearch({ isOpen, onClose, onSelectFile, onEscapeFallback, workspace }: QuickFileSearchProps) {
  const [query, setQuery] = useState('')
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch file tree recursively when opened
  useEffect(() => {
    if (!isOpen) return

    setQuery('')
    setSelectedIndex(0)
    setLoading(true)

    let cancelled = false

    async function fetchAllFiles() {
      const files: string[] = []
      const queue: string[] = ['']
      const visited = new Set<string>()

      while (queue.length > 0 && files.length < MAX_FILES) {
        // Process up to 5 directories in parallel
        const batch = queue.splice(0, 5)
        const results = await Promise.all(
          batch.map(path =>
            getFileTree(path || undefined, workspace).catch(() => ({ children: [] as { name: string; path: string; type: string }[] }))
          ),
        )

        if (cancelled) return

        for (const result of results) {
          for (const node of result.children) {
            if (node.type === 'directory') {
              if (
                !visited.has(node.path) &&
                !SKIP_DIRS.has(node.name)
              ) {
                visited.add(node.path)
                queue.push(node.path)
              }
            } else {
              files.push(node.path)
            }
          }
        }

        // Update progressively so user sees results while scanning
        if (!cancelled) {
          setAllFiles([...files])
        }
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    fetchAllFiles()

    return () => {
      cancelled = true
    }
  }, [isOpen, workspace?.session, workspace?.window])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Filter and sort results
  const filteredFiles = query
    ? allFiles
        .filter(f => fuzzyMatch(f, query))
        .sort((a, b) => fuzzyScore(a, query) - fuzzyScore(b, query))
        .slice(0, 50)
    : allFiles.slice(0, 50)

  // Keep selectedIndex in range
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(0, filteredFiles.length - 1)))
  }, [filteredFiles.length])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const file = filteredFiles[selectedIndex]
        if (file) {
          onSelectFile(file)
          onClose()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onEscapeFallback?.()
        onClose()
      }
    },
    [filteredFiles, selectedIndex, onSelectFile, onClose, onEscapeFallback],
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[500px] max-w-[90vw] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <Icon icon={IconSearch} width={14} className="text-[var(--color-fg-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent text-sm outline-none text-[var(--color-fg)]"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <span className="text-[10px] text-[var(--color-fg-muted)] animate-pulse shrink-0">
              scanning...
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto">
          {filteredFiles.length === 0 && !loading && (
            <div className="px-3 py-4 text-center text-xs text-[var(--color-fg-muted)]">
              No files found
            </div>
          )}
          {filteredFiles.map((filePath, i) => {
            const filename = filePath.split('/').pop() ?? filePath
            const dir = filePath.includes('/')
              ? filePath.substring(0, filePath.lastIndexOf('/'))
              : ''
            return (
              <button
                key={filePath}
                onClick={() => {
                  onSelectFile(filePath)
                  onClose()
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors
                  ${i === selectedIndex
                    ? 'bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-fg)]'
                    : 'hover:bg-[var(--color-bg-alt)] text-[var(--color-fg)]'
                  }`}
              >
                <Icon icon={IconFile} width={14} className="shrink-0 text-[var(--color-fg-muted)]" />
                <span className="font-bold truncate">{filename}</span>
                {dir && (
                  <span className="text-[var(--color-fg-muted)] truncate text-[10px] ml-auto shrink-0 max-w-[40%]">
                    {dir}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-1.5 border-t-[length:var(--border-w)] border-[var(--color-border-light)] flex items-center gap-4 text-[10px] text-[var(--color-fg-muted)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> close
          </span>
          {allFiles.length > 0 && (
            <span className="ml-auto tabular-nums">{allFiles.length} files</span>
          )}
        </div>
      </div>
    </div>
  )
}
