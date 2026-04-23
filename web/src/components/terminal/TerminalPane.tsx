import { useCallback, useEffect, useRef, useState } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useMux } from '../../contexts/MuxContext'
import { useMobile } from '../../hooks/useMobile'
import { useI18n } from '../../hooks/useI18n'
import { consumePendingInit } from '../../lib/init-commands'
import { resolveAbsoluteFilePath, resolveFilePath, deleteImage, locateFiles } from '../../lib/api'
import { getTerminalFileDragData, isTerminalFileDrag } from '../../lib/terminalFileDrag'
import { ImagePreviewTooltip } from '../ui/ImagePreviewTooltip'
import type { WorkspaceContext } from '../../lib/types'
import type { MuxChannelHandle } from '../../hooks/useMuxSocket'

interface TerminalPaneProps {
  sessionName: string
  windowIndex?: number
  fontSize?: number
  focused?: boolean
  onFocus?: () => void
  terminalRef?: React.RefObject<import('@xterm/xterm').Terminal | null>
  /** Extra bottom space to reserve on mobile (e.g. for a fixed VirtualKeybar) */
  mobileBottomOffset?: number
  /** Called when '@' is typed in the terminal (for quick file search) */
  onAtTrigger?: () => void
  /** Whether the @ trigger is enabled (default: true) */
  atTriggerEnabled?: boolean
  /** Called when a file path link is clicked in terminal output */
  onFileClick?: (path: string, line?: number, workspace?: WorkspaceContext) => void
  /** Called when an image link is clicked in terminal output */
  onImageClick?: (imageUrl: string) => void
  /** Called when a TermUI block is detected — opens HTML in a webview pane */
  onTermUIRender?: (html: string) => void
}

