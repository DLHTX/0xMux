import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { IconX, IconShield, IconLogOut, IconGlobe, IconInfo, IconEye, IconEyeOff, IconCode } from '../../lib/icons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tabs } from '../ui/Tabs'
import { useTheme } from '../../hooks/useTheme'
import { useI18n } from '../../hooks/useI18n'
import { useSettings } from '../../hooks/useSettings'
import { getConfig, checkUpdate, doUpdate } from '../../lib/api'
import {
  PRESETS,
  FONT_OPTIONS,
  type PresetName,
  type ThemeTokens,
} from '../../lib/theme'
import { LOCALES, type Locale, type MessageKey } from '../../lib/i18n'
import { EDITOR_SKINS, EDITOR_SKIN_KEYS, getEditorSkinPalette } from '../../lib/editor-skins'
import type {
  ChangePasswordRequest,
  EditorSkin,
  ModalBlur,
  UserSettings,
} from '../../lib/types'

const PRESET_KEYS = Object.keys(PRESETS) as PresetName[]

const PRIMARY_COLORS = [
  { label: 'Black', value: '#1a1a1a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Pink', value: '#db2777' },
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onChangePassword: (data: ChangePasswordRequest) => Promise<void>
  onLogout: () => void
}

export function SettingsModal({ open, onClose, onChangePassword, onLogout }: SettingsModalProps) {
  const { tokens, preset, mode, setToken, setPreset, toggleMode, resetOverrides } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const { settings, updateSettings } = useSettings()

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50"
        style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-[90vw] max-h-[80vh] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] shadow-[4px_4px_0_var(--color-border-light)] z-50 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[length:var(--border-w)] border-[var(--color-border)]">
          <h2 className="text-base font-bold">设置</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            <Icon icon={IconX} width={20} />
          </button>
        </div>

        {/* Tabs Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs
            tabs={[
              {
                id: 'appearance',
                label: '外观',
                content: <AppearanceTab
                  tokens={tokens}
                  preset={preset}
                  mode={mode}
                  locale={locale}
                  setToken={setToken}
                  setPreset={setPreset}
                  toggleMode={toggleMode}
                  setLocale={setLocale}
                  resetOverrides={resetOverrides}
                  t={t}
                />,
              },
              {
                id: 'editor',
                label: '编辑器',
                content: <EditorTab settings={settings} updateSettings={updateSettings} />,
              },
              {
                id: 'security',
                label: '安全',
                content: <SecurityTab onChangePassword={onChangePassword} onLogout={onLogout} />,
              },
              {
                id: 'external',
                label: '网络',
                content: <ExternalAccessTab />,
              },
              {
                id: 'about',
                label: '关于',
                content: <AboutTab />,
              },
            ]}
            defaultTab="appearance"
          />
        </div>
      </div>
    </>
  )
}

// ── 外观 Tab ──

function AppearanceTab({
  tokens,
  preset,
  mode,
  locale,
  setToken,
  setPreset,
  toggleMode,
  setLocale,
  resetOverrides,
  t,
}: {
  tokens: ThemeTokens
  preset: PresetName
  mode: 'light' | 'dark'
  locale: Locale
  setToken: (key: keyof ThemeTokens, value: string) => void
  setPreset: (preset: PresetName) => void
  toggleMode: () => void
  setLocale: (locale: Locale) => void
  resetOverrides: () => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}) {
  const [section, setSection] = useState<string | null>('lang')

  const toggle = (s: string) => setSection(section === s ? null : s)

  const radiusNum = parseInt(tokens.radius)
  const borderWNum = parseInt(tokens.borderW)
  const scaleNum = parseFloat(tokens.fontScale)

  return (
    <div className="flex flex-col gap-5">
      {/* Language */}
      <Section title={t('theme.language')} open={section === 'lang'} onToggle={() => toggle('lang')}>
        <div className="flex gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.value}
              onClick={() => setLocale(l.value)}
              className={`
                flex-1 px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors
                ${
                  locale === l.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                    : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)]'
                }
              `}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Presets */}
      <Section title={t('theme.presets')} open={section === 'presets'} onToggle={() => toggle('presets')}>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`
                px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors
                ${
                  preset === key
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                    : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)]'
                }
              `}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
      </Section>

      {/* Mode */}
      <Section title={t('theme.mode')} open={section === 'mode'} onToggle={() => toggle('mode')}>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { if (mode !== m) toggleMode() }}
              className={`
                flex-1 px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors
                ${
                  mode === m
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                    : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)]'
                }
              `}
            >
              {m === 'light' ? t('theme.light') : t('theme.dark')}
            </button>
          ))}
        </div>
      </Section>

      {/* Primary Color */}
      <Section title={t('theme.primaryColor')} open={section === 'color'} onToggle={() => toggle('color')}>
        <div className="flex flex-wrap gap-2">
          {PRIMARY_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setToken('colorPrimary', c.value)}
              className="w-8 h-8 border-[length:var(--border-w)] rounded-[var(--radius)] transition-transform hover:scale-110"
              style={{
                backgroundColor: c.value,
                borderColor: tokens.colorPrimary === c.value ? 'var(--color-fg)' : 'transparent',
              }}
              title={c.label}
            />
          ))}
          <label className="relative w-8 h-8" title="Custom color">
            <input
              type="color"
              value={tokens.colorPrimary}
              onChange={(e) => setToken('colorPrimary', e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0"
            />
            <span className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs font-bold text-[var(--color-fg-muted)]">
              +
            </span>
          </label>
        </div>
      </Section>

      {/* Border */}
      <Section title={t('theme.border')} open={section === 'border'} onToggle={() => toggle('border')}>
        <div className="flex flex-col gap-3">
          <SliderRow
            label={t('theme.borderWidth')}
            value={borderWNum}
            min={1}
            max={3}
            step={1}
            display={`${borderWNum}px`}
            onChange={(v) => setToken('borderW', `${v}px`)}
          />
          <SliderRow
            label={t('theme.borderRadius')}
            value={radiusNum}
            min={0}
            max={12}
            step={2}
            display={`${radiusNum}px`}
            onChange={(v) => setToken('radius', `${v}px`)}
          />
        </div>
      </Section>

      {/* Font */}
      <Section title={t('theme.font')} open={section === 'font'} onToggle={() => toggle('font')}>
        <div className="flex flex-col gap-3">
          <FontSelect
            label={t('theme.fontBody')}
            value={tokens.fontBody}
            onChange={(v) => {
              setToken('fontBody' as keyof ThemeTokens, v)
              setToken('fontHeading' as keyof ThemeTokens, v)
            }}
          />
          <FontSelect
            label={t('theme.fontMono')}
            value={tokens.fontMono}
            onChange={(v) => setToken('fontMono' as keyof ThemeTokens, v)}
            monoOnly
          />
        </div>
      </Section>

      {/* Font Scale */}
      <Section title={t('theme.fontSize')} open={section === 'scale'} onToggle={() => toggle('scale')}>
        <SliderRow
          label={t('theme.fontScale')}
          value={scaleNum}
          min={0.85}
          max={1.2}
          step={0.05}
          display={`${Math.round(scaleNum * 100)}%`}
          onChange={(v) => setToken('fontScale', String(Math.round(v * 100) / 100))}
        />
      </Section>

      {/* Reset */}
      <button
        onClick={resetOverrides}
        className="w-full py-2 text-xs font-bold text-[var(--color-fg-muted)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
          hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
      >
        {t('theme.reset')}
      </button>
    </div>
  )
}

