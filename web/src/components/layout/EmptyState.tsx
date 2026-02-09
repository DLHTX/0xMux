import { Icon } from '@iconify/react'
import { IconPlus } from '../../lib/icons'

interface EmptyStateProps {
  onCreateClick: () => void
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-8 max-w-md px-4">
        {/* Terminal prompt with blinking cursor */}
        <div
          className="w-full border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] bg-[var(--color-bg-alt)] p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-[var(--color-danger)]" />
            <div className="w-2 h-2 bg-[var(--color-warning)]" />
            <div className="w-2 h-2 bg-[var(--color-success)]" />
          </div>
          <div className="flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)' }}>
            <span className="text-[var(--color-success)] text-sm font-bold">{'>'}</span>
            <span className="text-sm text-[var(--color-fg)]">
              Create your first tmux session...
            </span>
            <span
              className="inline-block w-[8px] h-[16px] bg-[var(--color-fg)] ml-0.5"
              style={{
                animation: 'blink 1s step-end infinite',
              }}
            />
          </div>
        </div>

        {/* Create button */}
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-6 py-3 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)]
            font-bold text-sm transition-colors cursor-pointer
            hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]
            active:scale-95"
        >
          <Icon icon={IconPlus} width={16} height={16} />
          New Session
        </button>

        {/* Hint text */}
        <p className="text-xs text-[var(--color-fg-faint)] text-center">
          Sessions let you organize terminal windows and persist them across connections.
        </p>
      </div>

      {/* CSS animation for cursor blink */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
