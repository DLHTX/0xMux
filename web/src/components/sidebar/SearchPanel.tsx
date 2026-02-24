import { useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { IconSearch, IconRegex, IconCaseSensitive } from '../../lib/icons'
import { useSearch } from '../../hooks/useSearch'
import type { WorkspaceContext } from '../../lib/types'

interface SearchPanelProps {
  onOpenFile: (path: string, line?: number) => void
  workspace?: WorkspaceContext
}

export function SearchPanel({ onOpenFile, workspace }: SearchPanelProps) {
  const { options, results, loading, error, updateQuery, toggleRegex, toggleCase, setGlob } = useSearch(workspace)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-2 space-y-1.5 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
        <div className="flex items-center gap-1 bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)]">
          <Icon icon={IconSearch} width={14} className="ml-2 shrink-0 text-[var(--color-fg-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={options.query}
            onChange={e => updateQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent px-1 py-1.5 text-xs outline-none text-[var(--color-fg)]"
          />
          <button
            onClick={toggleRegex}
            className={`shrink-0 w-6 h-6 flex items-center justify-center text-[10px] font-bold transition-colors
              ${options.isRegex ? 'text-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}
            title="Regex"
          >
            <Icon icon={IconRegex} width={14} />
          </button>
          <button
            onClick={toggleCase}
            className={`shrink-0 w-6 h-6 flex items-center justify-center text-[10px] font-bold transition-colors
              ${options.caseSensitive ? 'text-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}
            title="Case Sensitive"
          >
            <Icon icon={IconCaseSensitive} width={14} />
          </button>
        </div>
        <input
          type="text"
          value={options.fileGlob ?? ''}
          onChange={e => setGlob(e.target.value)}
          placeholder="File filter (e.g. *.rs)"
          className="w-full bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] px-2 py-1 text-xs outline-none text-[var(--color-fg)]"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto text-xs">
        {loading && (
          <div className="p-3 text-[var(--color-fg-muted)] animate-pulse">Searching...</div>
        )}
        {error && (
          <div className="p-3 text-[var(--color-danger)]">{error}</div>
        )}
        {results && !loading && results.results.length === 0 && (
          <div className="p-3 text-[var(--color-fg-muted)]">No results</div>
        )}
        {results && !loading && results.results.map(group => (
          <div key={group.file_path}>
            <div className="px-2 py-1 font-bold text-[var(--color-fg)] bg-[var(--color-bg-alt)] sticky top-0 truncate">
              {group.file_path}
            </div>
            {group.matches.map((m, i) => (
              <button
                key={i}
                onClick={() => onOpenFile(m.file_path, m.line_number)}
                className="w-full text-left px-3 py-0.5 hover:bg-[var(--color-bg-alt)] transition-colors flex items-baseline gap-2"
              >
                <span className="text-[var(--color-fg-muted)] shrink-0 tabular-nums w-8 text-right">{m.line_number}</span>
                <span className="truncate text-[var(--color-fg)]">
                  {m.line_content.substring(0, m.match_start)}
                  <span className="bg-[#22c55e33] text-[#15803d] font-bold">
                    {m.line_content.substring(m.match_start, m.match_end)}
                  </span>
                  {m.line_content.substring(m.match_end)}
                </span>
              </button>
            ))}
          </div>
        ))}
        {results && results.truncated && (
          <div className="p-2 text-center text-[var(--color-fg-muted)]">
            Results truncated (max 200)
          </div>
        )}
        {results && !loading && results.results.length > 0 && (
          <div className="p-2 text-[var(--color-fg-muted)] text-center">
            {results.total_files} files, {results.total_matches} matches
          </div>
        )}
      </div>
    </div>
  )
}
