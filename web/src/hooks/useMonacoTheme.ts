import { useEffect } from 'react'
import type { Monaco } from '@monaco-editor/react'

const THEME_NAME = 'brutalist-dark'

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function defineMonacoTheme(monaco: Monaco) {
  const bg = getCssVar('--color-bg') || '#0a0a0a'
  const fg = getCssVar('--color-fg') || '#e5e5e5'
  const primary = getCssVar('--color-primary') || '#22c55e'
  const muted = getCssVar('--color-fg-muted') || '#737373'
  const bgAlt = getCssVar('--color-bg-alt') || '#171717'
  const border = getCssVar('--color-border-light') || '#262626'

  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: muted.replace('#', ''), fontStyle: 'italic' },
      { token: 'keyword', foreground: primary.replace('#', '') },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.lineHighlightBackground': bgAlt,
      'editor.selectionBackground': `${primary}33`,
      'editorCursor.foreground': primary,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': fg,
      'editor.inactiveSelectionBackground': `${primary}1a`,
      'editorIndentGuide.background': border,
      'editorWidget.background': bgAlt,
      'editorWidget.border': border,
      'input.background': bg,
      'input.border': border,
      'input.foreground': fg,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': `${muted}33`,
      'scrollbarSlider.hoverBackground': `${muted}55`,
      'scrollbarSlider.activeBackground': `${muted}77`,
    },
  })
}

export function useMonacoTheme(monaco: Monaco | null) {
  useEffect(() => {
    if (!monaco) return
    defineMonacoTheme(monaco)
    monaco.editor.setTheme(THEME_NAME)
  }, [monaco])

  return THEME_NAME
}
