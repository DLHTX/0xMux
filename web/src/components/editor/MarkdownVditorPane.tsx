import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeMode } from '../../lib/theme.ts'

type VditorInstance = import('vditor').default

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

      const instance = new Vditor(rootRef.current, {
        mode: 'wysiwyg',
        theme: themeMode === 'dark' ? 'dark' : 'classic',
        cache: { enable: false },
        value: content,
        minHeight: 80,
        toolbarConfig: {
          hide: true,
          pin: false,
        },
        toolbar: [],
        preview: {
          delay: 0,
          markdown: {
            toc: true,
          },
        },
        input: (value: string) => {
          if (syncingRef.current) return
          onChange?.(value)
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
  }, [themeMode, onChange])

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
