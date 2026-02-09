import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const initTerminal = useCallback(() => {
    if (!containerRef.current || terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: options.fontSize ?? 14,
      fontFamily: options.fontFamily ?? "'JetBrains Mono', monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#00ff41',
        selectionBackground: '#00ff4133',
        ...options.theme,
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    // Try WebGL addon, fall back to canvas
    import('@xterm/addon-webgl')
      .then(({ WebglAddon }) => {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        terminal.loadAddon(webgl)
      })
      .catch(() => {
        // Canvas renderer is the default fallback
      })

    terminal.open(containerRef.current)

    // Delay fit until container has settled its layout dimensions.
    // A single rAF is sometimes too early on mobile (flex hasn't resolved yet),
    // so we double-rAF to be safe.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
    })

    terminal.onData((data) => {
      options.onData?.(data)
    })

    terminal.onResize(({ cols, rows }) => {
      options.onResize?.(cols, rows)
    })

    // ResizeObserver for auto-fit
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore if terminal disposed
        }
      })
    })
    ro.observe(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    resizeObserverRef.current = ro
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dispose = useCallback(() => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    terminalRef.current?.dispose()
    terminalRef.current = null
    fitAddonRef.current = null
  }, [])

  const write = useCallback((data: string | Uint8Array) => {
    terminalRef.current?.write(data)
  }, [])

  const fit = useCallback(() => {
    try {
      fitAddonRef.current?.fit()
    } catch {
      // ignore
    }
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  // Update font size dynamically
  const setFontSize = useCallback((size: number) => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = size
      fitAddonRef.current?.fit()
    }
  }, [])

  useEffect(() => {
    return () => dispose()
  }, [dispose])

  return {
    containerRef,
    terminal: terminalRef,
    initTerminal,
    dispose,
    write,
    fit,
    focus,
    setFontSize,
  }
}
