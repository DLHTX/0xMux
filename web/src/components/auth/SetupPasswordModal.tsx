import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconEye, IconEyeOff, IconLock } from '../../lib/icons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { getPasswordStrength, getStrengthColor, getStrengthLabel } from '../../lib/password'
import type { SetupPasswordRequest } from '../../lib/types'

interface SetupPasswordModalProps {
  onSubmit: (data: SetupPasswordRequest) => Promise<void>
}

export function SetupPasswordModal({ onSubmit }: SetupPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const strength = getPasswordStrength(password)
  const passwordsMatch = password === confirm
  const canSubmit = password.length >= 8 && passwordsMatch

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!passwordsMatch) {
      setError('两次输入的密码不一致')
      return
    }

    if (password.length < 8) {
      setError('密码长度至少为8个字符')
      return
    }

    setLoading(true)
    try {
      await onSubmit({ password, confirm })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '设置密码失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[var(--color-bg)]/95 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] p-6 w-full max-w-md mx-4 shadow-[4px_4px_0_var(--color-border-light)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center bg-[var(--color-primary)] text-[var(--color-primary-fg)] rounded-[var(--radius)]">
            <Icon icon={IconLock} width={20} />
          </div>
          <div>
            <h2 className="text-base font-bold">设置访问密码</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              为 0xMux 设置密码以保护你的终端访问
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Password Input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--color-fg-muted)]">
              密码
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少8个字符"
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
              >
                <Icon icon={showPassword ? IconEyeOff : IconEye} width={16} />
              </button>
            </div>
            {/* Password Strength */}
            {password && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 bg-[var(--color-border-light)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%',
                      backgroundColor: getStrengthColor(strength),
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: getStrengthColor(strength) }}
                >
                  {getStrengthLabel(strength)}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--color-fg-muted)]">
              确认密码
            </label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入密码"
                className="pr-10"
                error={confirm && !passwordsMatch ? '密码不一致' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
              >
                <Icon icon={showConfirm ? IconEyeOff : IconEye} width={16} />
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
            disabled={!canSubmit || loading}
          >
            {loading ? '设置中...' : '设置密码'}
          </Button>
        </form>
      </div>
    </div>
  )
}
