// ── Theme Token System ──

export interface ThemeTokens {
  // Colors
  colorPrimary: string
  colorPrimaryFg: string
  colorBg: string
  colorBgAlt: string
  colorFg: string
  colorFgMuted: string
  colorFgFaint: string
  colorBorder: string
  colorBorderLight: string
  colorSuccess: string
  colorWarning: string
  colorDanger: string
  // Shape
  radius: string
  borderW: string
  // Font
  fontBody: string
  fontHeading: string
  fontMono: string
  fontScale: string
}

export type ThemeMode = 'light' | 'dark'
export type PresetName = 'vscode' | 'brutalist' | 'clean' | 'terminal' | 'soft' | 'pipboy'

export interface FontOption {
  label: string
  value: string
  googleFont?: string // Google Fonts family name for dynamic loading
}

export const FUSION_PIXEL_FONT = "'Fusion Pixel', cursive"
export const SILKSCREEN_FONT = "'Silkscreen', cursive"

export const FONT_OPTIONS: FontOption[] = [
  // Pixel fonts
  { label: 'Fusion Pixel (中/EN)', value: FUSION_PIXEL_FONT }, // self-hosted, no googleFont needed
  { label: 'Silkscreen (EN)', value: SILKSCREEN_FONT, googleFont: 'Silkscreen:wght@400;700' },
  { label: 'Press Start 2P', value: "'Press Start 2P', cursive", googleFont: 'Press+Start+2P' },
  { label: 'Pixelify Sans', value: "'Pixelify Sans', sans-serif", googleFont: 'Pixelify+Sans:wght@400;500;600;700' },
  { label: 'DotGothic16', value: "'DotGothic16', sans-serif", googleFont: 'DotGothic16' },
  // CRT / retro fonts
  { label: 'VT323 (CRT)', value: "'VT323', monospace", googleFont: 'VT323' },
  // Mono fonts
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace", googleFont: 'JetBrains+Mono:wght@400;500;700;800' },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace", googleFont: 'IBM+Plex+Mono:wght@400;500;700' },
  { label: 'Fira Code', value: "'Fira Code', monospace", googleFont: 'Fira+Code:wght@400;500;700' },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace", googleFont: 'Source+Code+Pro:wght@400;500;700' },
  // Sans fonts
  { label: 'Inter', value: "'Inter', sans-serif", googleFont: 'Inter:wght@400;500;700;800' },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif", googleFont: 'Space+Grotesk:wght@400;500;700' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
]

// ── Presets ──

