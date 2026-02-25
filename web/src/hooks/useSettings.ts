import { useCallback, useEffect, useState } from 'react'
import type { ModalBlur, UserSettings } from '../lib/types'
import { DEFAULT_EDITOR_SKIN, isEditorSkin, skinForPreset } from '../lib/editor-skins'
import { loadConfig, type PresetName } from '../lib/theme'
import { loadJSON, saveJSON } from '../lib/storage'

const BLUR_VALUES: Record<ModalBlur, string> = {
  none: 'blur(0px)',
  sm: 'blur(4px)',
  md: 'blur(12px)',
  lg: 'blur(24px)',
}

function isModalBlur(v: unknown): v is ModalBlur {
  return typeof v === 'string' && v in BLUR_VALUES
}

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
  modalBlur: 'sm',
  editorOpacity: 1.0,
}

function loadSettings(): UserSettings {
  const parsed = loadJSON<Partial<UserSettings>>(STORAGE_KEY)
  let editorSkin = DEFAULT_SETTINGS.editorSkin
  if (parsed && isEditorSkin(parsed.editorSkin)) {
    editorSkin = parsed.editorSkin
  }
  // Auto-sync editor skin with current theme preset if a mapping exists
  // and the user hasn't manually picked a different skin
  const themeConfig = loadConfig()
  if (themeConfig) {
    const presetSkin = skinForPreset(themeConfig.preset)
    if (presetSkin && editorSkin !== presetSkin) {
      editorSkin = presetSkin
    }
  }
  if (parsed) {
    const rawOpacity = typeof parsed.editorOpacity === 'number' ? parsed.editorOpacity : DEFAULT_SETTINGS.editorOpacity
    const editorOpacity = Math.min(1, Math.max(0.3, rawOpacity))
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      editorSkin,
      editorOpacity,
      modalBlur: isModalBlur(parsed.modalBlur) ? parsed.modalBlur : DEFAULT_SETTINGS.modalBlur,
      markdownRenderMode: 'wysiwyg',
    }
  }
  return { ...DEFAULT_SETTINGS, editorSkin }
}

function saveSettings(settings: UserSettings) {
  saveJSON(STORAGE_KEY, settings)
  window.dispatchEvent(
    new CustomEvent<UserSettings>(SETTINGS_UPDATED_EVENT, {
      detail: settings,
    }),
  )
}

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(loadSettings)

  // Sync modal blur CSS variable to :root
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--modal-backdrop-blur',
      BLUR_VALUES[settings.modalBlur] ?? BLUR_VALUES.sm,
    )
  }, [settings.modalBlur])

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserSettings>).detail
      if (detail) {
        setSettingsState(detail)
        return
      }
      setSettingsState(loadSettings())
    }

    const handlePresetChanged = (event: Event) => {
      const preset = (event as CustomEvent<PresetName>).detail
      const skin = skinForPreset(preset)
      if (skin) {
        setSettingsState((prev) => {
          const next = { ...prev, editorSkin: skin }
          saveSettings(next)
          return next
        })
      }
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    window.addEventListener('storage', handleSettingsUpdated)
    window.addEventListener('0xmux-preset-changed', handlePresetChanged)

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
      window.removeEventListener('storage', handleSettingsUpdated)
      window.removeEventListener('0xmux-preset-changed', handlePresetChanged)
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
