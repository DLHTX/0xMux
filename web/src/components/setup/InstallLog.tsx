import { useEffect, useRef, useState } from 'react'
import type { InstallLogData, InstallCompleteData, InstallErrorData } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'

export function InstallLog() {
  const { t } = useI18n()
  const [lines, setLines] = useState<{ text: string; stream: string }[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')
  const [errorInfo, setErrorInfo] = useState<InstallErrorData | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleLog = (e: Event) => {
      const data = (e as CustomEvent<InstallLogData>).detail
      setLines((prev) => [...prev, { text: data.line, stream: data.stream }])
      setStatus('running')
    }

    const handleComplete = (e: Event) => {
      const data = (e as CustomEvent<InstallCompleteData>).detail
      setStatus(data.success ? 'success' : 'failed')
    }

    const handleError = (e: Event) => {
      const data = (e as CustomEvent<InstallErrorData>).detail
      setErrorInfo(data)
      setStatus('failed')
    }

    window.addEventListener('install-log', handleLog)
    window.addEventListener('install-complete', handleComplete)
    window.addEventListener('install-error', handleError)

    return () => {
      window.removeEventListener('install-log', handleLog)
      window.removeEventListener('install-complete', handleComplete)
      window.removeEventListener('install-error', handleError)
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [lines])

  if (lines.length === 0 && status === 'idle') return null

  return (
    <div className="mt-4 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden">
      <div
        ref={scrollRef}
        className="bg-[var(--color-bg-alt)] p-3 max-h-48 overflow-y-auto text-xs leading-5"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={line.stream === 'stderr' ? 'text-[var(--color-warning)]' : 'text-[var(--color-fg)]'}
          >
            {line.text}
          </div>
        ))}

        {status === 'success' && (
          <div className="text-[var(--color-success)] font-bold mt-1">{t('dep.installOk')}</div>
        )}
        {status === 'failed' && (
          <>
            <div className="text-[var(--color-danger)] font-bold mt-1">{t('dep.installFail')}</div>
            {errorInfo?.manual_command && (
              <div className="text-[var(--color-fg-muted)] mt-1">
                {t('dep.tryManually')}{' '}
                <code
                  className="text-[var(--color-fg)] cursor-pointer hover:underline"
                  onClick={() => navigator.clipboard.writeText(errorInfo.manual_command)}
                >
                  {errorInfo.manual_command}
                </code>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