const BRUTALIST_LIGHT: ThemeTokens = {
  colorPrimary: '#1a1a1a',
  colorPrimaryFg: '#FAF8F2',
  colorBg: '#FAF8F2',
  colorBgAlt: '#F3F0E8',
  colorFg: '#1a1a1a',
  colorFgMuted: '#6b6b6b',
  colorFgFaint: '#a0a0a0',
  colorBorder: '#1a1a1a',
  colorBorderLight: '#d0cdc4',
  colorSuccess: '#2d7a3a',
  colorWarning: '#b8860b',
  colorDanger: '#c0392b',
  radius: '0px',
  borderW: '3px',
  fontBody: "'Silkscreen', cursive",
  fontHeading: "'Silkscreen', cursive",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const BRUTALIST_DARK: ThemeTokens = {
  colorPrimary: '#e8e6e0',
  colorPrimaryFg: '#141414',
  colorBg: '#141414',
  colorBgAlt: '#1e1e1e',
  colorFg: '#e8e6e0',
  colorFgMuted: '#8a8a8a',
  colorFgFaint: '#555555',
  colorBorder: '#e8e6e0',
  colorBorderLight: '#333333',
  colorSuccess: '#4ade80',
  colorWarning: '#facc15',
  colorDanger: '#f87171',
  radius: '0px',
  borderW: '3px',
  fontBody: "'Silkscreen', cursive",
  fontHeading: "'Silkscreen', cursive",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const CLEAN_LIGHT: ThemeTokens = {
  colorPrimary: '#2563eb',
  colorPrimaryFg: '#ffffff',
  colorBg: '#ffffff',
  colorBgAlt: '#f8f9fa',
  colorFg: '#1f2937',
  colorFgMuted: '#6b7280',
  colorFgFaint: '#9ca3af',
  colorBorder: '#d1d5db',
  colorBorderLight: '#e5e7eb',
  colorSuccess: '#16a34a',
  colorWarning: '#ca8a04',
  colorDanger: '#dc2626',
  radius: '4px',
  borderW: '1px',
  fontBody: "'Inter', sans-serif",
  fontHeading: "'Inter', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const CLEAN_DARK: ThemeTokens = {
  colorPrimary: '#3b82f6',
  colorPrimaryFg: '#ffffff',
  colorBg: '#111827',
  colorBgAlt: '#1f2937',
  colorFg: '#f3f4f6',
  colorFgMuted: '#9ca3af',
  colorFgFaint: '#4b5563',
  colorBorder: '#4b5563',
  colorBorderLight: '#374151',
  colorSuccess: '#4ade80',
  colorWarning: '#facc15',
  colorDanger: '#f87171',
  radius: '4px',
  borderW: '1px',
  fontBody: "'Inter', sans-serif",
  fontHeading: "'Inter', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const TERMINAL_LIGHT: ThemeTokens = {
  colorPrimary: '#16a34a',
  colorPrimaryFg: '#ffffff',
  colorBg: '#f0fdf4',
  colorBgAlt: '#dcfce7',
  colorFg: '#14532d',
  colorFgMuted: '#4d7c5e',
  colorFgFaint: '#86a793',
  colorBorder: '#14532d',
  colorBorderLight: '#bbcfc2',
  colorSuccess: '#16a34a',
  colorWarning: '#ca8a04',
  colorDanger: '#dc2626',
  radius: '0px',
  borderW: '1px',
  fontBody: "'Fira Code', monospace",
  fontHeading: "'Fira Code', monospace",
  fontMono: "'Fira Code', monospace",
  fontScale: '1',
}

const TERMINAL_DARK: ThemeTokens = {
  colorPrimary: '#4ade80',
  colorPrimaryFg: '#0a0a0a',
  colorBg: '#0a0a0a',
  colorBgAlt: '#111111',
  colorFg: '#4ade80',
  colorFgMuted: '#2d8a4e',
  colorFgFaint: '#1a5c31',
  colorBorder: '#4ade80',
  colorBorderLight: '#1a3a24',
  colorSuccess: '#4ade80',
  colorWarning: '#facc15',
  colorDanger: '#f87171',
  radius: '0px',
  borderW: '1px',
  fontBody: "'Fira Code', monospace",
  fontHeading: "'Fira Code', monospace",
  fontMono: "'Fira Code', monospace",
  fontScale: '1',
}

const SOFT_LIGHT: ThemeTokens = {
  colorPrimary: '#6366f1',
  colorPrimaryFg: '#ffffff',
  colorBg: '#fafaf9',
  colorBgAlt: '#f5f5f0',
  colorFg: '#292524',
  colorFgMuted: '#78716c',
  colorFgFaint: '#a8a29e',
  colorBorder: '#d6d3d1',
  colorBorderLight: '#e7e5e4',
  colorSuccess: '#16a34a',
  colorWarning: '#ca8a04',
  colorDanger: '#dc2626',
  radius: '8px',
  borderW: '2px',
  fontBody: "'Space Grotesk', sans-serif",
  fontHeading: "'Space Grotesk', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const SOFT_DARK: ThemeTokens = {
  colorPrimary: '#818cf8',
  colorPrimaryFg: '#ffffff',
  colorBg: '#1c1917',
  colorBgAlt: '#292524',
  colorFg: '#f5f5f4',
  colorFgMuted: '#a8a29e',
  colorFgFaint: '#57534e',
  colorBorder: '#57534e',
  colorBorderLight: '#3a3533',
  colorSuccess: '#4ade80',
  colorWarning: '#facc15',
  colorDanger: '#f87171',
  radius: '8px',
  borderW: '2px',
  fontBody: "'Space Grotesk', sans-serif",
  fontHeading: "'Space Grotesk', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fontScale: '1',
}

const PIPBOY_LIGHT: ThemeTokens = {
  colorPrimary: '#1BFF80',
  colorPrimaryFg: '#0a0e0a',
  colorBg: '#1a2318',
  colorBgAlt: '#1f2b1c',
  colorFg: '#1BFF80',
  colorFgMuted: '#0fad56',
  colorFgFaint: '#0a7a3c',
  colorBorder: '#1BFF80',
  colorBorderLight: '#0a4a24',
  colorSuccess: '#1BFF80',
  colorWarning: '#FFB641',
  colorDanger: '#ff4444',
  radius: '0px',
  borderW: '2px',
  fontBody: "'VT323', monospace",
  fontHeading: "'VT323', monospace",
  fontMono: "'VT323', monospace",
  fontScale: '1.1',
}

const PIPBOY_DARK: ThemeTokens = {
  colorPrimary: '#1BFF80',
  colorPrimaryFg: '#0a0e0a',
  colorBg: '#0a0e0a',
  colorBgAlt: '#0f150f',
  colorFg: '#1BFF80',
  colorFgMuted: '#0fad56',
  colorFgFaint: '#0a7a3c',
  colorBorder: '#1BFF80',
  colorBorderLight: '#0a3a1e',
  colorSuccess: '#1BFF80',
  colorWarning: '#FFB641',
  colorDanger: '#ff4444',
  radius: '0px',
  borderW: '2px',
  fontBody: "'VT323', monospace",
  fontHeading: "'VT323', monospace",
  fontMono: "'VT323', monospace",
  fontScale: '1.1',
}

// ── VS Code Theme ──

const VSCODE_LIGHT: ThemeTokens = {
  colorPrimary: '#007acc',
  colorPrimaryFg: '#ffffff',
  colorBg: '#ffffff',
  colorBgAlt: '#f3f3f3',
  colorFg: '#333333',
  colorFgMuted: '#616161',
  colorFgFaint: '#a0a0a0',
  colorBorder: '#cecece',
  colorBorderLight: '#e5e5e5',
  colorSuccess: '#388a34',
  colorWarning: '#bf8803',
  colorDanger: '#e51400',
  radius: '0px',
  borderW: '1px',
  fontBody: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  fontHeading: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
  fontScale: '1',
}

const VSCODE_DARK: ThemeTokens = {
  colorPrimary: '#0078d4',
  colorPrimaryFg: '#ffffff',
  colorBg: '#1e1e1e',
  colorBgAlt: '#252526',
  colorFg: '#cccccc',
  colorFgMuted: '#858585',
  colorFgFaint: '#5a5a5a',
  colorBorder: '#3c3c3c',
  colorBorderLight: '#2d2d2d',
  colorSuccess: '#4ec9b0',
  colorWarning: '#cca700',
  colorDanger: '#f14c4c',
  radius: '0px',
  borderW: '1px',
  fontBody: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  fontHeading: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
  fontScale: '1',
}

export const PRESETS: Record<PresetName, { light: ThemeTokens; dark: ThemeTokens; label: string }> = {
  vscode: { light: VSCODE_LIGHT, dark: VSCODE_DARK, label: 'VS Code' },
  brutalist: { light: BRUTALIST_LIGHT, dark: BRUTALIST_DARK, label: 'Brutalist' },
  clean: { light: CLEAN_LIGHT, dark: CLEAN_DARK, label: 'Clean' },
  terminal: { light: TERMINAL_LIGHT, dark: TERMINAL_DARK, label: 'Terminal' },
  soft: { light: SOFT_LIGHT, dark: SOFT_DARK, label: 'Soft' },
  pipboy: { light: PIPBOY_LIGHT, dark: PIPBOY_DARK, label: 'Pip-Boy' },
}

export const DEFAULT_PRESET: PresetName = 'vscode'

// ── CSS Variable Mapping ──

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  colorPrimary: '--color-primary',
  colorPrimaryFg: '--color-primary-fg',
  colorBg: '--color-bg',
  colorBgAlt: '--color-bg-alt',
  colorFg: '--color-fg',
  colorFgMuted: '--color-fg-muted',
  colorFgFaint: '--color-fg-faint',
  colorBorder: '--color-border',
  colorBorderLight: '--color-border-light',
  colorSuccess: '--color-success',
  colorWarning: '--color-warning',
  colorDanger: '--color-danger',
  radius: '--radius',
  borderW: '--border-w',
  fontBody: '--font-body',
  fontHeading: '--font-heading',
  fontMono: '--font-mono',
  fontScale: '--font-scale',
}

export function applyTokens(tokens: ThemeTokens): void {
  const root = document.documentElement.style
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS)) {
    root.setProperty(cssVar, tokens[key as keyof ThemeTokens])
  }
}

