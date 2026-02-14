import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeMode } from '../../lib/theme.ts'

type VditorInstance = import('vditor').default
type VditorUiTheme = 'dark' | 'classic'
type VditorContentTheme = 'dark' | 'light'

function getVditorTheme(mode: ThemeMode): {
  ui: VditorUiTheme
  content: VditorContentTheme
  code: string
} {
  return {
    ui: mode === 'dark' ? 'dark' : 'classic',
    content: mode === 'dark' ? 'dark' : 'light',
    code: mode === 'dark' ? 'github-dark' : 'github',
  }
}

export interface MarkdownVditorPaneProps {
  content: string
  themeMode: ThemeMode
  textColor: string
  mutedColor: string
  accentColor: string
  onChange?: (value: string) => void
}

export default function MarkdownVditorPane({
  content,
  themeMode,
  textColor,
  mutedColor,
  accentColor,
  onChange,
}: MarkdownVditorPaneProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<VditorInstance | null>(null)
  const syncingRef = useRef(false)
  const readyRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const themeRef = useRef(themeMode)
  const contentRef = useRef(content)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    themeRef.current = themeMode
    if (!editorRef.current) return
    const nextTheme = getVditorTheme(themeMode)
    editorRef.current.setTheme(nextTheme.ui, nextTheme.content, nextTheme.code)
  }, [themeMode])
  const styleVars = useMemo<CSSProperties>(
    () => ({
      '--editor-text-color': textColor,
      '--editor-muted-color': mutedColor,
      '--editor-accent-color': accentColor,
    } as CSSProperties),
    [accentColor, mutedColor, textColor],
  )

  useEffect(() => {
    let disposed = false

    const createEditor = async () => {
      const { default: Vditor } = await import('vditor')
      if (disposed || !rootRef.current) return

      const initTheme = getVditorTheme(themeRef.current)
      const instance = new Vditor(rootRef.current, {
        mode: 'wysiwyg',
        theme: initTheme.ui,
        cache: { enable: false },
        value: contentRef.current,
        height: '100%',
        minHeight: 0,
        toolbarConfig: {
          hide: true,
          pin: false,
        },
        toolbar: [],
        preview: {
          delay: 0,
          hljs: {
            style: initTheme.code,
          },
          theme: {
            current: initTheme.content,
          },
          markdown: {
            toc: true,
          },
        },
        input: (value: string) => {
          if (syncingRef.current) return
          onChangeRef.current?.(value)
        },
        after: () => {
          readyRef.current = true
        },
      })

      editorRef.current = instance
    }

    void createEditor()

    return () => {
      disposed = true
      readyRef.current = false
      if (editorRef.current) {
        try {
          editorRef.current.destroy()
        } catch {
          // Vditor may throw in StrictMode if the instance is not fully initialized yet.
        }
        editorRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!editorRef.current || !readyRef.current) return

    let currentValue = ''
    try {
      currentValue = editorRef.current.getValue()
    } catch {
      return
    }
    if (currentValue === content) return

    syncingRef.current = true
    editorRef.current.setValue(content, true)
    window.setTimeout(() => {
      syncingRef.current = false
    }, 0)
  }, [content])

  return (
    <div
      className="floating-markdown-vditor h-full w-full min-h-0"
      style={styleVars}
    >
      <div ref={rootRef} className="h-full w-full" />
    </div>
  )
}
