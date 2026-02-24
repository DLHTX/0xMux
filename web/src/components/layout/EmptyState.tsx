import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconPlus } from '../../lib/icons'
import { VaultBoyIcon } from './VaultBoyIcon'

interface EmptyStateProps {
  onQuickCreate: () => Promise<void>
  onCustomCreate: () => void
}

export function EmptyState({ onQuickCreate, onCustomCreate }: EmptyStateProps) {
  const [creating, setCreating] = useState(false)

  const handleQuickCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      await onQuickCreate()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-8 max-w-md px-4">
        {/* Vault Boy + terminal prompt */}
        <div
          className="w-full border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] bg-[var(--color-bg-alt)] p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-[var(--color-danger)]" />
            <div className="w-2 h-2 bg-[var(--color-warning)]" />
            <div className="w-2 h-2 bg-[var(--color-success)]" />
          </div>

          {/* Vault Boy icon centered */}
          <div className="flex justify-center mb-3 opacity-40">
            <VaultBoyIcon size={48} className="text-[var(--color-primary)]" />
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

        {/* Quick create button */}
        <button
          onClick={handleQuickCreate}
          disabled={creating}
          className="flex items-center gap-2 px-6 py-3 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)]
            font-bold text-sm transition-colors cursor-pointer
            bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-[var(--color-primary)]
            hover:brightness-110
            active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon icon={IconPlus} width={16} height={16} />
          {creating ? 'Creating...' : 'New Session'}
        </button>

        {/* Custom create link */}
        <button
          onClick={onCustomCreate}
          className="text-xs text-[var(--color-fg-faint)] underline cursor-pointer hover:text-[var(--color-fg-muted)] transition-colors"
        >
          Custom settings...
        </button>
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
