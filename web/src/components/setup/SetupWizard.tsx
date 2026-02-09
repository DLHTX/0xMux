import { useState } from 'react'
import type { SystemDepsResponse } from '../../lib/types'
import { DependencyItem } from './DependencyItem'
import { InstallLog } from './InstallLog'
import { useI18n } from '../../hooks/useI18n'
import * as api from '../../lib/api'

interface SetupWizardProps {
  deps: SystemDepsResponse
  onInstall: (name: string) => Promise<void>
  allReady: boolean
}

export function SetupWizard({ deps, onInstall, allReady }: SetupWizardProps) {
  const { t } = useI18n()
  const [restarting, setRestarting] = useState(false)

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await api.restartServer()
    } catch {
      // Expected — server will exit
    }

    const poll = async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        try {
          await api.getHealth()
          window.location.reload()
          return
        } catch {
          // Not ready yet
        }
      }
      setRestarting(false)
    }
    poll()
  }

  return (
    <div className="max-w-lg mx-auto mt-12">
      <div className="text-xs text-[var(--color-fg-muted)] mb-6">
        <span className="font-bold">$</span> {t('setup.command')}
      </div>

      <h2 className="text-lg font-extrabold mb-6 uppercase">{t('setup.title')}</h2>

      <div className="text-xs text-[var(--color-fg-muted)] mb-2">
        {t('setup.system')} {deps.os}/{deps.arch} — {deps.package_manager || t('setup.noPkgMgr')}
      </div>

      <div className="border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] p-4 mb-4">
        {deps.dependencies.map((dep) => (
          <DependencyItem key={dep.name} dep={dep} onInstall={onInstall} />
        ))}
      </div>

      <InstallLog />

      {allReady && (
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="mt-6 w-full py-2 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] font-bold text-sm
            hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {restarting ? (
            <span className="animate-pulse">{t('setup.reconnecting')}</span>
          ) : (
            t('setup.restart')
          )}
        </button>
      )}
    </div>
  )
}
