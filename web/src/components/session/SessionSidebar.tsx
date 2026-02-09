import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import {
  IconPlus,
  IconSearch,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconFolder,
  IconChevronDown,
  IconChevronRight,
} from '../../lib/icons'
import { SessionItem } from './SessionItem'
import type { TmuxSession } from '../../lib/types'

interface SessionSidebarProps {
  sessions: TmuxSession[]
  selectedSession: string | null
  onSelect: (name: string) => void
  onCreate: () => void
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

interface FolderGroup {
  folder: string
  sessions: TmuxSession[]
}

/** Extract group name from session name by stripping trailing `-NN` suffix.
 *  e.g. "Download-01" → "Download", "my-project-03" → "my-project", "test" → "test" */
function getGroupName(sessionName: string): string {
  return sessionName.replace(/-\d+$/, '')
}

function groupByFolder(sessions: TmuxSession[]): FolderGroup[] {
  const map = new Map<string, TmuxSession[]>()
  for (const s of sessions) {
    const folder = getGroupName(s.name)
    const list = map.get(folder) || []
    list.push(s)
    map.set(folder, list)
  }
  return Array.from(map.entries()).map(([folder, sessions]) => ({
    folder,
    sessions,
  }))
}

export function SessionSidebar({
  sessions,
  selectedSession,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  collapsed,
  onToggleCollapse,
}: SessionSidebarProps) {
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  const filtered = sessions.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const groups = useMemo(() => groupByFolder(filtered), [filtered])

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }

  return (
    <aside
      className="flex flex-col border-r-[length:var(--border-w)] border-[var(--color-border)] bg-[var(--color-bg)] shrink-0 overflow-hidden"
      style={{
        width: collapsed ? 48 : 260,
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
              placeholder="Search..."
              className="flex-1 bg-transparent outline-none text-xs placeholder:text-[var(--color-fg-faint)] min-w-0"
            />
          </div>
          <button
            onClick={onCreate}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-primary)]
              text-[var(--color-primary)] rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)]"
            title="New session"
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Collapsed: just a + button */}
      {collapsed && (
        <div className="p-1.5 flex justify-center border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <button
            onClick={onCreate}
            className="w-7 h-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
              rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
            title="New session"
          >
            <Icon icon={IconPlus} width={14} height={14} />
          </button>
        </div>
      )}

      {/* Session list grouped by folder */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {groups.length > 0 ? (
            groups.map((group) => {
              const isOpen = !collapsedFolders.has(group.folder)
              return (
                <div key={group.folder}>
                  {/* Folder header */}
                  <button
                    onClick={() => toggleFolder(group.folder)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider
                      text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                  >
                    <Icon
                      icon={isOpen ? IconChevronDown : IconChevronRight}
                      width={10}
                      height={10}
                      className="shrink-0"
                    />
                    <Icon icon={IconFolder} width={12} height={12} className="shrink-0" />
                    <span className="truncate">{group.folder}</span>
                    <span className="ml-auto text-[var(--color-fg-faint)]">
                      {group.sessions.length}
                    </span>
                  </button>

                  {/* Sessions in this folder */}
                  {isOpen &&
                    group.sessions.map((session) => (
                      <SessionItem
                        key={session.name}
                        session={session}
                        selected={selectedSession === session.name}
                        onSelect={onSelect}
                        onDelete={onDelete}
                        onRename={onRename}
                      />
                    ))}
                </div>
              )
            })
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-[var(--color-fg-faint)]">
                {search ? 'No matching sessions' : 'No sessions yet'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed: minimal session indicators */}
      {collapsed && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-2">
          {sessions.map((session) => (
            <button
              key={session.name}
              onClick={() => onSelect(session.name)}
              className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold rounded-[var(--radius)]
                transition-colors cursor-pointer
                ${selectedSession === session.name
                  ? 'bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border)]'
                  : 'border-[length:var(--border-w)] border-transparent hover:bg-[var(--color-bg-alt)]'
                }
              `}
              title={session.name}
            >
              {session.name.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Bottom: collapse toggle */}
      <div className="border-t-[length:var(--border-w)] border-[var(--color-border-light)] p-1.5 flex justify-center">
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)]
            hover:text-[var(--color-fg)] transition-colors cursor-pointer rounded-[var(--radius)]
            hover:bg-[var(--color-bg-alt)]"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon
            icon={collapsed ? IconPanelLeftOpen : IconPanelLeftClose}
            width={16}
            height={16}
          />
        </button>
      </div>
    </aside>
  )
}
