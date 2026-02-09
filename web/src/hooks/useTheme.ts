import { createContext, useContext, useState, useEffect, useCallback, createElement, type ReactNode } from 'react'
import {
  type ThemeTokens,
  type ThemeMode,
  type PresetName,
  type ThemeConfig,
  DEFAULT_PRESET,
  FUSION_PIXEL_FONT,
  SILKSCREEN_FONT,
  applyTokens,
  loadConfig,
  saveConfig,
  getInitialMode,
  resolveTokens,
  ensureFontsLoaded,
} from '../lib/theme'
import { getInitialLocale } from '../lib/i18n'

interface ThemeContextValue {
  tokens: ThemeTokens
  preset: PresetName
  mode: ThemeMode
  overrides: Partial<ThemeTokens>
  setToken: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void
  setPreset: (name: PresetName) => void
  toggleMode: () => void
  resetOverrides: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialConfig(): ThemeConfig {
  const saved = loadConfig()
  if (saved) return saved

  // If browser locale is Chinese and no saved config, default to Fusion Pixel
  const locale = getInitialLocale()
  const overrides: Partial<ThemeTokens> = {}
  if (locale === 'zh') {
    overrides.fontBody = FUSION_PIXEL_FONT
    overrides.fontHeading = FUSION_PIXEL_FONT
  }

  return {
    preset: DEFAULT_PRESET,
    mode: getInitialMode(),
    overrides,
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ThemeConfig>(getInitialConfig)

  const tokens = resolveTokens(config.preset, config.mode, config.overrides)

  useEffect(() => {
    ensureFontsLoaded(tokens)
    applyTokens(tokens)
    saveConfig(config)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', tokens.colorBg)
  }, [config, tokens])

  const setToken = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setConfig((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [key]: value },
    }))
  }, [])

  const setPreset = useCallback((name: PresetName) => {
    setConfig((prev) => ({
      ...prev,
      preset: name,
      overrides: {},
    }))
  }, [])

  const toggleMode = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      mode: prev.mode === 'light' ? 'dark' : 'light',
    }))
  }, [])

  const resetOverrides = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      overrides: {},
    }))
  }, [])

  return createElement(
    ThemeContext.Provider,
    {
      value: {
        tokens,
        preset: config.preset,
        mode: config.mode,
        overrides: config.overrides,
        setToken,
        setPreset,
        toggleMode,
        resetOverrides,
      },
    },
    children,
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
