import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { useI18n } from '../../hooks/useI18n'
import {
  PRESETS,
  FONT_OPTIONS,
  type PresetName,
  type ThemeTokens,
} from '../../lib/theme'
import { LOCALES } from '../../lib/i18n'

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

interface ThemeConfiguratorProps {
  open: boolean
  onClose: () => void
}

export function ThemeConfigurator({ open, onClose }: ThemeConfiguratorProps) {
  const { tokens, preset, mode, setToken, setPreset, toggleMode, resetOverrides } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const [section, setSection] = useState<string | null>(null)

  if (!open) return null

  const toggle = (s: string) => setSection(section === s ? null : s)

  const radiusNum = parseInt(tokens.radius)
  const borderWNum = parseInt(tokens.borderW)
  const scaleNum = parseFloat(tokens.fontScale)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50"
        style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-[var(--color-bg)] border-l-[length:var(--border-w)] border-[var(--color-border)] z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
          <span className="text-sm font-bold uppercase">{t('theme.title')}</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
          >
            x
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          {/* ── Language ── */}
          <Section title={t('theme.language')} open={section === 'lang'} onToggle={() => toggle('lang')}>
            <div className="flex gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLocale(l.value)}
                  className={`
                    flex-1 px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors cursor-pointer
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

          {/* ── Presets ── */}
          <Section title={t('theme.presets')} open={section === 'presets' || section === null} onToggle={() => toggle('presets')}>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`
                    px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors cursor-pointer
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

          {/* ── Mode ── */}
          <Section title={t('theme.mode')} open={section === 'mode'} onToggle={() => toggle('mode')}>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { if (mode !== m) toggleMode() }}
                  className={`
                    flex-1 px-3 py-2 text-xs font-bold uppercase border-[length:var(--border-w)] rounded-[var(--radius)] transition-colors cursor-pointer
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

          {/* ── Primary Color ── */}
          <Section title={t('theme.primaryColor')} open={section === 'color'} onToggle={() => toggle('color')}>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setToken('colorPrimary', c.value)}
                  className="w-8 h-8 border-[length:var(--border-w)] rounded-[var(--radius)] cursor-pointer transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: tokens.colorPrimary === c.value ? 'var(--color-fg)' : 'transparent',
                  }}
                  title={c.label}
                />
              ))}
              <label className="relative w-8 h-8 cursor-pointer" title="Custom color">
                <input
                  type="color"
                  value={tokens.colorPrimary}
                  onChange={(e) => setToken('colorPrimary', e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs font-bold text-[var(--color-fg-muted)]">
                  +
                </span>
              </label>
            </div>
          </Section>

          {/* ── Border ── */}
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

          {/* ── Font ── */}
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

          {/* ── Font Scale ── */}
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

          {/* ── Reset ── */}
          <button
            onClick={resetOverrides}
            className="w-full py-2 text-xs font-bold text-[var(--color-fg-muted)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)]
              hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
          >
            {t('theme.reset')}
          </button>
        </div>
      </div>
    </>
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
        className="flex items-center justify-between w-full text-xs font-bold uppercase text-[var(--color-fg-muted)] mb-2 cursor-pointer hover:text-[var(--color-fg)] transition-colors"
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
        className="flex-1 bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] px-2 py-1 text-xs outline-none cursor-pointer appearance-none font-[inherit]
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
