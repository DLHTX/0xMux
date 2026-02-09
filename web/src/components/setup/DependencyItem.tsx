import { useState } from 'react'
import type { Dependency } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

interface DependencyItemProps {
  dep: Dependency
  onInstall: (name: string) => Promise<void>
  onSkip?: (name: string) => void
}

export function DependencyItem({ dep, onInstall, onSkip }: DependencyItemProps) {
  const { t } = useI18n()
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(dep.name)
    } finally {
      setInstalling(false)
    }
  }

  if (dep.installed) {
    return (
      <div className="flex items-center gap-3 py-2 text-sm">
        <span className="text-[var(--color-success)] font-bold">[ok]</span>
        <span className="font-bold">{dep.name}</span>
        {dep.version && (
          <span className="text-[var(--color-fg-muted)]">{dep.version}</span>
        )}
      </div>
    )
  }

  if (!dep.required) {
    return (
      <div className="flex items-center gap-3 py-2 text-sm">
        <span className="text-[var(--color-warning)] font-bold">[!]</span>
        <span className="text-[var(--color-warning)]">{dep.name}</span>
        <span className="text-[var(--color-fg-muted)]">— {t('dep.optional')}</span>
        <div className="ml-auto flex gap-2">
          {installing ? (
            <span className="text-[var(--color-warning)] animate-spin">~</span>
          ) : (
            <>
              <button
                onClick={handleInstall}
                className="text-xs px-2 py-0.5 border-[length:var(--border-w)] border-[var(--color-warning)] text-[var(--color-warning)] rounded-[var(--radius)]
                  hover:bg-[var(--color-warning)] hover:text-[var(--color-bg)] transition-colors font-bold"
              >
                {t('dep.install')}
              </button>
              {onSkip && (
                <button
                  onClick={() => onSkip(dep.name)}
                  className="text-xs px-2 py-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  {t('dep.skip')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <span className="text-[var(--color-danger)] font-bold">[x]</span>
      <span className="text-[var(--color-danger)] font-bold">{dep.name}</span>
      <span className="text-[var(--color-fg-muted)]">— {t('dep.notFound')}</span>
      <div className="ml-auto">
        {installing ? (
          <span className="text-[var(--color-fg-muted)] animate-spin">~</span>
        ) : (
          <button
            onClick={handleInstall}
            className="text-xs px-2 py-0.5 border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)]
              hover:bg-[var(--color-danger)] hover:text-[var(--color-bg)] transition-colors font-bold"
          >
            {t('dep.install')}
          </button>
        )}
      </div>
    </div>
  )
}