// ── 编辑器 Tab ──

function EditorTab({ settings, updateSettings }: {
  settings: UserSettings
  updateSettings: (partial: Partial<UserSettings>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Icon icon={IconCode} width={16} />
          编辑器设置
        </h3>
      </div>

      {/* @ Trigger Toggle */}
      <div className="flex items-center justify-between py-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="text-xs font-bold">@ 快速打开文件</div>
          <div className="text-[10px] text-[var(--color-fg-muted)] mt-0.5">
            在终端中输入 @ 时弹出快速文件搜索（Ctrl+P 始终可用）
          </div>
        </div>
        <button
          onClick={() => updateSettings({ quickFileTrigger: !settings.quickFileTrigger })}
          className={`shrink-0 w-5 h-5 border-[length:var(--border-w)] flex items-center justify-center transition-colors ${
            settings.quickFileTrigger
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
              : 'border-[var(--color-border-light)] bg-transparent'
          }`}
        >
          {settings.quickFileTrigger && (
            <span className="text-[10px] font-bold text-[var(--color-primary-fg)]">✓</span>
          )}
        </button>
      </div>

      {/* Modal Blur */}
      <div className="flex items-center justify-between py-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="text-xs font-bold">弹框背景模糊</div>
          <div className="text-[10px] text-[var(--color-fg-muted)] mt-0.5">
            弹框遮罩层的背景模糊强度
          </div>
        </div>
        <div className="shrink-0 flex gap-1">
          {([['none', '无'], ['sm', '低'], ['md', '中'], ['lg', '高']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => updateSettings({ modalBlur: value as ModalBlur })}
              className={`px-2 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] transition-colors ${
                settings.modalBlur === value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                  : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <div className="text-xs font-bold mb-2">编辑器皮肤</div>
        <div className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          Monaco 与 Markdown 共用同一套皮肤，自动跟随亮/暗模式切换
        </div>
        <div className="grid grid-cols-2 gap-2">
          {EDITOR_SKIN_KEYS.map((skin) => (
            <EditorSkinCard
              key={skin}
              skin={skin}
              selected={settings.editorSkin === skin}
              onSelect={(value) => updateSettings({ editorSkin: value })}
            />
          ))}
        </div>
      </div>

      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <div className="text-xs font-bold mb-2">Markdown 编辑体验</div>
        <div className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          Markdown 固定为「所见即所得」并隐藏顶部工具栏，只保留渲染编辑区
        </div>
      </div>
    </div>
  )
}

// ── 安全 Tab ──

function SecurityTab({ onChangePassword, onLogout }: {
  onChangePassword: (data: ChangePasswordRequest) => Promise<void>
  onLogout: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('新密码与确认密码不一致')
      return
    }

    if (newPassword.length < 8) {
      setError('新密码长度至少为8个字符')
      return
    }

    setLoading(true)
    try {
      await onChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 修改密码 */}
      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Icon icon={IconShield} width={16} />
          修改密码
        </h3>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="当前密码"
              label="当前密码"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-2 top-[30px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              <Icon icon={showCurrent ? IconEyeOff : IconEye} width={16} />
            </button>
          </div>

          <div className="relative">
            <Input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少8个字符）"
              label="新密码"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-[30px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              <Icon icon={showNew ? IconEyeOff : IconEye} width={16} />
            </button>
          </div>

          <div className="relative">
            <Input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              label="确认新密码"
              className="pr-10"
              error={confirmPassword && newPassword !== confirmPassword ? '密码不一致' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-2 top-[30px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              <Icon icon={showConfirm ? IconEyeOff : IconEye} width={16} />
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 bg-[var(--color-danger)]/10 border-[length:var(--border-w)] border-[var(--color-danger)] rounded-[var(--radius)] text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          {success && (
            <div className="px-3 py-2 bg-[var(--color-success)]/10 border-[length:var(--border-w)] border-[var(--color-success)] rounded-[var(--radius)] text-xs text-[var(--color-success)]">
              密码已修改
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={!currentPassword || !newPassword || !confirmPassword || loading}
          >
            {loading ? '保存中...' : '保存'}
          </Button>
        </form>
      </div>

      {/* 退出登录 */}
      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Icon icon={IconLogOut} width={16} />
          会话管理
        </h3>
        <Button
          variant="danger"
          onClick={onLogout}
          className="w-full"
        >
          退出登录
        </Button>
      </div>
    </div>
  )
}

// ── 网络信息 Tab ──

function ExternalAccessTab() {
  const [serverInfo, setServerInfo] = useState<{ port: number; host: string; version: string; local_ips: string[] } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    getConfig()
      .then((data) => setServerInfo(data))
      .catch(() => {})
  }, [])

  const currentUrl = window.location.origin
  const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80')

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Network info header */}
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
          <Icon icon={IconGlobe} width={16} />
          访问地址
        </h3>
        <p className="text-xs text-[var(--color-fg-muted)]">
          其他设备可通过局域网地址访问此终端
        </p>
      </div>

      {/* URLs */}
      <div className="flex flex-col gap-2 text-xs">
        {/* Current / localhost */}
        <UrlRow
          label="本机"
          url={currentUrl}
          copied={copied === currentUrl}
          onCopy={() => handleCopy(currentUrl)}
        />

        {/* LAN URLs — one row per detected private IP */}
        {serverInfo?.local_ips.map((ip) => {
          const lanUrl = `${window.location.protocol}//${ip}:${currentPort}`
          if (lanUrl === currentUrl) return null
          return (
            <UrlRow
              key={ip}
              label="局域网"
              url={lanUrl}
              copied={copied === lanUrl}
              onCopy={() => handleCopy(lanUrl)}
            />
          )
        })}
      </div>

      {/* Server info */}
      {serverInfo && (
        <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
          <h4 className="text-xs font-bold text-[var(--color-fg-muted)] mb-2">服务器信息</h4>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">绑定地址</span>
              <code className="font-mono">{serverInfo.host}:{serverInfo.port}</code>
            </div>
            {serverInfo.local_ips.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-fg-muted)]">局域网 IP</span>
                <code className="font-mono">{serverInfo.local_ips.join(', ')}</code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 关于 Tab ──

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up_to_date'; current: string }
  | { phase: 'available'; current: string; latest: string }
  | { phase: 'updating' }
  | { phase: 'updated' }
  | { phase: 'error'; message: string }

function AboutTab() {
  const [version, setVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' })

  useEffect(() => {
    getConfig()
      .then((data) => setVersion(data.version))
      .catch(() => {})
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateState({ phase: 'checking' })
    try {
      const res = await checkUpdate()
      if (res.has_update && res.latest) {
        setUpdateState({ phase: 'available', current: res.current, latest: res.latest })
      } else {
        setUpdateState({ phase: 'up_to_date', current: res.current })
      }
    } catch {
      setUpdateState({ phase: 'error', message: '检查更新失败' })
    }
  }

  const handleDoUpdate = async () => {
    setUpdateState({ phase: 'updating' })
    try {
      const res = await doUpdate()
      if (res.status === 'ok') {
        setUpdateState({ phase: 'updated' })
      } else {
        setUpdateState({ phase: 'error', message: res.message })
      }
    } catch {
      setUpdateState({ phase: 'error', message: '更新失败' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
          <Icon icon={IconInfo} width={16} />
          0xMux
        </h3>
        <p className="text-xs text-[var(--color-fg-muted)]">
          基于 Web 的 tmux 终端管理器
        </p>
      </div>

      {/* Version & Update */}
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-fg-muted)]">当前版本</span>
          <div className="flex items-center gap-2">
            <code className="font-mono">v{version ?? '...'}</code>
            {updateState.phase === 'idle' && (
              <button
                onClick={handleCheckUpdate}
                className="px-2 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
                  hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                检查更新
              </button>
            )}
            {updateState.phase === 'checking' && (
              <span className="text-[var(--color-fg-muted)] text-[10px]">检查中...</span>
            )}
            {updateState.phase === 'up_to_date' && (
              <span className="text-[var(--color-success)] text-[10px] font-bold">已是最新版本</span>
            )}
          </div>
        </div>
      </div>

      {/* Update available */}
      {updateState.phase === 'available' && (
        <div className="px-3 py-2 bg-[var(--color-primary)]/10 border-[length:var(--border-w)] border-[var(--color-primary)] rounded-[var(--radius)] flex items-center justify-between">
          <span className="text-xs font-bold">
            v{updateState.current} → v{updateState.latest}
          </span>
          <button
            onClick={handleDoUpdate}
            className="px-3 py-1 text-[10px] font-bold bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-[length:var(--border-w)] border-[var(--color-primary)] rounded-[var(--radius)]
              hover:opacity-90 transition-opacity cursor-pointer"
          >
            立即更新
          </button>
        </div>
      )}

      {/* Updating */}
      {updateState.phase === 'updating' && (
        <div className="px-3 py-2 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
          更新中，请稍候...
        </div>
      )}

      {/* Updated */}
      {updateState.phase === 'updated' && (
        <div className="px-3 py-2 bg-[var(--color-success)]/10 border-[length:var(--border-w)] border-[var(--color-success)] rounded-[var(--radius)] text-xs text-[var(--color-success)] font-bold">
          更新完成，服务正在重启...
        </div>
      )}

      {/* Error */}
      {updateState.phase === 'error' && (
        <div className="px-3 py-2 bg-[var(--color-danger)]/10 border-[length:var(--border-w)] border-[var(--color-danger)] rounded-[var(--radius)] flex items-center justify-between">
          <span className="text-xs text-[var(--color-danger)]">{updateState.message}</span>
          <button
            onClick={handleCheckUpdate}
            className="px-2 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)]
              hover:opacity-80 transition-opacity cursor-pointer"
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}

/** Single URL row with copy button */
function UrlRow({ label, url, copied, onCopy }: {
  label: string
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 bg-[var(--color-bg-alt)] rounded-[var(--radius)]">
      <span className="text-[var(--color-fg-muted)] shrink-0 mr-3">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <code className="font-mono text-[var(--color-primary)] truncate">{url}</code>
        <button
          onClick={onCopy}
          className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
            hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </div>
    </div>
  )
}

// ── Helper Components ──

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-xs font-bold uppercase text-[var(--color-fg-muted)] mb-2 hover:text-[var(--color-fg)] transition-colors"
      >
        {title}
        <span className="text-[10px]">{open ? '-' : '+'}</span>
      </button>
      {open && children}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-fg-muted)] w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="brutalist-slider flex-1"
      />
      <span className="text-xs font-bold w-10 text-right">{display}</span>
    </div>
  )
}

function EditorSkinCard({
  skin,
  selected,
  onSelect,
}: {
  skin: EditorSkin
  selected: boolean
  onSelect: (skin: EditorSkin) => void
}) {
  const option = EDITOR_SKINS[skin]
  const light = getEditorSkinPalette(skin, 'light')
  const dark = getEditorSkinPalette(skin, 'dark')

  return (
    <button
      type="button"
      onClick={() => onSelect(skin)}
      className={`text-left p-2 border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-bg-alt)]'
          : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold">{option.label}</span>
        {selected && <span className="text-[10px] text-[var(--color-primary)] font-bold">ACTIVE</span>}
      </div>
      <div className="text-[10px] text-[var(--color-fg-muted)] mb-2">{option.description}</div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-muted)]">
          <span>L</span>
          <span className="w-3 h-3 border border-[var(--color-border-light)]" style={{ backgroundColor: light.textColor }} />
          <span className="w-3 h-3 border border-[var(--color-border-light)]" style={{ backgroundColor: light.accentColor }} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-muted)]">
          <span>D</span>
          <span className="w-3 h-3 border border-[var(--color-border-light)]" style={{ backgroundColor: dark.textColor }} />
          <span className="w-3 h-3 border border-[var(--color-border-light)]" style={{ backgroundColor: dark.accentColor }} />
        </div>
      </div>
    </button>
  )
}

function FontSelect({
  label,
  value,
  onChange,
  monoOnly = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  monoOnly?: boolean
}) {
  const options = monoOnly
    ? FONT_OPTIONS.filter((f) => f.value.includes('monospace') || f.value.includes('system-ui'))
    : FONT_OPTIONS

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-fg-muted)] w-14 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] px-2 py-1 text-xs outline-none appearance-none font-[inherit]
          focus:border-[var(--color-border)] transition-colors"
      >
        {options.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}
