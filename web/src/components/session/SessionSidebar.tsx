import { useState, useMemo, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import {
  IconPlus,
  IconSearch,
} from '../../lib/icons'
import { SessionFolder } from './SessionFolder'
import type { TmuxSession, TmuxWindow } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'
import { loadJSON, saveJSON } from '../../lib/storage'

const SESSION_ORDER_KEY = '0xmux-session-order'
const GROUP_ORDER_KEY = '0xmux-group-order'

// Deterministic color palette for project groups (no circles — brutalist style)
const PROJECT_COLORS = [
  '#1BFF80', // green (primary)
  '#FF6B6B', // red
  '#4ECDC4', // cyan
  '#FFB641', // orange
  '#A78BFA', // purple
  '#38BDF8', // blue
  '#FB923C', // deep orange
  '#F472B6', // pink
]

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

interface RepoGroup {
  repoRoot: string | null
  repoName: string
  color: string
  sessions: TmuxSession[]
}

function groupSessionsByRepo(sessions: TmuxSession[]): RepoGroup[] {
  const grouped = new Map<string, TmuxSession[]>()
  const ungrouped: TmuxSession[] = []

  for (const s of sessions) {
    if (s.repo_root) {
      const existing = grouped.get(s.repo_root)
      if (existing) {
        existing.push(s)
      } else {
        grouped.set(s.repo_root, [s])
      }
    } else {
      ungrouped.push(s)
    }
  }

  const usedColors = new Set<number>()
  const groups: RepoGroup[] = []

  for (const [root, sess] of grouped) {
    let colorIdx = hashString(root) % PROJECT_COLORS.length
    while (usedColors.has(colorIdx) && usedColors.size < PROJECT_COLORS.length) {
      colorIdx = (colorIdx + 1) % PROJECT_COLORS.length
    }
    usedColors.add(colorIdx)

    const basename = root.split('/').pop() || root
    groups.push({
      repoRoot: root,
      repoName: basename,
      color: PROJECT_COLORS[colorIdx],
      sessions: sess,
    })
  }

  // Default sort: groups with more sessions first
  groups.sort((a, b) => b.sessions.length - a.sessions.length)

  if (ungrouped.length > 0) {
    groups.push({
      repoRoot: null,
      repoName: '其他',
      color: 'var(--color-fg-faint)',
      sessions: ungrouped,
    })
  }

  return groups
}

/** Apply persisted order to sessions within each group */
function applySessionOrder(groups: RepoGroup[], order: string[]): RepoGroup[] {
  if (order.length === 0) return groups
  const orderMap = new Map(order.map((name, idx) => [name, idx]))
  return groups.map(g => ({
    ...g,
    sessions: [...g.sessions].sort((a, b) => {
      const ai = orderMap.get(a.name) ?? 9999
      const bi = orderMap.get(b.name) ?? 9999
      return ai - bi
    }),
  }))
}

/** Apply persisted order to groups themselves */
function applyGroupOrder(groups: RepoGroup[], order: string[]): RepoGroup[] {
  if (order.length === 0) return groups
  const orderMap = new Map(order.map((key, idx) => [key, idx]))
  return [...groups].sort((a, b) => {
    const ak = a.repoRoot ?? '__ungrouped'
    const bk = b.repoRoot ?? '__ungrouped'
    const ai = orderMap.get(ak) ?? 9999
    const bi = orderMap.get(bk) ?? 9999
    return ai - bi
  })
}

function getGroupKey(g: RepoGroup): string {
  return g.repoRoot ?? '__ungrouped'
}

interface SessionSidebarProps {
  sessions: TmuxSession[]
  windows: Map<string, TmuxWindow[]>
  selectedWindow: { sessionName: string; windowIndex: number } | null
  selectedSession: string | null
  onSelectSession: (sessionName: string) => void
  onSelectWindow: (sessionName: string, windowIndex: number) => void
  onCreateSession: () => void
  onCreateWindow: (sessionName: string) => void
  onDeleteWindow: (sessionName: string, windowIndex: number) => void
  onDeleteSession: (sessionName: string) => void
  onCreateWorktree?: (sessionName: string) => void
  isWindowInUse?: (sessionName: string, windowIndex: number) => boolean
  isInSplitGroup?: (sessionName: string, windowIndex: number) => boolean
  onWindowHoverStart?: (sessionName: string, windowIndex: number) => void
  onWindowHoverEnd?: () => void
  collapsed: boolean
}

export function SessionSidebar({
  sessions,
  windows,
  selectedWindow,
  selectedSession,
  onSelectSession,
  onSelectWindow,
  onCreateSession,
  onCreateWindow,
  onDeleteWindow,
  onDeleteSession,
  onCreateWorktree,
  isWindowInUse,
  isInSplitGroup,
  onWindowHoverStart,
  onWindowHoverEnd,
  collapsed,
}: SessionSidebarProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(sessions.map((s) => s.name))
  )

  // Persisted orders
  const [sessionOrder, setSessionOrder] = useState<string[]>(() =>
    loadJSON<string[]>(SESSION_ORDER_KEY) ?? []
  )
  const [groupOrder, setGroupOrder] = useState<string[]>(() =>
    loadJSON<string[]>(GROUP_ORDER_KEY) ?? []
  )

  // Session drag state
  const [dragSession, setDragSession] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dropPositionRef = useRef<'before' | 'after'>('after')

  // Group drag state
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [dropGroupTarget, setDropGroupTarget] = useState<string | null>(null)
  const dropGroupPositionRef = useRef<'before' | 'after'>('after')

  const filtered = sessions.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const groups = useMemo(() => {
    const raw = groupSessionsByRepo(filtered)
    const ordered = applyGroupOrder(raw, groupOrder)
    return applySessionOrder(ordered, sessionOrder)
  }, [filtered, sessionOrder, groupOrder])

  const showGroupHeaders = groups.length > 1

  const toggleSession = (sessionName: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionName)) {
        next.delete(sessionName)
      } else {
        next.add(sessionName)
      }
      return next
    })
  }

  // ── Session Drag & Drop ──

  const handleDragStart = useCallback((sessionName: string, e: React.DragEvent) => {
    setDragSession(sessionName)
    setDragGroup(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/x-session', sessionName)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDragSession(null)
    setDropTarget(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragOver = useCallback((sessionName: string, e: React.DragEvent) => {
    if (!dragSession || dragSession === sessionName) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dropPositionRef.current = e.clientY < midY ? 'before' : 'after'
    setDropTarget(sessionName)
  }, [dragSession])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback((targetSessionName: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!dragSession || dragSession === targetSessionName) return

    const allNames = groups.flatMap(g => g.sessions.map(s => s.name))
    const reordered = allNames.filter(n => n !== dragSession)
    let toIdx = reordered.indexOf(targetSessionName)
    if (toIdx === -1) return
    if (dropPositionRef.current === 'after') toIdx += 1
    reordered.splice(toIdx, 0, dragSession)

    setSessionOrder(reordered)
    saveJSON(SESSION_ORDER_KEY, reordered)
    setDragSession(null)
    setDropTarget(null)
  }, [dragSession, groups])

  // ── Group Drag & Drop ──

  const handleGroupDragStart = useCallback((groupKey: string, e: React.DragEvent) => {
    setDragGroup(groupKey)
    setDragSession(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/x-group', groupKey)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleGroupDragEnd = useCallback((e: React.DragEvent) => {
    setDragGroup(null)
    setDropGroupTarget(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleGroupDragOver = useCallback((groupKey: string, e: React.DragEvent) => {
    if (!dragGroup || dragGroup === groupKey) return
    // Ignore if a session is being dragged (not a group)
    if (dragSession) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dropGroupPositionRef.current = e.clientY < midY ? 'before' : 'after'
    setDropGroupTarget(groupKey)
  }, [dragGroup, dragSession])

  const handleGroupDragLeave = useCallback(() => {
    setDropGroupTarget(null)
  }, [])

  const handleGroupDrop = useCallback((targetGroupKey: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!dragGroup || dragGroup === targetGroupKey) return

    const allKeys = groups.map(getGroupKey)
    const reordered = allKeys.filter(k => k !== dragGroup)
    let toIdx = reordered.indexOf(targetGroupKey)
    if (toIdx === -1) return
    if (dropGroupPositionRef.current === 'after') toIdx += 1
    reordered.splice(toIdx, 0, dragGroup)

    setGroupOrder(reordered)
    saveJSON(GROUP_ORDER_KEY, reordered)
    setDragGroup(null)
    setDropGroupTarget(null)
  }, [dragGroup, groups])

  return (
    <aside
      className="flex flex-col bg-[var(--color-bg)] shrink-0 overflow-hidden"
      style={{
        width: collapsed ? 48 : '100%',
        transition: 'width 200ms ease',
      }}
    >
      {/* Top: search + create button */}
      {!collapsed && (
        <div className="p-2 flex items-center gap-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 border border-[var(--color-border-light)] rounded-[var(--radius)]
            focus-within:border-[var(--color-primary)] transition-colors">
            <Icon icon={IconSearch} width={12} height={12} className="text-[var(--color-fg-muted)] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('session.search')}
              className="flex-1 bg-transparent outline-none text-xs placeholder:text-[var(--color-fg-faint)] min-w-0"
            />
          </div>
          <button
            onClick={onCreateSession}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-primary)]
              text-[var(--color-primary)] rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)]"
            title={t('session.newSession')}
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Collapsed: just a + button */}
      {collapsed && (
        <div className="p-1.5 flex justify-center border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <button
            onClick={onCreateSession}
            className="w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
              rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
            title={t('session.newSession')}
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Session folders list — grouped by repo, both levels draggable */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {groups.length > 0 ? (
            groups.map((group) => {
              const gk = getGroupKey(group)
              return (
                <div
                  key={gk}
                  className="relative"
                  draggable={showGroupHeaders}
                  onDragStart={showGroupHeaders ? (e) => {
                    // Only start group drag from the header area
                    const target = e.target as HTMLElement
                    if (target.closest('[data-session-drag]')) {
                      // Session drag, not group drag — don't interfere
                      return
                    }
                    handleGroupDragStart(gk, e)
                  } : undefined}
                  onDragEnd={showGroupHeaders ? handleGroupDragEnd : undefined}
                  onDragOver={showGroupHeaders ? (e) => handleGroupDragOver(gk, e) : undefined}
                  onDragLeave={showGroupHeaders ? handleGroupDragLeave : undefined}
                  onDrop={showGroupHeaders ? (e) => {
                    // If this is a session drop, let it bubble
                    if (e.dataTransfer.types.includes('text/x-session')) return
                    handleGroupDrop(gk, e)
                  } : undefined}
                >
                  {/* Group drop indicator */}
                  {dropGroupTarget === gk && dragGroup !== gk && (
                    <div
                      className="absolute left-2 right-2 h-0.5 bg-[var(--color-accent)] z-10 pointer-events-none"
                      style={{
                        top: dropGroupPositionRef.current === 'before' ? 0 : undefined,
                        bottom: dropGroupPositionRef.current === 'after' ? 0 : undefined,
                      }}
                    />
                  )}

                  {/* Group header */}
                  {showGroupHeaders && (
                    <div className="flex items-center gap-2 px-3 pt-3 pb-1 cursor-grab active:cursor-grabbing">
                      <div
                        className="w-2 h-2 shrink-0 opacity-40"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider truncate">
                        {group.repoName}
                      </span>
                      <div className="flex-1 h-px bg-[var(--color-border-light)]" />
                    </div>
                  )}

                  {/* Sessions in this group */}
                  {group.sessions.map((session) => (
                    <div
                      key={session.name}
                      data-session-drag
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        handleDragStart(session.name, e)
                      }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(session.name, e)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(session.name, e)}
                      className="relative"
                    >
                      {dropTarget === session.name && dragSession !== session.name && (
                        <div
                          className="absolute left-3 right-3 h-0.5 bg-[var(--color-primary)] z-10 pointer-events-none"
                          style={{
                            top: dropPositionRef.current === 'before' ? 0 : undefined,
                            bottom: dropPositionRef.current === 'after' ? 0 : undefined,
                          }}
                        />
                      )}
                      <SessionFolder
                        session={session}
                        windows={windows.get(session.name) || []}
                        selectedWindow={selectedWindow}
                        isSelected={selectedSession === session.name}
                        onSelectSession={onSelectSession}
                        onSelectWindow={onSelectWindow}
                        onCreateWindow={onCreateWindow}
                        onCreateWorktree={onCreateWorktree}
                        onDeleteWindow={onDeleteWindow}
                        onDeleteSession={onDeleteSession}
                        isWindowInUse={isWindowInUse}
                        isInSplitGroup={isInSplitGroup}
                        collapsed={!expandedSessions.has(session.name)}
                        onToggle={() => toggleSession(session.name)}
                        groupColor={showGroupHeaders ? group.color : undefined}
                        onWindowHoverStart={onWindowHoverStart}
                        onWindowHoverEnd={onWindowHoverEnd}
                      />
                    </div>
                  ))}
                </div>
              )
            })
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-[var(--color-fg-faint)]">
                {search ? t('session.noMatch') : t('session.noSessions')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed: minimal session indicators with group color */}
      {collapsed && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-2">
          {groups.flatMap((group) =>
            group.sessions.map((session) => {
              const isSelected = selectedSession === session.name
              return (
                <button
                  key={session.name}
                  onClick={() => onSelectSession(session.name)}
                  className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold rounded-[var(--radius)]
                    transition-colors cursor-pointer
                    ${isSelected
                      ? 'bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border)]'
                      : 'border-[length:var(--border-w)] border-transparent hover:bg-[var(--color-bg-alt)]'
                    }
                  `}
                  title={session.name}
                  style={showGroupHeaders ? { borderColor: isSelected ? group.color : undefined } : undefined}
                >
                  {session.name.charAt(0).toUpperCase()}
                </button>
              )
            })
          )}
        </div>
      )}

    </aside>
  )
}
