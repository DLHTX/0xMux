import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { IconTrash, IconEdit, IconLayoutGrid } from '../../lib/icons'
import type { TmuxSession } from '../../lib/types'
import { extractProjectName, getProjectColor } from '../../hooks/useSplitLayout'

interface SessionItemProps {
  session: TmuxSession
  selected: boolean
  onSelect: (name: string) => void
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  isNested?: boolean
}

export function SessionItem({
  session,
  selected,
  onSelect,
  onDelete,
  onRename,
  isNested = false,
}: SessionItemProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [longPressMenu, setLongPressMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Reset confirm state after timeout
  // useEffect(() => {
  //   if (!confirmDelete) return
  //   const timer = setTimeout(() => setConfirmDelete(false), 3000)
  //   return () => clearTimeout(timer)
  // }, [confirmDelete])

  // Close long-press menu on outside click
  useEffect(() => {
    if (!longPressMenu) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setLongPressMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [longPressMenu])

  // Long press handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchMoved.current = false
    const touch = e.touches[0]
    const x = touch.clientX
    const y = touch.clientY
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setLongPressMenu({ x, y })
      }
    }, 500)
  }, [])

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Project color
  const projectName = extractProjectName(session.name)
  const projectColor = getProjectColor(projectName)

  const handleRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== session.name) {
      onRename(session.name, trimmed)
    } else {
      setEditValue(session.name)
    }
    setEditing(false)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete(session.name)
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }

  /** Prevent draggable parent from capturing mousedown and suppressing click */
  const stopDragCapture = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      draggable={false}
      // onDragStart={(e) => {
      //   e.dataTransfer.setData('text/session-name', session.name)
      //   e.dataTransfer.effectAllowed = 'move'
      // }}
      onClick={() => {
        if (!longPressMenu) onSelect(session.name)
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`
        group relative flex items-center gap-2.5 py-2.5 cursor-grab transition-colors
        border-l-[length:var(--border-w)] select-none
        ${isNested ? 'pl-7 pr-3' : 'px-3'}
        ${selected
          ? 'bg-[var(--color-bg-alt)] border-l-[var(--color-primary)]'
          : 'border-l-transparent hover:bg-[var(--color-bg-alt)]'
        }
      `}
    >
      {/* Status dot with project color */}
      <div
        className="w-2.5 h-2.5 shrink-0 rounded-[var(--radius)]"
        style={{
          background: session.attached ? projectColor : 'var(--color-border-light)',
          animation: session.attached ? 'breathe 2s ease-in-out infinite' : undefined,
        }}
      />

      {/* LIVE label for currently selected attached session */}
      {selected && session.attached && (
        <span className="text-[9px] font-bold shrink-0" style={{ color: projectColor }}>
          LIVE
        </span>
      )}

      {/* Name */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setEditValue(session.name)
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-b-[length:var(--border-w)] border-[var(--color-border)] outline-none text-xs font-bold"
          />
        ) : (
          <span
            className="text-xs font-bold truncate block"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditValue(session.name)
              setEditing(true)
            }}
          >
            {session.name}
          </span>
        )}
      </div>

      {/* Window count badge */}
      <div className="flex items-center gap-1 shrink-0">
        <Icon icon={IconLayoutGrid} width={10} height={10} className="text-[var(--color-fg-muted)]" />
        <span className="text-[10px] text-[var(--color-fg-muted)] tabular-nums">
          {session.windows}
        </span>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDeleteClick}
        onMouseDown={(e) => e.stopPropagation()}
        className={`
          shrink-0 w-5 h-5 flex items-center justify-center transition-all text-[10px]
          ${confirmDelete
            ? 'opacity-100 text-[var(--color-danger)]'
            : 'opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]'
          }
        `}
        title={confirmDelete ? 'Click again to confirm' : 'Delete session'}
      >
        {confirmDelete ? (
          <span className="text-[10px] font-bold">?</span>
        ) : (
          <Icon icon={IconTrash} width={12} height={12} />
        )}
      </button>

      {/* Breathing animation for attached sessions */}
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Long-press context menu (mobile) */}
      {longPressMenu && (
        <div
          ref={menuRef}
          className="fixed z-[150] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] py-1 min-w-[140px] shadow-lg"
          style={{ left: longPressMenu.x, top: longPressMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLongPressMenu(null)
              setEditValue(session.name)
              setEditing(true)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--color-bg-alt)] transition-colors"
          >
            <Icon icon={IconEdit} width={14} height={14} />
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLongPressMenu(null)
              onDelete(session.name)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-[var(--color-danger)] hover:bg-[var(--color-bg-alt)] transition-colors"
          >
            <Icon icon={IconTrash} width={14} height={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
