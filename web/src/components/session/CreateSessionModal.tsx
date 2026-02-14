import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import {
  IconFolder,
  IconFolderOpen,
  IconHome,
  IconClock,
  IconChevronRight,
  IconCheck,
  IconSearch,
  IconTerminal,
} from '../../lib/icons'
import { useI18n } from '../../hooks/useI18n'
import { listDirs } from '../../lib/api'
import type { DirEntry } from '../../lib/types'

const HISTORY_KEY = '0xmux-dir-history'
const MAX_HISTORY = 8

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(path: string) {
  const prev = loadHistory().filter((p) => p !== path)
  const next = [path, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

/** Show last two segments of a path, e.g. "/Users/koray/Documents" → "koray/Documents" */
function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 2) return '/' + parts.join('/')
  return parts.slice(-2).join('/')
}

/** Get the basename of a path */
function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() || p
}

/** Split path into breadcrumb segments */
function toBreadcrumbs(p: string): { label: string; path: string }[] {
  const parts = p.split('/').filter(Boolean)
  const crumbs: { label: string; path: string }[] = []
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      label: parts[i],
      path: '/' + parts.slice(0, i + 1).join('/'),
    })
  }
  return crumbs
}

/** Preset init commands shown as clickable chips. */
const INIT_CMD_PRESETS = [
  { label: 'claude', cmd: 'claude' },
  { label: 'claude --dangerously-skip-permissions', cmd: 'claude --dangerously-skip-permissions' },
]

/** Key for persisting the last-used init command. */
const LAST_INIT_CMD_KEY = '0xmux-last-init-cmd'

interface CreateSessionModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, startDirectory?: string, initCommand?: string) => void
}

const NAME_RE = /^[a-zA-Z0-9_.-]+$/

