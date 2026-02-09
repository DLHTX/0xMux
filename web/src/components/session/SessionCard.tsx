import { useState, useRef, useEffect } from 'react'
import type { TmuxSession } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface SessionCardProps {
  session: TmuxSession
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
}

export function SessionCard({ session, onDelete, onRename }: SessionCardProps) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== session.name) {
      onRename(session.name, trimmed)
    } else {
      setEditValue(session.name)
    }
    setEditing(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      onDelete(session.name)
    } else if (confirm(t('session.deleteConfirm', { name: session.name }))) {
      onDelete(session.name)
    }
  }

  return (
    <div
      className={`
        group relative border-[length:var(--border-w)] p-4 transition-colors cursor-pointer rounded-[var(--radius)]
        hover:bg-[var(--color-bg-alt)]
        ${
          session.attached
            ? 'border-[var(--color-border)] bg-[var(--color-bg-alt)]'
            : 'border-[var(--color-border-light)]'
        }
      `}
    >
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
          text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] text-xs w-6 h-6 flex items-center justify-center
          border-[length:var(--border-w)] border-transparent hover:border-[var(--color-danger)] rounded-[var(--radius)]"
      >
        x
      </button>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-2 h-2 shrink-0 rounded-[var(--radius)] ${
              session.attached
                ? 'bg-[var(--color-success)]'
                : 'bg-[var(--color-border-light)]'
            }`}
          />
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
              className="bg-transparent border-b-[length:var(--border-w)] border-[var(--color-border)] outline-none text-sm font-bold
                w-full min-w-0"
            />
          ) : (
            <span
              className="font-bold text-sm truncate"
              onDoubleClick={() => {
                setEditValue(session.name)
                setEditing(true)
              }}
            >
              {session.name}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--color-fg-muted)] ml-2 shrink-0">
          {t('session.windows', { n: session.windows })}
        </span>
      </div>

      <div className="text-xs text-[var(--color-fg-muted)]">
        {session.attached ? (
          <span className="text-[var(--color-success)] font-bold text-[10px]">{t('session.attached')}</span>
        ) : (
          <span className="text-[var(--color-fg-faint)]">{t('session.detached')}</span>
        )}
      </div>
    </div>
  )
}
