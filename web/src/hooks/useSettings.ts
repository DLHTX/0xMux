import { useCallback, useEffect, useState } from 'react'
import type { UserSettings } from '../lib/types'
import { DEFAULT_EDITOR_SKIN, isEditorSkin } from '../lib/editor-skins'

const STORAGE_KEY = '0xmux-settings'
const SETTINGS_UPDATED_EVENT = '0xmux-settings-updated'

const DEFAULT_SETTINGS: UserSettings = {
  fontSize: 14,
  accentColor: '#00ff41',
  defaultSplitDirection: 'horizontal',
  sidebarCollapsed: false,
  sidebarWidth: 260,
  quickFileTrigger: true,
  editorSkin: DEFAULT_EDITOR_SKIN,
  markdownRenderMode: 'wysiwyg',
}

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSettings>
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        editorSkin: isEditorSkin(parsed.editorSkin) ? parsed.editorSkin : DEFAULT_SETTINGS.editorSkin,
        // Markdown editor is intentionally fixed to WYSIWYG.
        markdownRenderMode: 'wysiwyg',
      }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    window.dispatchEvent(
      new CustomEvent<UserSettings>(SETTINGS_UPDATED_EVENT, {
        detail: settings,
      }),
    )
  } catch {
    // ignore storage errors
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(loadSettings)

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserSettings>).detail
      if (detail) {
        setSettingsState(detail)
        return
      }
      setSettingsState(loadSettings())
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    window.addEventListener('storage', handleSettingsUpdated)

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
      window.removeEventListener('storage', handleSettingsUpdated)
    }
  }, [])

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