export function TerminalPane({
  sessionName,
  windowIndex,
  fontSize = 14,
  focused = false,
  onFocus,
  terminalRef: externalTerminalRef,
  mobileBottomOffset = 0,
  onAtTrigger,
  atTriggerEnabled = true,
  onFileClick,
  onImageClick,
  onTermUIRender,
}: TerminalPaneProps) {
  const mux = useMux()
  const { t } = useI18n()
  const chRef = useRef<MuxChannelHandle | null>(null)

  const [channelOpen, setChannelOpen] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [scrollIndicator, setScrollIndicator] = useState<{ visible: boolean; top: number; height: number }>({
    visible: false,
    top: 0,
    height: 0,
  })
  const [tmuxScrollState, setTmuxScrollState] = useState<{ history: number; position: number } | null>(null)
  const [tmuxScrollProgress, setTmuxScrollProgress] = useState(1)
  const [isFileDropOver, setIsFileDropOver] = useState(false)
  const isMobile = useMobile()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const dragOffsetPxRef = useRef(0)
  const hasTmuxScrollState = (tmuxScrollState?.history ?? 0) > 0
  // Ref mirror: lets syncBottomForMobileInput read the latest scroll state
  // without re-creating the callback (which would re-trigger the viewport effect).
  const tmuxScrollStateRef = useRef(tmuxScrollState)
  tmuxScrollStateRef.current = tmuxScrollState

  // Ref mirrors for @ trigger (captured in the onData closure at init time)
  const onAtTriggerRef = useRef(onAtTrigger)
  onAtTriggerRef.current = onAtTrigger
  const atTriggerEnabledRef = useRef(atTriggerEnabled)
  atTriggerEnabledRef.current = atTriggerEnabled

  // Ref mirror for file click callback (captured in initTerminal closure)
  const onFileClickRef = useRef(onFileClick)
  onFileClickRef.current = onFileClick

  // Image tooltip state
  const [imageTooltip, setImageTooltip] = useState<{
    imageUrl: string; imagePath: string; mouseX: number; mouseY: number
  } | null>(null)
  const imageHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onImageClickRef = useRef(onImageClick)
  onImageClickRef.current = onImageClick

  // TermUI: ref mirror for callback
  const onTermUIRenderRef = useRef(onTermUIRender)
  onTermUIRenderRef.current = onTermUIRender

  const handleImageHover = useCallback((event: MouseEvent, imageUrl: string, imagePath: string) => {
    if (imageLeaveTimerRef.current) { clearTimeout(imageLeaveTimerRef.current); imageLeaveTimerRef.current = null }
    if (imageHoverTimerRef.current) clearTimeout(imageHoverTimerRef.current)
    imageHoverTimerRef.current = setTimeout(() => {
      setImageTooltip({ imageUrl, imagePath, mouseX: event.clientX, mouseY: event.clientY })
    }, 200)
  }, [])

  const handleImageLeave = useCallback(() => {
    if (imageHoverTimerRef.current) { clearTimeout(imageHoverTimerRef.current); imageHoverTimerRef.current = null }
    imageLeaveTimerRef.current = setTimeout(() => {
      setImageTooltip(null)
    }, 150)
  }, [])

  const handleImageTooltipEnter = useCallback(() => {
    if (imageLeaveTimerRef.current) { clearTimeout(imageLeaveTimerRef.current); imageLeaveTimerRef.current = null }
  }, [])

  const handleImageDelete = useCallback(async (imagePath: string) => {
    const filename = imagePath.split('/').pop()
    if (!filename) return
    try {
      await deleteImage(filename)
    } catch {
      console.error('Failed to delete image:', filename)
    }
  }, [])

  const handleFileLinkClick = useCallback(async (rawPath: string, line?: number) => {
    const cb = onFileClickRef.current
    if (!cb) return

    const workspace: WorkspaceContext = {
      session: sessionName,
      window: windowIndex ?? 0,
    }

    let filePath = rawPath
    if (rawPath.startsWith('/')) {
      // Absolute path — strip workspace root to get relative path for the API
      try {
        const { path: root } = await resolveAbsoluteFilePath('.', workspace)
        const rootPrefix = root.endsWith('/') ? root : root + '/'
        if (rawPath.startsWith(rootPrefix)) {
          filePath = rawPath.slice(rootPrefix.length)
        }
      } catch {
        // Fallback: pass as-is
      }
    }

    // Fuzzy resolve: handles missing prefix (e.g. "src/App.tsx" → "web/src/App.tsx")
    if (!filePath.startsWith('/')) {
      try {
        const { path: resolved } = await resolveFilePath(filePath, workspace)
        filePath = resolved
      } catch {
        // Fallback: use as-is
      }
    }

    cb(filePath, line, workspace)
  }, [sessionName, windowIndex])

  const handleFileLinkClickRef = useRef(handleFileLinkClick)
  handleFileLinkClickRef.current = handleFileLinkClick

  const quoteShellPath = useCallback((path: string): string => {
    return `'${path.replace(/'/g, "'\\''")}'`
  }, [])

  const updateTmuxProgress = useCallback((deltaLines: number) => {
    setTmuxScrollProgress((prev) => Math.max(0, Math.min(1, prev + deltaLines * 0.0025)))
  }, [])
  const requestChannelScroll = useCallback((lines: number, syncFallbackProgress = true) => {
    const normalized = Math.trunc(lines)
    if (normalized === 0) return
    chRef.current?.scroll(normalized)
    setTmuxScrollState((prev) => {
      if (!prev || prev.history <= 0) return prev
      const nextPosition = Math.max(0, Math.min(prev.history, prev.position - normalized))
      if (nextPosition === prev.position) return prev
      return { ...prev, position: nextPosition }
    })
    if (syncFallbackProgress) {
      updateTmuxProgress(normalized)
    }
  }, [updateTmuxProgress])

  const {
    containerRef,
    terminal,
    initTerminal,
    write,
    fit,
    focus,
    setFontSize,
  } = useTerminal({
    fontSize,
    // Keep local history so wheel/touch scroll works inside terminal.
    // 20k lines provides ample smooth scrollback without excessive memory.
    scrollback: isMobile ? 3000 : 20000,
    workspace: { session: sessionName, window: windowIndex ?? 0 },
    onFileClick: (path, line, _col) => {
      handleFileLinkClickRef.current(path, line)
    },
    onImageHover: handleImageHover,
    onImageLeave: handleImageLeave,
    onImageClick: (imageUrl) => { onImageClickRef.current?.(imageUrl) },
    onTermUIRender: (html) => { onTermUIRenderRef.current?.(html) },
    onData: (data) => {
      if (data === '@' && atTriggerEnabledRef.current && onAtTriggerRef.current) {
        onAtTriggerRef.current()
        return
      }
      chRef.current?.send(data)
    },
    onResize: (cols, rows) => chRef.current?.resize(cols, rows),
    onScrollRequest: requestChannelScroll,
  })
  const syncBottomForMobileInput = useCallback(() => {
    if (!isMobile) return
    const wrapper = wrapperRef.current
    const active = document.activeElement as HTMLElement | null
    if (!wrapper || !active || !wrapper.contains(active)) return

    terminal.current?.scrollToBottom()
    if ((tmuxScrollStateRef.current?.position ?? 0) > 0) {
      requestChannelScroll(200_000, false)
    }
    setTmuxScrollProgress(1)
  }, [isMobile, requestChannelScroll, terminal])

  const [isExternalDrag, setIsExternalDrag] = useState(false)

  const handleFileDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const hasTerminalFilePayload = isTerminalFileDrag(event.dataTransfer)
    const hasNativeFiles = Array.from(event.dataTransfer.types).includes('Files')
    if (!hasTerminalFilePayload && !hasNativeFiles) return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setIsFileDropOver(true)
    setIsExternalDrag(!hasTerminalFilePayload && hasNativeFiles)
  }, [])

  const handleFileDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const hasTerminalFilePayload = isTerminalFileDrag(event.dataTransfer)
    const hasNativeFiles = Array.from(event.dataTransfer.types).includes('Files')
    if (!hasTerminalFilePayload && !hasNativeFiles) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return

    event.preventDefault()
    event.stopPropagation()
    setIsFileDropOver(false)
    setIsExternalDrag(false)
  }, [])

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    const payload = getTerminalFileDragData(event.dataTransfer)
    const hasNativeFiles = Array.from(event.dataTransfer.types).includes('Files')
    if (!payload && !hasNativeFiles) return

    event.preventDefault()
    event.stopPropagation()
    setIsFileDropOver(false)
    setIsExternalDrag(false)

    const fallbackWorkspace: WorkspaceContext = {
      session: sessionName,
      window: windowIndex ?? 0,
    }

    // Internal file drag (from file explorer)
    if (payload) {
      let absolutePath = payload.path
      if (!absolutePath.startsWith('/')) {
        try {
          const resolved = await resolveAbsoluteFilePath(payload.path, payload.workspace ?? fallbackWorkspace)
          absolutePath = resolved.path
        } catch (error) {
          console.error('Failed to resolve dropped file path', error)
        }
      }
      if (!absolutePath) return
      chRef.current?.send(`${quoteShellPath(absolutePath)} `)
      onFocus?.()
      focus()
      return
    }

    // External file drag (from OS) — resolve absolute paths via server
    const nativeFiles = Array.from(event.dataTransfer.files)
    if (nativeFiles.length > 0) {
      try {
        const entries = nativeFiles.map(f => ({ name: f.name, size: f.size }))
        const result = await locateFiles(entries)
        const parts = result.files
          .map(f => f.path ? quoteShellPath(f.path) : quoteShellPath(f.name))
        if (parts.length > 0) {
          chRef.current?.send(`${parts.join(' ')} `)
          onFocus?.()
          focus()
        }
      } catch {
        // Fallback: just output file names
        const parts = nativeFiles.map(f => quoteShellPath(f.name))
        chRef.current?.send(`${parts.join(' ')} `)
        onFocus?.()
        focus()
      }
    }
  }, [focus, onFocus, quoteShellPath, sessionName, windowIndex])

  // Open a mux channel when the pane mounts (or session/window changes)
  useEffect(() => {
    const winIdx = windowIndex ?? 0
    // Pending init command: consumed on open, sent when shell output settles
    let pendingInitCmd: string | null = null
    let initOutputTimer: ReturnType<typeof setTimeout> | null = null
    let initFallbackTimer: ReturnType<typeof setTimeout> | null = null
    let initSent = false

    const trySendInit = () => {
      if (initSent || !pendingInitCmd) return
      initSent = true
      if (initOutputTimer) clearTimeout(initOutputTimer)
      if (initFallbackTimer) clearTimeout(initFallbackTimer)
      handle.send(pendingInitCmd + '\n')
      pendingInitCmd = null
    }

    const handle = mux.openChannel({
      session: sessionName,
      window: winIdx,
      cols: terminal.current?.cols ?? 80,
      rows: terminal.current?.rows ?? 24,
      onOutput: (data: Uint8Array) => {
        write(data)
        // If we have a pending init command, wait for output to settle
        // (shell prompt is ready when output stops for 200ms)
        if (pendingInitCmd && !initSent) {
          if (initOutputTimer) clearTimeout(initOutputTimer)
          initOutputTimer = setTimeout(trySendInit, 200)
        }
      },
      onOpen: () => {
        setChannelOpen(true)
        setChannelError(null)
        setTmuxScrollState(null)
        setTmuxScrollProgress(1)
        // Scroll to bottom after history replay finishes
        setTimeout(() => terminal.current?.scrollToBottom(), 150)
        // If this window was freshly created with an init command, consume it
        const cmd = consumePendingInit(sessionName, winIdx)
        if (cmd) {
          pendingInitCmd = cmd
          // Fallback: send after 3s even if no output detected (e.g. blank shell)
          initFallbackTimer = setTimeout(trySendInit, 3000)
        }
      },
      onClose: (code: number) => setExitCode(code),
      onError: (message: string) => setChannelError(message),
      onScrollState: ({ history, position }) => {
        const clampedHistory = Math.max(0, history)
        const clampedPosition = Math.max(0, Math.min(clampedHistory, position))
        setTmuxScrollState({ history: clampedHistory, position: clampedPosition })
        if (clampedHistory > 0) {
          setTmuxScrollProgress(1 - clampedPosition / clampedHistory)
        } else {
          setTmuxScrollProgress(1)
        }
      },
    })
    chRef.current = handle
    setChannelOpen(false)
    setExitCode(null)
    setChannelError(null)

    return () => {
      // Clean up init timers
      if (initOutputTimer) clearTimeout(initOutputTimer)
      if (initFallbackTimer) clearTimeout(initFallbackTimer)
      // Close the channel when this TerminalPane unmounts
      handle.close()
      chRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName, windowIndex])

  useEffect(() => {
    initTerminal()
    // Trigger fade-in after mount
    requestAnimationFrame(() => setMounted(true))
  }, [initTerminal])

  // Sync terminal ref to parent component
  useEffect(() => {
    if (externalTerminalRef && terminal.current) {
      (externalTerminalRef as React.MutableRefObject<typeof terminal.current>).current = terminal.current
    }
  }, [terminal, externalTerminalRef])

  // Sync actual terminal size to PTY after channel opens.
  // Fixes: initial open uses default 80x24, but terminal may already be larger.
  useEffect(() => {
    if (channelOpen && terminal.current) {
      requestAnimationFrame(() => {
        fit()
        if (terminal.current) {
          chRef.current?.resize(terminal.current.cols, terminal.current.rows)
        }
      })
    }
  }, [channelOpen, fit, terminal])

  useEffect(() => {
    if (focused) focus()
  }, [focused, focus])

  useEffect(() => {
    setFontSize(fontSize)
  }, [fontSize, setFontSize])

  useEffect(() => {
    fit()
  }, [fit])

  // Mobile: re-fit terminal when visual viewport changes (keyboard open/close)
  useEffect(() => {
    if (!isMobile) return

    const handleResize = () => {
      requestAnimationFrame(() => {
        fit()
        // Keyboard open/close can shift viewport without updating terminal history position.
        setTimeout(syncBottomForMobileInput, 40)
      })
    }

    const vv = window.visualViewport
    vv?.addEventListener('resize', handleResize)
    vv?.addEventListener('scroll', handleResize)
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      vv?.removeEventListener('resize', handleResize)
      vv?.removeEventListener('scroll', handleResize)
      window.removeEventListener('resize', handleResize)
    }
  }, [isMobile, fit, mobileBottomOffset, syncBottomForMobileInput])

  const getScrollMetrics = useCallback(() => {
    const term = terminal.current
    if (!term) return null

    const rows = Math.max(term.rows, 1)
    const baseY = Math.max(term.buffer.active.baseY, 0)
    if (baseY <= 0) return null

    const totalRows = rows + baseY
    const thumbHeight = Math.max(8, (rows / totalRows) * 100)
    const maxTop = Math.max(0, 100 - thumbHeight)
    const viewportY = Math.max(0, Math.min(term.buffer.active.viewportY, baseY))
    const top = baseY > 0 ? (viewportY / baseY) * maxTop : 0

    return { baseY, thumbHeight, top }
  }, [terminal])

  const scrollToClientY = useCallback((clientY: number) => {
    const track = scrollTrackRef.current
    const term = terminal.current
    const metrics = getScrollMetrics()
    if (!track || !term || !metrics) return

    const rect = track.getBoundingClientRect()
    if (rect.height <= 0) return

    const thumbPx = (metrics.thumbHeight / 100) * rect.height
    const maxTopPx = Math.max(1, rect.height - thumbPx)
    const rawTopPx = clientY - rect.top - dragOffsetPxRef.current
    const topPx = Math.max(0, Math.min(rawTopPx, maxTopPx))

    const maxTopPercent = Math.max(0, 100 - metrics.thumbHeight)
    const topPercent = maxTopPx > 0 ? (topPx / maxTopPx) * maxTopPercent : 0
    const targetViewportY = maxTopPercent > 0
      ? Math.round((topPercent / maxTopPercent) * metrics.baseY)
      : 0

    term.scrollToLine(targetViewportY)
  }, [getScrollMetrics, terminal])

  const handleScrollbarPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return

    const track = scrollTrackRef.current
    const metrics = hasTmuxScrollState ? null : getScrollMetrics()
    if (!track) return

    event.preventDefault()
    event.stopPropagation()

    const rect = track.getBoundingClientRect()
    const clampProgress = (clientY: number) =>
      Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(rect.height, 1)))
    let dragProgress =
      tmuxScrollState && tmuxScrollState.history > 0
        ? 1 - tmuxScrollState.position / tmuxScrollState.history
        : tmuxScrollProgress
    let dragPosition = tmuxScrollState?.position ?? null
    const dragHistory = tmuxScrollState?.history ?? null

    const applyTmuxProgress = (nextProgress: number) => {
      const clampedProgress = Math.max(0, Math.min(1, nextProgress))

      if (dragHistory && dragHistory > 0 && dragPosition !== null) {
        const targetPosition = Math.max(0, Math.min(dragHistory, Math.round((1 - clampedProgress) * dragHistory)))
        const lines = dragPosition - targetPosition
        if (lines !== 0) {
          requestChannelScroll(lines, false)
        }
        dragProgress = clampedProgress
        dragPosition = targetPosition
        setTmuxScrollState((prev) =>
          prev ? { history: prev.history, position: Math.max(0, Math.min(prev.history, targetPosition)) } : prev
        )
        setTmuxScrollProgress(clampedProgress)
        return
      }

      const delta = clampedProgress - dragProgress
      if (Math.abs(delta) < 0.005) return

      const direction = delta < 0 ? -1 : 1
      let lines = Math.max(1, Math.ceil(Math.abs(delta) * 6000))
      if (clampedProgress <= 0.02) lines = 200_000
      if (clampedProgress >= 0.98) lines = 200_000
      requestChannelScroll(direction * lines, false)
      dragProgress = clampedProgress
      setTmuxScrollProgress(clampedProgress)
    }

    if (metrics) {
      const thumbPx = (metrics.thumbHeight / 100) * rect.height
      const currentTopPx = (metrics.top / 100) * rect.height
      const target = event.target as HTMLElement
      const fromThumb = target.dataset.scrollThumb === 'true'
      dragOffsetPxRef.current = fromThumb ? Math.max(0, event.clientY - rect.top - currentTopPx) : thumbPx / 2
      scrollToClientY(event.clientY)
    } else {
      dragOffsetPxRef.current = 0
      applyTmuxProgress(clampProgress(event.clientY))
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      if (metrics) {
        scrollToClientY(moveEvent.clientY)
      } else {
        applyTmuxProgress(clampProgress(moveEvent.clientY))
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }, [getScrollMetrics, hasTmuxScrollState, isMobile, requestChannelScroll, scrollToClientY, tmuxScrollProgress, tmuxScrollState])

  // Draw an explicit scrollbar indicator so history position is visible
  // even when the OS/browser hides native overlay scrollbars.
  useEffect(() => {
    if (hasTmuxScrollState) {
      setScrollIndicator((prev) => (prev.visible ? { visible: false, top: 0, height: 0 } : prev))
      return
    }

    const update = () => {
      const metrics = getScrollMetrics()
      if (!metrics) {
        setScrollIndicator((prev) => (prev.visible ? { visible: false, top: 0, height: 0 } : prev))
        return
      }

      setScrollIndicator((prev) => {
        const same =
          prev.visible &&
          Math.abs(prev.top - metrics.top) < 0.5 &&
          Math.abs(prev.height - metrics.thumbHeight) < 0.5
        return same ? prev : { visible: true, top: metrics.top, height: metrics.thumbHeight }
      })
    }

    const timer = window.setInterval(update, 120)
    update()
    return () => window.clearInterval(timer)
  }, [getScrollMetrics, channelOpen, hasTmuxScrollState, isMobile])

  const activeIndicator = (() => {
    if (hasTmuxScrollState && tmuxScrollState) {
      const rows = Math.max(terminal.current?.rows ?? 24, 1)
      const history = Math.max(tmuxScrollState.history, 1)
      const thumbHeight = Math.max(8, (rows / (rows + history)) * 100)
      const maxTop = Math.max(0, 100 - thumbHeight)
      const progress = Math.max(0, Math.min(1, 1 - tmuxScrollState.position / history))
      return { visible: true, top: progress * maxTop, height: thumbHeight }
    }
    if (scrollIndicator.visible) {
      return scrollIndicator
    }
    if (channelOpen) {
      return { visible: true, top: Math.max(0, Math.min(86, tmuxScrollProgress * 86)), height: 14 }
    }
    return { visible: false, top: 0, height: 0 }
  })()

  // Derive connection status from mux status + channel state
  const isPtyExhausted = channelError?.includes('PTY_EXHAUSTED') ?? false
  const isConnecting = !isPtyExhausted && (mux.status === 'connecting' || (mux.status === 'connected' && !channelOpen && exitCode === null && !channelError))
  const isDisconnected = mux.status === 'disconnected' && exitCode === null && !channelError

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full min-h-0 overflow-hidden transition-opacity duration-150 ${isMobile ? 'mobile-terminal-pane' : ''} ${mounted ? 'opacity-100' : 'opacity-0'}`}
      style={{ height: '100%', background: 'var(--color-bg)' }}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
      onClick={() => {
        onFocus?.()
        // Don't re-focus when user just finished a text selection (would clear it)
        if (!terminal.current?.hasSelection()) {
          focus()
        }
        if (isMobile) {
          requestAnimationFrame(() => syncBottomForMobileInput())
        }
      }}
      >
        <div
          ref={containerRef}
          className="w-full h-full overflow-hidden"
          style={{ background: 'var(--color-bg)' }}
        />

      {isFileDropOver && (
        <div className="absolute inset-0 z-[8] pointer-events-none bg-[var(--color-success)]/10 border-2 border-dashed border-[var(--color-success)]/70">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-2 py-1 text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-bg)]/90 border border-[var(--color-success)]/50">
              {isExternalDrag ? t('terminal.dropExternal') : t('terminal.dropFile')}
            </span>
          </div>
        </div>
      )}

      {activeIndicator.visible && (
        <div
          ref={scrollTrackRef}
          data-scroll-track="true"
          className={`absolute right-0 top-0 bottom-0 z-[6] ${isMobile ? 'w-[3px] pointer-events-none' : 'w-[12px]'} bg-transparent`}
          onPointerDown={isMobile ? undefined : handleScrollbarPointerDown}
        >
          <div
            data-scroll-thumb="true"
            className="absolute left-0 right-0"
            style={{
              background: 'var(--color-scrollbar-accent)',
              top: `${activeIndicator.top}%`,
              height: `${activeIndicator.height}%`,
              opacity: isMobile ? 0.9 : 1,
            }}
          />
        </div>
      )}

      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <span className="text-xs text-[#00ff41] animate-pulse font-mono">
            {t('terminal.connecting')}
          </span>
        </div>
      )}

      {isPtyExhausted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 z-10">
          <div className="text-center max-w-[280px]">
            <span className="text-sm text-[var(--color-danger)] font-mono block mb-2">
              {t('terminal.ptyExhausted')}
            </span>
            <span className="text-[10px] text-[var(--color-fg-muted)] font-mono block mb-3 leading-relaxed">
              {t('terminal.ptyExhaustedHint')}
            </span>
            <button
              onClick={() => {
                setChannelError(null)
                window.location.reload()
              }}
              className="text-xs font-mono px-3 py-1 border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
            >
              {t('terminal.reconnect')}
            </button>
          </div>
        </div>
      )}

      {channelError && !isPtyExhausted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 z-10">
          <div className="text-center max-w-[280px]">
            <span className="text-xs text-[var(--color-warning)] font-mono block mb-2">
              {t('terminal.channelError')}
            </span>
            <span className="text-[10px] text-[var(--color-fg-muted)] font-mono block mb-3 leading-relaxed break-all">
              {channelError}
            </span>
            <button
              onClick={() => {
                setChannelError(null)
                window.location.reload()
              }}
              className="text-xs font-mono px-3 py-1 border border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10"
            >
              {t('terminal.retry')}
            </button>
          </div>
        </div>
      )}

      {isDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="text-center">
            <span className="text-xs text-[var(--color-warning)] font-mono block mb-2">
              {t('terminal.reconnecting')}
            </span>
            <div className="w-4 h-4 border-2 border-[var(--color-warning)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      )}

      {exitCode !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="text-center">
            <span className="text-xs text-[var(--color-fg-muted)] font-mono block mb-2">
              {t('terminal.exitCode', { code: String(exitCode) })}
            </span>
            <button
              onClick={() => {
                setExitCode(null)
                window.location.reload()
              }}
              className="text-xs font-mono px-3 py-1 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41]/10"
            >
              {t('terminal.reconnect')}
            </button>
          </div>
        </div>
      )}

      {imageTooltip && (
        <ImagePreviewTooltip
          imageUrl={imageTooltip.imageUrl}
          imagePath={imageTooltip.imagePath}
          mouseX={imageTooltip.mouseX}
          mouseY={imageTooltip.mouseY}
          onClose={() => setImageTooltip(null)}
          onKeepAlive={handleImageTooltipEnter}
          onOpenViewer={(url) => {
            setImageTooltip(null)
            onImageClickRef.current?.(url)
          }}
          onDelete={handleImageDelete}
        />
      )}
    </div>
  )
}
