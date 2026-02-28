import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { UserSettings } from '../../lib/types.ts'
import { useTheme } from '../../hooks/useTheme.ts'
import { getEditorSkinPalette } from '../../lib/editor-skins.ts'
import MarkdownVditorPane from './MarkdownVditorPane.tsx'
import { useI18n } from '../../hooks/useI18n'

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
  imageUrl?: string
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
  const { t } = useI18n()
  return (
    <div
      className="flex items-center justify-center h-full text-xs font-mono"
      style={{ color: 'var(--color-fg-muted)', background: 'var(--color-bg)' }}
    >
      {t('editor.loading')}
    </div>
  )
}

const MIN_SCALE = 0.1
const MAX_SCALE = 10

function ImagePreviewPane({ src, fileName }: { src: string; fileName: string }) {
  const { t } = useI18n()
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const fitScaleRef = useRef(1)

  const fitToWindow = useCallback(() => {
    setScale(fitScaleRef.current)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.95 : 1.05
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTx: translate.x,
      startTy: translate.y,
    }
    setIsPanning(true)
  }, [translate])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    setTranslate({
      x: panRef.current.startTx + dx,
      y: panRef.current.startTy + dy,
    })
  }, [isPanning])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleDoubleClick = useCallback(() => {
    if (scale > 1.1) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    } else {
      setScale(2.5)
      setTranslate({ x: 0, y: 0 })
    }
  }, [scale])

  return (
    <div className="h-full w-full flex flex-col select-none">
      {/* Toolbar */}
      <div
        className="shrink-0 flex items-center gap-3 px-3 py-1 border-b"
        style={{ borderColor: 'var(--color-border-light)' }}
      >
        <button
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s / 1.2))}
          className="px-1.5 py-0.5 text-xs font-mono hover:opacity-70"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          -
        </button>
        <span
          className="text-xs font-mono min-w-[48px] text-center tabular-nums"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.2))}
          className="px-1.5 py-0.5 text-xs font-mono hover:opacity-70"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          +
        </button>
        <button
          onClick={fitToWindow}
          className="px-1.5 py-0.5 text-xs font-mono hover:opacity-70"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          {t('editor.fit')}
        </button>
        <button
          onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }) }}
          className="px-1.5 py-0.5 text-xs font-mono hover:opacity-70"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          1:1
        </button>
        {imgSize.w > 0 && (
          <span
            className="ml-auto text-xs font-mono"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {imgSize.w} x {imgSize.h}
          </span>
        )}
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{
          background: 'repeating-conic-gradient(var(--color-border-light) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={fileName}
          className="max-w-none pointer-events-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            const { naturalWidth, naturalHeight } = img
            setImgSize({ w: naturalWidth, h: naturalHeight })
            const container = containerRef.current
            if (container) {
              const fit = Math.min(
                container.clientWidth / naturalWidth,
                container.clientHeight / naturalHeight,
                1,
              )
              fitScaleRef.current = fit
              setScale(fit)
            }
          }}
        />
      </div>
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
  imageUrl,
  onChange,
  onCursorChange,
}: EditorPaneProps) {
  const { mode: themeMode } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const isImage = language === 'image' && imageUrl
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

  if (isImage) {
    const fileName = filePath.split('/').pop() ?? filePath
    return (
      <div className="h-full w-full min-h-0">
        <ImagePreviewPane src={imageUrl} fileName={fileName} />
      </div>
    )
  }

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
