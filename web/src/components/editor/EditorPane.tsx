import React, { Suspense, useCallback, useMemo, useRef } from 'react'
import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { UserSettings } from '../../lib/types.ts'
import { useTheme } from '../../hooks/useTheme.ts'
import { getEditorSkinPalette } from '../../lib/editor-skins.ts'
import MarkdownVditorPane from './MarkdownVditorPane.tsx'

// Configure monaco to use local assets served by @tomjs/vite-plugin-monaco-editor
loader.config({ paths: { vs: '/npm/monaco-editor@0.55.1/min/vs' } })

// Lazy-load Editor and DiffEditor
const MonacoEditor = React.lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
)
const MonacoDiffEditor = React.lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
)
const THEME_NAME = '0xmux-floating-editor'

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

interface EditorThemeConfig {
  textColor: string
  mutedColor: string
  accentColor: string
  monacoBase: 'vs' | 'vs-dark'
}

function defineFloatingTheme(monaco: Monaco, config: EditorThemeConfig) {
  const fg = config.textColor || getCssVar('--color-fg') || '#1a1a1a'
  const muted = config.mutedColor || getCssVar('--color-fg-muted') || '#6b6b6b'
  const primary = config.accentColor || getCssVar('--color-primary') || '#1a1a1a'
  const border = getCssVar('--color-border-light') || '#d0cdc4'
  const selection = `${primary}33`

  monaco.editor.defineTheme(THEME_NAME, {
    base: config.monacoBase,
    inherit: true,
    rules: [
      { token: 'keyword', foreground: primary.replace('#', '') },
      { token: 'type', foreground: primary.replace('#', '') },
      { token: 'string', foreground: fg.replace('#', '') },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': fg,
      'editor.lineHighlightBackground': '#00000010',
      'editor.selectionBackground': selection,
      'editor.inactiveSelectionBackground': `${primary}1a`,
      'editorCursor.foreground': primary,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': fg,
      'editorGutter.background': '#00000000',
      'editorIndentGuide.background': border,
      'minimap.background': '#00000000',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': `${muted}33`,
      'scrollbarSlider.hoverBackground': `${muted}55`,
      'scrollbarSlider.activeBackground': `${muted}77`,
      'diffEditor.insertedTextBackground': '#2d7a3a22',
      'diffEditor.removedTextBackground': '#c0392b22',
      'diffEditor.insertedLineBackground': '#2d7a3a18',
      'diffEditor.removedLineBackground': '#c0392b18',
      'diffEditor.diagonalFill': '#00000000',
    },
  })
}

export interface EditorPaneProps {
  filePath: string
  language: string
  content: string
  mode: 'edit' | 'diff'
  editorSettings: Pick<
    UserSettings,
    | 'editorSkin'
  >
  diffOriginal?: string
  onChange?: (value: string) => void
  onCursorChange?: (line: number, col: number) => void
}

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  automaticLayout: true,
  fontSize: 13,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  padding: { top: 4 },
}

const DIFF_OPTIONS: editor.IDiffEditorConstructionOptions = {
  minimap: { enabled: false },
  automaticLayout: true,
  fontSize: 13,
  renderSideBySide: true,
  scrollBeyondLastLine: false,
  readOnly: true,
}

function LoadingFallback() {
  return (
    <div
      className="flex items-center justify-center h-full text-xs font-mono"
      style={{ color: 'var(--color-fg-muted)', background: 'var(--color-bg)' }}
    >
      Loading editor...
    </div>
  )
}

export default function EditorPane({
  filePath,
  language,
  content,
  mode,
  editorSettings,
  diffOriginal,
  onChange,
  onCursorChange,
}: EditorPaneProps) {
  const { mode: themeMode } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const isMarkdown = language === 'markdown' || filePath.toLowerCase().endsWith('.md')
  const useVditor = mode === 'edit' && isMarkdown

  const themeConfig = useMemo<EditorThemeConfig>(
    () => getEditorSkinPalette(editorSettings.editorSkin, themeMode),
    [
      editorSettings.editorSkin,
      themeMode,
    ],
  )

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    defineFloatingTheme(monaco, themeConfig)
    monaco.editor.setTheme(THEME_NAME)
  }, [themeConfig])

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance
      defineFloatingTheme(monaco, themeConfig)
      monaco.editor.setTheme(THEME_NAME)
      // Force one layout pass after mount so flex-based parents always get measured correctly.
      editorInstance.layout()
      requestAnimationFrame(() => editorInstance.layout())
      if (onCursorChange) {
        editorInstance.onDidChangeCursorPosition((e) => {
          onCursorChange(e.position.lineNumber, e.position.column)
        })
      }
    },
    [onCursorChange, themeConfig],
  )

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (onChange && value !== undefined) {
        onChange(value)
      }
    },
    [onChange],
  )

  return (
    <div className="h-full w-full min-h-0">
      <Suspense fallback={<LoadingFallback />}>
        {useVditor ? (
          <MarkdownVditorPane
            content={content}
            themeMode={themeMode}
            textColor={themeConfig.textColor}
            mutedColor={themeConfig.mutedColor}
            accentColor={themeConfig.accentColor}
            onChange={onChange}
          />
        ) : mode === 'diff' ? (
          <MonacoDiffEditor
            key={`diff-${filePath}-${themeConfig.textColor}-${themeConfig.mutedColor}-${themeConfig.accentColor}`}
            language={language}
            original={diffOriginal ?? ''}
            modified={content}
            theme={THEME_NAME}
            beforeMount={handleBeforeMount}
            height="100%"
            options={DIFF_OPTIONS}
          />
        ) : (
          <MonacoEditor
            key={`edit-${filePath}-${themeConfig.textColor}-${themeConfig.mutedColor}-${themeConfig.accentColor}`}
            language={language}
            value={content}
            theme={THEME_NAME}
            beforeMount={handleBeforeMount}
            height="100%"
            options={EDITOR_OPTIONS}
            onChange={handleChange}
            onMount={handleEditorMount}
          />
        )}
      </Suspense>
    </div>
  )
}
