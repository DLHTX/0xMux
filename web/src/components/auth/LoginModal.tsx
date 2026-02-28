import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { IconEye, IconEyeOff, IconLock } from '../../lib/icons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useI18n } from '../../hooks/useI18n'
import type { LoginRequest } from '../../lib/types'

interface LoginModalProps {
  onSubmit: (data: LoginRequest) => Promise<void>
}

export function LoginModal({ onSubmit }: LoginModalProps) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [lockUntil, setLockUntil] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 倒计时
  useEffect(() => {
    if (!lockUntil) return

    const timer = setInterval(() => {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockUntil(null)
        setCountdown(0)
        setFailCount(0)
        setError('')
      } else {
        setCountdown(remaining)
      }
    }, 100)

    return () => clearInterval(timer)
  }, [lockUntil])

  const isLocked = lockUntil !== null && Date.now() < lockUntil

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return

    setError('')
    setLoading(true)

    try {
      await onSubmit({ password })
      // 登录成功，重置状态
      setFailCount(0)
      setPassword('')
    } catch (err: unknown) {
      // 登录失败
      const newFailCount = failCount + 1
      setFailCount(newFailCount)

      // 429 Too Many Requests
      if (err && typeof err === 'object' && 'error' in err && err.error === 'too_many_requests') {
        const lockMinutes = 5
        setLockUntil(Date.now() + lockMinutes * 60 * 1000)
        setError(t('login.tooFrequent', { minutes: lockMinutes }))
      } else {
        setError(t('login.wrongPassword'))
      }

      // 清空输入框并抖动
      setPassword('')
      setShake(true)
      setTimeout(() => setShake(false), 500)

      // 聚焦输入框
      setTimeout(() => inputRef.current?.focus(), 100)

      // 5次错误后锁定
      if (newFailCount >= 5) {
        const lockMinutes = 5
        setLockUntil(Date.now() + lockMinutes * 60 * 1000)
        setError(t('login.tooManyAttempts', { minutes: lockMinutes }))
      }
    } finally {
      setLoading(false)
    }
  }

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-[var(--color-bg)]/95 flex items-center justify-center z-50" style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}>
      <div
        className={`bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] p-6 w-full max-w-md mx-4 shadow-[4px_4px_0_var(--color-border-light)] ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded-[var(--radius)]">
            <Icon icon={IconLock} width={20} />
          </div>
          <div>
            <h2 className="text-base font-bold">{t('login.title')}</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {t('login.subtitle')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Password Input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--color-fg-muted)]">
              {t('login.password')}
            </label>
            <div className="relative">
              <Input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.placeholder')}
                className="pr-10"
                autoFocus
                disabled={isLocked}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                disabled={isLocked}
              >
                <Icon icon={showPassword ? IconEyeOff : IconEye} width={16} />
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-3 py-2 bg-[var(--color-danger)]/10 border-[length:var(--border-w)] border-[var(--color-danger)] rounded-[var(--radius)] text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2 shadow-[2px_2px_0_var(--color-border-light)]"
            disabled={!password || loading || isLocked}
          >
            {isLocked
              ? t('login.wait', { time: formatCountdown(countdown) })
              : loading
                ? t('login.loading')
                : t('login.submit')}
          </Button>
        </form>

        {/* Fail Count Indicator */}
        {failCount > 0 && failCount < 5 && (
          <div className="mt-3 text-[10px] text-[var(--color-fg-muted)] text-center">
            {t('login.attempts', { count: failCount })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
