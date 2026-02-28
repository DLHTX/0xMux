import { useState, useEffect } from 'react'
import { useCrtClose } from '../../hooks/useCrtClose'
import { Icon } from '@iconify/react'
import { IconX, IconShield, IconLogOut, IconGlobe, IconInfo, IconEye, IconEyeOff, IconCode, IconTrash } from '../../lib/icons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tabs } from '../ui/Tabs'
import { Slider, SliderRow } from '../ui/Slider'
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
  const { visible, closing } = useCrtClose(open)

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${closing ? 'pipboy-crt-backdrop-close' : ''}`}
      style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Modal */}
      <div
        className={`${closing ? 'pipboy-crt-close-center' : 'pipboy-crt-open-center'} relative w-[600px] max-w-[90vw] max-h-[80vh] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] shadow-[4px_4px_0_var(--color-border-light)] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[length:var(--border-w)] border-[var(--color-border)]">
          <h2 className="text-base font-bold">{t('settings.title')}</h2>
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
                label: t('settings.appearance'),
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
                label: t('settings.editor'),
                content: <EditorTab settings={settings} updateSettings={updateSettings} />,
              },
              {
                id: 'security',
                label: t('settings.security'),
                content: <SecurityTab onChangePassword={onChangePassword} onLogout={onLogout} />,
              },
              {
                id: 'external',
                label: t('settings.network'),
                content: <ExternalAccessTab />,
              },
              {
                id: 'about',
                label: t('settings.about'),
                content: <AboutTab />,
              },
            ]}
            defaultTab="appearance"
          />
        </div>
      </div>
    </div>
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
  const radiusNum = parseInt(tokens.radius)
  const borderWNum = parseInt(tokens.borderW)
  const scaleNum = parseFloat(tokens.fontScale)

  return (
    <div className="flex flex-col gap-5">
      {/* Language */}
      <Section title={t('theme.language')} open onToggle={() => {}}>
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
      <Section title={t('theme.presets')} open onToggle={() => {}}>
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
      <Section title={t('theme.mode')} open onToggle={() => {}}>
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
      <Section title={t('theme.primaryColor')} open onToggle={() => {}}>
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
      <Section title={t('theme.border')} open onToggle={() => {}}>
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
      <Section title={t('theme.font')} open onToggle={() => {}}>
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
      <Section title={t('theme.fontSize')} open onToggle={() => {}}>
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
  const { t } = useI18n()
  const BLUR_LABELS: Record<string, MessageKey> = { none: 'editorSettings.blurNone', sm: 'editorSettings.blurSm', md: 'editorSettings.blurMd', lg: 'editorSettings.blurLg' }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Icon icon={IconCode} width={16} />
          {t('editorSettings.title')}
        </h3>
      </div>

      {/* @ Trigger Toggle */}
      <div className="flex items-center justify-between py-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="text-xs font-bold">{t('editorSettings.quickFile')}</div>
          <div className="text-[10px] text-[var(--color-fg-muted)] mt-0.5">
            {t('editorSettings.quickFileHint')}
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
          <div className="text-xs font-bold">{t('editorSettings.modalBlur')}</div>
          <div className="text-[10px] text-[var(--color-fg-muted)] mt-0.5">
            {t('editorSettings.modalBlurHint')}
          </div>
        </div>
        <div className="shrink-0 flex gap-1">
          {(['none', 'sm', 'md', 'lg'] as const).map((value) => (
            <button
              key={value}
              onClick={() => updateSettings({ modalBlur: value as ModalBlur })}
              className={`px-2 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] transition-colors ${
                settings.modalBlur === value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                  : 'border-[var(--color-border-light)] text-[var(--color-fg-muted)] hover:border-[var(--color-border)]'
              }`}
            >
              {t(BLUR_LABELS[value])}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <div className="text-xs font-bold mb-2">{t('editorSettings.skin')}</div>
        <div className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          {t('editorSettings.skinHint')}
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
        <div className="text-xs font-bold mb-2">{t('editorSettings.markdown')}</div>
        <div className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          {t('editorSettings.markdownHint')}
        </div>
      </div>

      {/* Editor opacity */}
      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <div className="text-xs font-bold mb-2">{t('editorSettings.opacity')}</div>
        <div className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          {t('editorSettings.opacityHint')}
        </div>
        <div className="flex items-center gap-3">
          <Slider
            value={settings.editorOpacity}
            min={0.3}
            max={1.0}
            step={0.05}
            onChange={(v) => updateSettings({ editorOpacity: v })}
            className="flex-1"
          />
          <span className="text-xs font-bold w-10 text-right">{Math.round(settings.editorOpacity * 100)}%</span>
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
  const { t } = useI18n()
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
      setError(t('security.mismatch'))
      return
    }

    if (newPassword.length < 8) {
      setError(t('security.tooShort'))
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
      setError(err instanceof Error ? err.message : t('security.changeFailed'))
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
          {t('security.changePassword')}
        </h3>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('security.currentPassword')}
              label={t('security.currentPassword')}
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
              placeholder={t('security.newPasswordPlaceholder')}
              label={t('security.newPassword')}
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
              placeholder={t('security.confirmPassword')}
              label={t('security.confirmPassword')}
              className="pr-10"
              error={confirmPassword && newPassword !== confirmPassword ? t('security.passwordMismatch') : undefined}
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
              {t('security.changed')}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={!currentPassword || !newPassword || !confirmPassword || loading}
          >
            {loading ? t('security.saving') : t('security.save')}
          </Button>
        </form>
      </div>

      {/* 退出登录 */}
      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Icon icon={IconLogOut} width={16} />
          {t('security.sessionMgmt')}
        </h3>
        <Button
          variant="danger"
          onClick={onLogout}
          className="w-full"
        >
          {t('security.logout')}
        </Button>
      </div>
    </div>
  )
}

// ── 网络信息 Tab ──

function ExternalAccessTab() {
  const { t } = useI18n()
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
          {t('network.accessUrl')}
        </h3>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {t('network.accessHint')}
        </p>
      </div>

      {/* URLs */}
      <div className="flex flex-col gap-2 text-xs">
        {/* Current / localhost */}
        <UrlRow
          label={t('network.local')}
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
              label={t('network.lan')}
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
          <h4 className="text-xs font-bold text-[var(--color-fg-muted)] mb-2">{t('network.serverInfo')}</h4>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">{t('network.bindAddress')}</span>
              <code className="font-mono">{serverInfo.host}:{serverInfo.port}</code>
            </div>
            {serverInfo.local_ips.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-fg-muted)]">{t('network.lanIp')}</span>
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
  const { t } = useI18n()
  const [version, setVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' })
  const [clearing, setClearing] = useState(false)

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
      setUpdateState({ phase: 'error', message: t('about.checkFailed') })
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
      setUpdateState({ phase: 'error', message: t('about.updateFailed') })
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
          {t('about.description')}
        </p>
      </div>

      {/* Version & Update */}
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-fg-muted)]">{t('about.currentVersion')}</span>
          <div className="flex items-center gap-2">
            <code className="font-mono">v{version ?? '...'}</code>
            {updateState.phase === 'idle' && (
              <button
                onClick={handleCheckUpdate}
                className="px-2 py-0.5 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
                  hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                {t('about.checkUpdate')}
              </button>
            )}
            {updateState.phase === 'checking' && (
              <span className="text-[var(--color-fg-muted)] text-[10px]">{t('about.checking')}</span>
            )}
            {updateState.phase === 'up_to_date' && (
              <span className="text-[var(--color-success)] text-[10px] font-bold">{t('about.upToDate')}</span>
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
            {t('about.update')}
          </button>
        </div>
      )}

      {/* Updating */}
      {updateState.phase === 'updating' && (
        <div className="px-3 py-2 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
          {t('about.updating')}
        </div>
      )}

      {/* Updated */}
      {updateState.phase === 'updated' && (
        <div className="px-3 py-2 bg-[var(--color-success)]/10 border-[length:var(--border-w)] border-[var(--color-success)] rounded-[var(--radius)] text-xs text-[var(--color-success)] font-bold">
          {t('about.updated')}
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
            {t('about.retry')}
          </button>
        </div>
      )}

      {/* Clear cache */}
      <div className="pt-4 border-t-[length:var(--border-w)] border-[var(--color-border-light)]">
        <h4 className="text-xs font-bold flex items-center gap-2 mb-1">
          <Icon icon={IconTrash} width={14} />
          {t('about.cache')}
        </h4>
        <p className="text-[10px] text-[var(--color-fg-muted)] mb-3">
          {t('about.cacheHint')}
        </p>
        <button
          onClick={async () => {
            setClearing(true)
            try {
              // Unregister all service workers
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations()
                await Promise.all(regs.map(r => r.unregister()))
              }
              // Clear Cache API
              if ('caches' in window) {
                const keys = await caches.keys()
                await Promise.all(keys.map(k => caches.delete(k)))
              }
              // Hard reload
              window.location.reload()
            } catch {
              setClearing(false)
            }
          }}
          disabled={clearing}
          className="w-full py-2 text-xs font-bold text-[var(--color-fg-muted)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
            hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-40"
        >
          {clearing ? t('about.clearing') : t('about.clearCache')}
        </button>
      </div>
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
  children,
}: {
  title: string
  open?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase text-[var(--color-fg-muted)] mb-2">
        {title}
      </div>
      <div className="pl-3">
        {children}
      </div>
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
