import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { isImagePath, resolveImageUrl, resolveImageByIndex } from '../lib/imageRegistry'
import type { WorkspaceContext } from '../lib/types'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  scrollback?: number
  workspace?: WorkspaceContext
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  onScrollRequest?: (lines: number) => void
  onFileClick?: (path: string, line?: number, col?: number) => void
  onImageHover?: (event: MouseEvent, imageUrl: string, imagePath: string) => void
  onImageLeave?: () => void
  onImageClick?: (imageUrl: string) => void
}

// Regex: matches paths with at least one `/` segment and a file extension, plus optional :line:col
const FILE_PATH_RE = /(?:\.{0,2}\/)?(?:[\w@.\-]+\/)+[\w.\-]+\.\w{1,10}(?::(\d+)(?::(\d+))?)?/g
const IMAGE_REF_RE = /\[Image #(\d+)\]/g

export function useTerminal(options: UseTerminalOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const detachScrollBridgeRef = useRef<(() => void) | null>(null)
  const onFileClickRef = useRef(options.onFileClick)
  onFileClickRef.current = options.onFileClick
  const onImageHoverRef = useRef(options.onImageHover)
  onImageHoverRef.current = options.onImageHover
  const onImageLeaveRef = useRef(options.onImageLeave)
  onImageLeaveRef.current = options.onImageLeave
  const onImageClickRef = useRef(options.onImageClick)
  onImageClickRef.current = options.onImageClick
  const workspaceRef = useRef(options.workspace)
  workspaceRef.current = options.workspace

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

    // Register custom file path link provider (includes image detection).
    // Handles wrapped lines: when a long path spans multiple terminal rows,
    // xterm.js stores each row as a separate buffer line with isWrapped=true
    // on continuation lines. We join the full logical line before matching.
    terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const buf = terminal.buffer.active
        const line = buf.getLine(bufferLineNumber - 1)
        if (!line) { callback(undefined); return }

        // Build the full logical line by joining wrapped rows.
        // Walk backward to find the logical line start, then forward to collect all parts.
        let logicalStartRow = bufferLineNumber - 1 // 0-based
        while (logicalStartRow > 0) {
          const prev = buf.getLine(logicalStartRow)
          if (!prev || !prev.isWrapped) break
          logicalStartRow--
        }

        const rowTexts: string[] = []
        const rowCols: number[] = [] // cumulative char offset for each row
        let cumLen = 0
        for (let r = logicalStartRow; r < buf.length; r++) {
          const row = buf.getLine(r)
          if (!row) break
          if (r > logicalStartRow && !row.isWrapped) break
          const t = row.translateToString(false) // keep trailing spaces for accurate column mapping
          rowCols.push(cumLen)
          rowTexts.push(t)
          cumLen += t.length
        }
        const logicalEndRow = logicalStartRow + rowTexts.length - 1 // 0-based inclusive

        // Only process once per logical line: when bufferLineNumber is the first row.
        // For continuation rows, still process (xterm calls provideLinks per visible row).
        const fullText = rowTexts.join('')
        // Trim trailing whitespace for regex matching
        const text = fullText.replace(/\s+$/, '')

        // Helper: convert a char offset in the logical line to { x (1-based), y (1-based row) }
        const offsetToPos = (offset: number): { x: number; y: number } => {
          for (let i = rowCols.length - 1; i >= 0; i--) {
            if (offset >= rowCols[i]) {
              return { x: offset - rowCols[i] + 1, y: logicalStartRow + i + 1 }
            }
          }
          return { x: 1, y: logicalStartRow + 1 }
        }

        // Check if a range overlaps with the current bufferLineNumber
        const overlapsCurrentRow = (startOff: number, endOff: number): boolean => {
          const startPos = offsetToPos(startOff)
          const endPos = offsetToPos(endOff - 1) // endOff is exclusive
          const row1 = bufferLineNumber // 1-based
          return startPos.y <= row1 && endPos.y >= row1
        }

        type LinkEntry = {
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          text: string
          activate: (event: MouseEvent) => void
          hover?: (event: MouseEvent, text: string) => void
          leave?: (event: MouseEvent, text: string) => void
          decorations: { pointerCursor: boolean; underline: boolean }
        }
        const links: LinkEntry[] = []

        FILE_PATH_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = FILE_PATH_RE.exec(text)) !== null) {
          const matchStart = m.index
          const matchEnd = matchStart + m[0].length

          // Skip if this match is part of a URL (preceded by ://)
          if (matchStart >= 3 && text.substring(matchStart - 3, matchStart).includes('://')) continue

          // Only return links that overlap the current row
          if (!overlapsCurrentRow(matchStart, matchEnd)) continue

          // Extract path (strip :line:col suffix)
          let filePath = m[0]
          const lineNum = m[1] ? parseInt(m[1], 10) : undefined
          const colNum = m[2] ? parseInt(m[2], 10) : undefined
          if (lineNum !== undefined) {
            filePath = filePath.replace(/:(\d+)(?::(\d+))?$/, '')
          }

          const startPos = offsetToPos(matchStart)
          const endPos = offsetToPos(matchEnd)

          // Check if this is an image path
          if (isImagePath(filePath)) {
            const imageUrl = resolveImageUrl(filePath, workspaceRef.current)
            if (imageUrl) {
              links.push({
                range: { start: startPos, end: endPos },
                text: m[0],
                decorations: { pointerCursor: true, underline: true },
                activate: () => { onImageClickRef.current?.(imageUrl) },
                hover: (event: MouseEvent) => { onImageHoverRef.current?.(event, imageUrl, filePath) },
                leave: () => { onImageLeaveRef.current?.() },
              })
              continue
            }
          }

          links.push({
            range: { start: startPos, end: endPos },
            text: m[0],
            decorations: { pointerCursor: true, underline: true },
            activate: () => { onFileClickRef.current?.(filePath, lineNum, colNum) },
          })
        }

        // Match [Image #N] references — always create the link so the
        // underline + pointer cursor appear immediately.  The actual image
        // URL is resolved lazily on hover/activate, which means newly
        // uploaded images that arrive via the polling registry refresh
        // will be picked up without needing to re-render the terminal.
        IMAGE_REF_RE.lastIndex = 0
        while ((m = IMAGE_REF_RE.exec(text)) !== null) {
          const n = parseInt(m[1], 10)

          const matchStart = m.index
          const matchEnd = matchStart + m[0].length

          if (!overlapsCurrentRow(matchStart, matchEnd)) continue

          const startPos = offsetToPos(matchStart)
          const endPos = offsetToPos(matchEnd)

          links.push({
            range: { start: startPos, end: endPos },
            text: m[0],
            decorations: { pointerCursor: true, underline: true },
            activate: () => {
              const r = resolveImageByIndex(n)
              if (r) onImageClickRef.current?.(r.url)
            },
            hover: (event: MouseEvent) => {
              const r = resolveImageByIndex(n)
              if (r) onImageHoverRef.current?.(event, r.url, r.path)
            },
            leave: () => { onImageLeaveRef.current?.() },
          })
        }

        callback(links.length > 0 ? links : undefined)
      },
    })

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
      let lastRemoteScrollAt = 0

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

      const requestRemoteScroll = (deltaLines: number, source: 'wheel' | 'touch'): true | false | 'throttled' => {
        if (!options.onScrollRequest || deltaLines === 0) return false

        const absLines = Math.abs(Math.trunc(deltaLines))
        if (absLines <= 0) return false

        // Throttle: at most one remote scroll every 32ms.
        // Returns 'throttled' so callers can decide whether to consume accumulated delta.
        const now = Date.now()
        if (now - lastRemoteScrollAt < 32) return 'throttled'
        lastRemoteScrollAt = now

        const maxStep = source === 'wheel' ? 45 : 36
        const step = Math.max(1, Math.min(maxStep, absLines))
        options.onScrollRequest((deltaLines < 0 ? -1 : 1) * step)
        return true
      }

      const onWheel = (event: WheelEvent) => {
        const rawLines = event.deltaMode === 1 ? event.deltaY : event.deltaY / 12
        if (Math.abs(rawLines) < 0.2) return
        const lines = (rawLines < 0 ? -1 : 1) * Math.max(1, Math.min(45, Math.round(Math.abs(rawLines))))
        // For wheel, 'throttled' is truthy — still prevents native scroll bounce
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

        // ~5 px per line → roughly 3× default sensitivity for snappy mobile scroll.
        touchLineRemainder += deltaPx / 5
        const lines =
          touchLineRemainder > 0 ? Math.floor(touchLineRemainder) : Math.ceil(touchLineRemainder)
        if (lines === 0) return

        const localConsumed = scrollByDelta(lines)
        if (localConsumed) {
          touchLineRemainder -= lines
          event.preventDefault()
          return
        }

        const remoteResult = requestRemoteScroll(lines, 'touch')
        if (remoteResult === false) return
        // Always prevent native bounce when we're handling scroll
        event.preventDefault()
        // Only consume remainder when the command was actually sent.
        // When throttled, let the delta accumulate so the next sent command
        // carries the full scroll distance — prevents "swallowed" scroll.
        if (remoteResult === true) {
          touchLineRemainder -= lines
        }
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
