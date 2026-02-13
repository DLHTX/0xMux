import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  scrollback?: number
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  onScrollRequest?: (lines: number) => void
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const detachScrollBridgeRef = useRef<(() => void) | null>(null)

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
      // Keep local scrollback enabled so wheel/touch can scroll terminal history.
      scrollback: options.scrollback ?? 5000,
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

    const fallbackCopyText = (text: string) => {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
      } catch {
        // ignore
      } finally {
        textarea.remove()
      }
    }

    const copySelection = () => {
      const selected = terminal.getSelection()
      if (!selected) return false

      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(selected).catch(() => fallbackCopyText(selected))
      } else {
        fallbackCopyText(selected)
      }

      terminal.clearSelection()
      return true
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      if (!terminal.hasSelection()) return true

      const key = event.key.toLowerCase()
      const isCopyChord = (event.metaKey || event.ctrlKey) && key === 'c'
      const isCtrlInsert = event.key === 'Insert' && event.ctrlKey && !event.metaKey
      if (!(isCopyChord || isCtrlInsert)) return true

      if (copySelection()) {
        event.preventDefault()
        return false
      }
      return true
    })

    // Force local history scrolling (wheel + touch) when buffer is in normal mode.
    // Attach on the terminal container (capture phase) so xterm internals can't swallow gestures.
    const interactionTarget = containerRef.current
    if (interactionTarget) {
      let touchY: number | null = null
      let touchLineRemainder = 0
      let lastWheelRemoteAt = 0

      const canUseLocalHistory = () => terminal.buffer.active === terminal.buffer.normal

      const scrollByDelta = (deltaLines: number) => {
        if (!canUseLocalHistory() || deltaLines === 0) return false
        const buffer = terminal.buffer.active
        if (buffer.baseY <= 0) return false
        const nextViewportY = Math.max(0, Math.min(buffer.baseY, buffer.viewportY + deltaLines))
        const consumed = nextViewportY - buffer.viewportY
        if (consumed === 0) return false
        terminal.scrollLines(consumed)
        return true
      }

      const requestRemoteScroll = (deltaLines: number, source: 'wheel' | 'touch') => {
        if (!options.onScrollRequest || deltaLines === 0) return false

        const absLines = Math.abs(Math.trunc(deltaLines))
        if (absLines <= 0) return false

        if (source === 'wheel') {
          const now = Date.now()
          if (now - lastWheelRemoteAt < 16) return true
          lastWheelRemoteAt = now
        }

        const maxStep = source === 'wheel' ? 15 : 12
        const step = Math.max(1, Math.min(maxStep, absLines))
        options.onScrollRequest((deltaLines < 0 ? -1 : 1) * step)
        return true
      }

      const onWheel = (event: WheelEvent) => {
        const rawLines = event.deltaMode === 1 ? event.deltaY : event.deltaY / 36
        if (Math.abs(rawLines) < 0.2) return
        const lines = (rawLines < 0 ? -1 : 1) * Math.max(1, Math.min(15, Math.round(Math.abs(rawLines))))
        if (scrollByDelta(lines) || requestRemoteScroll(lines, 'wheel')) {
          event.preventDefault()
        }
      }

      const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) return
        touchY = event.touches[0].clientY
        touchLineRemainder = 0
      }

      const onTouchMove = (event: TouchEvent) => {
        if (touchY === null || event.touches.length !== 1) return
        const nextY = event.touches[0].clientY
        const deltaPx = touchY - nextY
        touchY = nextY

        // Keep swipe sensitivity balanced: direct enough without jumping too far.
        touchLineRemainder += deltaPx / 14
        const lines =
          touchLineRemainder > 0 ? Math.floor(touchLineRemainder) : Math.ceil(touchLineRemainder)
        if (lines === 0) return
        const localConsumed = scrollByDelta(lines)
        const remoteConsumed = !localConsumed && requestRemoteScroll(lines, 'touch')
        if (!(localConsumed || remoteConsumed)) return
        touchLineRemainder -= lines
        event.preventDefault()
      }

      const onTouchEnd = () => {
        touchY = null
        touchLineRemainder = 0
      }

      interactionTarget.addEventListener('wheel', onWheel, { passive: false, capture: true })
      interactionTarget.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
      interactionTarget.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
      interactionTarget.addEventListener('touchend', onTouchEnd, true)
      interactionTarget.addEventListener('touchcancel', onTouchEnd, true)

      detachScrollBridgeRef.current = () => {
        interactionTarget.removeEventListener('wheel', onWheel, true)
        interactionTarget.removeEventListener('touchstart', onTouchStart, true)
        interactionTarget.removeEventListener('touchmove', onTouchMove, true)
        interactionTarget.removeEventListener('touchend', onTouchEnd, true)
        interactionTarget.removeEventListener('touchcancel', onTouchEnd, true)
      }
    }

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
    detachScrollBridgeRef.current?.()
    detachScrollBridgeRef.current = null
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