// ── Persistence ──

const STORAGE_KEY = '0xmux-theme-config'

export interface ThemeConfig {
  preset: PresetName
  mode: ThemeMode
  overrides: Partial<ThemeTokens>
}

export function loadConfig(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ThemeConfig
  } catch {
    return null
  }
}

export function saveConfig(config: ThemeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function getInitialMode(): ThemeMode {
  const saved = loadConfig()
  if (saved) return saved.mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTokens(preset: PresetName, mode: ThemeMode, overrides: Partial<ThemeTokens>): ThemeTokens {
  const base = PRESETS[preset][mode]
  return { ...base, ...overrides }
}

// ── Google Fonts Dynamic Loading ──

const loadedFonts = new Set<string>()

export function loadGoogleFont(fontValue: string): void {
  const option = FONT_OPTIONS.find((f) => f.value === fontValue)
  if (!option?.googleFont) return
  if (loadedFonts.has(option.googleFont)) return

  loadedFonts.add(option.googleFont)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${option.googleFont}&display=swap`
  document.head.appendChild(link)
}

export function ensureFontsLoaded(tokens: ThemeTokens): void {
  loadGoogleFont(tokens.fontBody)
  loadGoogleFont(tokens.fontHeading)
  loadGoogleFont(tokens.fontMono)
}
