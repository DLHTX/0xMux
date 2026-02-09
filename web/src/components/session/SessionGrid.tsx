import type { TmuxSession } from '../../lib/types'
import { SessionCard } from './SessionCard'
import { useI18n } from '../../hooks/useI18n'

interface SessionGridProps {
  sessions: TmuxSession[]
  loading: boolean
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onCreateClick: () => void
}

export function SessionGrid({
  sessions,
  loading,
  onDelete,
  onRename,
  onCreateClick,
}: SessionGridProps) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="text-center py-20 text-[var(--color-fg-muted)]">
        <span className="animate-pulse">{t('grid.connecting')}</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map((session) => (
        <SessionCard
          key={session.name}
          session={session}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}

      <button
        onClick={onCreateClick}
        className="border-[length:var(--border-w)] border-dashed border-[var(--color-border-light)] rounded-[var(--radius)] p-4 flex items-center
          justify-center text-[var(--color-fg-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-fg)]
          transition-colors min-h-[100px]"
      >
        <span className="text-2xl font-bold">+</span>
      </button>

      {sessions.length === 0 && (
        <div className="col-span-full text-center py-10">
          <p className="text-[var(--color-fg-muted)] mb-2 font-bold">{t('grid.empty')}</p>
          <p className="text-xs text-[var(--color-fg-faint)]">{t('grid.emptyHint')}</p>
        </div>
      )}
    </div>
  )
}