export function CreateSessionModal({
  open,
  onClose,
  onSubmit,
}: CreateSessionModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [selectedDir, setSelectedDir] = useState('')
  const [browsePath, setBrowsePath] = useState('')
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [dirsLoading, setDirsLoading] = useState(false)
  const [history] = useState<string[]>(() => loadHistory())
  const [initCommand, setInitCommand] = useState('')
  const [dirSearch, setDirSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Load dirs for a path
  const loadDirs = useCallback(async (path?: string) => {
    setDirsLoading(true)
    try {
      const resp = await listDirs(path)
      setDirs(resp.dirs)
      setBrowsePath(resp.path)
    } catch {
      setDirs([])
    } finally {
      setDirsLoading(false)
    }
  }, [])

  // Derive session name from a directory path (use basename, sanitised)
  const deriveNameFromDir = useCallback((dir: string) => {
    const raw = basename(dir)
    // Sanitise: replace invalid chars, trim to 50
    const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    setName(safe || 'session')
  }, [])

  // Navigate into a directory (browse only, don't select)
  const navigateTo = useCallback(
    (path: string) => {
      loadDirs(path)
    },
    [loadDirs]
  )

  // Navigate + select (for history shortcuts and home)
  const goToAndSelect = useCallback(
    (path: string) => {
      loadDirs(path)
      setSelectedDir(path)
      deriveNameFromDir(path)
    },
    [loadDirs, deriveNameFromDir]
  )

  // On open: load home dir
  useEffect(() => {
    if (open) {
      setError('')
      setSelectedDir('')
      setName('')
      // Restore last-used init command
      setInitCommand(localStorage.getItem(LAST_INIT_CMD_KEY) || '')
      setDirSearch('')
      loadDirs()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, loadDirs])

  // When browsePath is set and no selectedDir yet, auto-select it
  useEffect(() => {
    if (browsePath && !selectedDir) {
      setSelectedDir(browsePath)
      deriveNameFromDir(browsePath)
    }
  }, [browsePath, selectedDir, deriveNameFromDir])

  const validate = (n: string) => {
    if (!n) return ''
    if (n.length > 50) return t('create.maxChars')
    if (!NAME_RE.test(n)) return t('create.invalidChars')
    return ''
  }

  const handleNameChange = (v: string) => {
    setName(v)
    setError(validate(v))
  }

  const handleSubmit = () => {
    const trimmed = name.trim()
    const err = validate(trimmed)
    if (err || !trimmed) {
      setError(err || t('create.required'))
      return
    }
    if (selectedDir) {
      saveHistory(selectedDir)
    }
    const cmd = initCommand.trim()
    // Persist last-used init command for next time
    localStorage.setItem(LAST_INIT_CMD_KEY, cmd)
    onSubmit(trimmed, selectedDir || undefined, cmd || undefined)
    onClose()
  }

  if (!open) return null

  const breadcrumbs = toBreadcrumbs(browsePath)
  const filteredDirs = dirs.filter((d) =>
    d.name.toLowerCase().includes(dirSearch.trim().toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 bg-[var(--color-bg)]/80 flex items-center justify-center z-50"
      style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] p-5 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: command hint */}
        <div className="text-xs text-[var(--color-fg-muted)] mb-3">
          {t('create.command')}
        </div>

        {/* ── Directory Picker ── */}
        <div className="mb-3">
          {/* Section label */}
          <div className="text-[10px] text-[var(--color-success)] uppercase tracking-wider mb-2 font-bold border-l-2 border-[var(--color-success)] pl-2">
            {t('create.workdir')}
          </div>

          {/* Selected directory display */}
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-[var(--radius)] border border-[var(--color-primary)] bg-[var(--color-primary)]/5">
            <Icon icon={IconFolderOpen} width={14} className="text-[var(--color-primary)] shrink-0" />
            <span className="text-xs font-bold truncate flex-1">{selectedDir || '~'}</span>
            <Icon icon={IconCheck} width={12} className="text-[var(--color-primary)] shrink-0" />
          </div>

          {/* Recent directories */}
          {history.length > 0 && (
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <Icon icon={IconClock} width={10} className="text-[var(--color-fg-faint)] shrink-0" />
              <span className="text-[9px] text-[var(--color-fg-faint)] mr-0.5">{t('create.recentDirs')}</span>
              {history.map((h) => (
                <button
                  key={h}
                  onClick={() => goToAndSelect(h)}
                  className={`text-[10px] px-1.5 py-0.5 rounded-[var(--radius)] border transition-colors cursor-pointer
                    ${selectedDir === h
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-fg)]'
                    }`}
                  title={h}
                >
                  {shortPath(h)}
                </button>
              ))}
            </div>
          )}

          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-0.5 mb-1.5 min-h-[20px] overflow-x-auto">
            <button
              onClick={() => goToAndSelect('~')}
              className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] transition-colors shrink-0"
              title="Home (~)"
            >
              <Icon icon={IconHome} width={12} />
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
                <Icon icon={IconChevronRight} width={8} className="text-[var(--color-fg-faint)]" />
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`text-[10px] px-1 py-0.5 transition-colors cursor-pointer rounded-sm
                    ${i === breadcrumbs.length - 1
                      ? 'text-[var(--color-fg)] font-bold'
                      : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                    }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>

          {/* Directory list */}
          <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-[var(--radius)] border border-[var(--color-border-light)]">
            <Icon icon={IconSearch} width={12} className="text-[var(--color-fg-faint)] shrink-0" />
            <input
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="搜索文件夹..."
              className="flex-1 bg-transparent outline-none text-[10px] placeholder:text-[var(--color-fg-faint)]"
            />
          </div>

          {/* Directory list */}
          <div className="border border-[var(--color-border-light)] rounded-[var(--radius)] max-h-[200px] overflow-y-auto">
            {dirsLoading ? (
              <div className="p-3 text-center text-[10px] text-[var(--color-fg-faint)] animate-pulse">
                Loading...
              </div>
            ) : filteredDirs.length === 0 ? (
              <div className="p-3 text-center text-[10px] text-[var(--color-fg-faint)]">
                {t('create.emptyDir')}
              </div>
            ) : (
              filteredDirs.map((d) => (
                <div
                  key={d.path}
                  className="flex items-center w-full group"
                >
                  {/* Single click: navigate + choose this directory */}
                  <button
                    onClick={() => goToAndSelect(d.path)}
                    className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer min-w-0
                      ${selectedDir === d.path
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'hover:bg-[var(--color-bg-alt)]'
                      }`}
                  >
                    <Icon
                      icon={selectedDir === d.path ? IconFolderOpen : IconFolder}
                      width={12}
                      className={`shrink-0 ${selectedDir === d.path ? 'text-[var(--color-primary)]' : 'text-[var(--color-fg-muted)]'}`}
                    />
                    <span className="truncate flex-1">{d.name}</span>
                    <Icon icon={IconChevronRight} width={10} className="shrink-0 text-[var(--color-fg-faint)]" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Session Name Input ── */}
        <div className="mb-3">
          <div className="text-[10px] text-[var(--color-success)] uppercase tracking-wider mb-1.5 font-bold border-l-2 border-[var(--color-success)] pl-2">
            SESSION NAME
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{'>'}</span>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
                if (e.key === 'Escape') onClose()
              }}
              placeholder={t('create.placeholder')}
              className="flex-1 bg-transparent outline-none text-sm
                border-b-[length:var(--border-w)] border-[var(--color-border-light)] focus:border-[var(--color-primary)] py-1
                placeholder:text-[var(--color-fg-faint)]"
            />
          </div>
          {error && (
            <p className="text-xs text-[var(--color-danger)] mt-1 ml-5">{error}</p>
          )}
        </div>

        {/* ── Init Command ── */}
        <div className="mb-3">
          <div className="text-[10px] text-[var(--color-success)] uppercase tracking-wider mb-1.5 font-bold border-l-2 border-[var(--color-success)] pl-2">
            INIT COMMAND
          </div>
          <div className="flex items-center gap-2">
            <Icon icon={IconTerminal} width={14} className="text-[var(--color-fg-muted)] shrink-0" />
            <input
              value={initCommand}
              onChange={(e) => setInitCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
                if (e.key === 'Escape') onClose()
              }}
              placeholder="e.g. claude, npm run dev ..."
              className="flex-1 bg-transparent outline-none text-xs font-mono
                border-b border-[var(--color-border-light)] focus:border-[var(--color-primary)] py-1
                placeholder:text-[var(--color-fg-faint)]"
            />
          </div>
          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {INIT_CMD_PRESETS.map((p) => (
              <button
                key={p.cmd}
                onClick={() => setInitCommand(p.cmd)}
                className={`text-[10px] font-mono px-2 py-1 border transition-colors cursor-pointer
                  ${initCommand === p.cmd
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-fg)]'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-2 text-xs">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            {t('create.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] font-bold
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] transition-colors"
          >
            {t('create.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
