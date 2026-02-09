import { useCallback, useState } from 'react'
import type { UserSettings } from '../lib/types'

const STORAGE_KEY = '0xmux-settings'

const DEFAULT_SETTINGS: UserSettings = {
  fontSize: 14,
  accentColor: '#00ff41',
  defaultSplitDirection: 'horizontal',
  sidebarCollapsed: false,
  sidebarWidth: 260,
}

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(loadSettings)

  const updateSettings = useCallback(
    (partial: Partial<UserSettings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...partial }
        saveSettings(next)
        return next
      })
    },
    []
  )

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings }
}
