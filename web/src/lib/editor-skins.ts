import type { EditorSkin } from './types'
import type { ThemeMode, PresetName } from './theme'

export interface EditorSkinPalette {
  textColor: string
  mutedColor: string
  accentColor: string
  monacoBase: 'vs' | 'vs-dark'
}

interface EditorSkinOption {
  label: string
  description: string
  light: EditorSkinPalette
  dark: EditorSkinPalette
}

export const DEFAULT_EDITOR_SKIN: EditorSkin = 'classic'

export const EDITOR_SKINS: Record<EditorSkin, EditorSkinOption> = {
  classic: {
    label: 'Classic',
    description: 'Neutral UI with blue highlights.',
    light: {
      textColor: '#1f2937',
      mutedColor: '#6b7280',
      accentColor: '#2563eb',
      monacoBase: 'vs',
    },
    dark: {
      textColor: '#e5e7eb',
      mutedColor: '#94a3b8',
      accentColor: '#60a5fa',
      monacoBase: 'vs-dark',
    },
  },
  ocean: {
    label: 'Ocean',
    description: 'Cool cyan accents for long coding sessions.',
    light: {
      textColor: '#0f172a',
      mutedColor: '#64748b',
      accentColor: '#0891b2',
      monacoBase: 'vs',
    },
    dark: {
      textColor: '#dbeafe',
      mutedColor: '#93c5fd',
      accentColor: '#22d3ee',
      monacoBase: 'vs-dark',
    },
  },
  forest: {
    label: 'Forest',
    description: 'Low-contrast green palette with calm focus.',
    light: {
      textColor: '#1f2937',
      mutedColor: '#6b7280',
      accentColor: '#15803d',
      monacoBase: 'vs',
    },
    dark: {
      textColor: '#e2e8f0',
      mutedColor: '#94a3b8',
      accentColor: '#4ade80',
      monacoBase: 'vs-dark',
    },
  },
  sunset: {
    label: 'Sunset',
    description: 'Warm orange accents with higher contrast.',
    light: {
      textColor: '#292524',
      mutedColor: '#78716c',
      accentColor: '#c2410c',
      monacoBase: 'vs',
    },
    dark: {
      textColor: '#f5f5f4',
      mutedColor: '#d6d3d1',
      accentColor: '#fb923c',
      monacoBase: 'vs-dark',
    },
  },
  pipboy: {
    label: 'Pip-Boy',
    description: 'Fallout CRT phosphor green terminal.',
    light: {
      textColor: '#d4d4d4',
      mutedColor: '#808080',
      accentColor: '#1BFF80',
      monacoBase: 'vs-dark',
    },
    dark: {
      textColor: '#d4d4d4',
      mutedColor: '#808080',
      accentColor: '#1BFF80',
      monacoBase: 'vs-dark',
    },
  },
}

export const EDITOR_SKIN_KEYS = Object.keys(EDITOR_SKINS) as EditorSkin[]

export function isEditorSkin(value: unknown): value is EditorSkin {
  return typeof value === 'string' && value in EDITOR_SKINS
}

export function getEditorSkinPalette(skin: EditorSkin, mode: ThemeMode): EditorSkinPalette {
  return EDITOR_SKINS[skin][mode]
}

/** Map theme presets to their matching editor skin. */
const PRESET_TO_SKIN: Partial<Record<PresetName, EditorSkin>> = {
  pipboy: 'pipboy',
  terminal: 'forest',
}

export function skinForPreset(preset: PresetName): EditorSkin | undefined {
  return PRESET_TO_SKIN[preset]
}
