import { useCallback, useEffect, useRef, useState } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useMux } from '../../contexts/MuxContext'
import { useMobile } from '../../hooks/useMobile'
import { consumePendingInit } from '../../lib/init-commands'
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
}

export function TerminalPane({
  sessionName,
  windowIndex,
  fontSize = 14,
  focused = false,
  onFocus,
  terminalRef: externalTerminalRef,
  mobileBottomOffset = 0,
}: TerminalPaneProps) {
  const mux = useMux()
  const chRef = useRef<MuxChannelHandle | null>(null)

  const [channelOpen, setChannelOpen] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const isMobile = useMobile()
  const wrapperRef = useRef<HTMLDivElement>(null)

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
    onData: (data) => chRef.current?.send(data),
    onResize: (cols, rows) => chRef.current?.resize(cols, rows),
  })

  // Open a mux channel when the pane mounts (or session/window changes)
  useEffect(() => {
    const winIdx = windowIndex ?? 0
    const handle = mux.openChannel({
      session: sessionName,
      window: winIdx,
      cols: terminal.current?.cols ?? 80,
      rows: terminal.current?.rows ?? 24,
      onOutput: (data: Uint8Array) => write(data),
      onOpen: () => {
        setChannelOpen(true)
        // If this window was freshly created with an init command, send it
        const cmd = consumePendingInit(sessionName, winIdx)
        if (cmd) {
          // Small delay so the shell prompt is ready
          setTimeout(() => handle.send(cmd + '\n'), 600)
        }
      },
      onClose: (code: number) => setExitCode(code),
      onError: () => {},
    })
    chRef.current = handle
    setChannelOpen(false)
    setExitCode(null)

    return () => {
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
      // eslint-disable-next-line react-hooks/immutability
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

  // Mobile: adjust height when virtual keyboard opens/closes
  useEffect(() => {
    if (!isMobile || !window.visualViewport) return

    const vv = window.visualViewport

    const handleResize = () => {
      // When keyboard opens, visualViewport.height shrinks
      const wrapperTop = wrapperRef.current?.getBoundingClientRect().top ?? 0
      const available = vv.height - wrapperTop - mobileBottomOffset
      setViewportHeight(Math.max(available, 100))
      // Re-fit terminal after layout change
      requestAnimationFrame(() => fit())
    }

    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)

    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
      setViewportHeight(null)
    }
  }, [isMobile, fit, mobileBottomOffset])

  // Derive connection status from mux status + channel state
  const isConnecting = mux.status === 'connecting' || (mux.status === 'connected' && !channelOpen && exitCode === null)
  const isDisconnected = mux.status === 'disconnected' && exitCode === null

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full min-h-0 overflow-hidden transition-opacity duration-150 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      style={isMobile && viewportHeight !== null ? { height: `${viewportHeight}px` } : { height: '100%' }}
      onClick={() => {
        onFocus?.()
        focus()
      }}
    >
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{ background: '#0a0a0a' }}
      />

      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <span className="text-xs text-[#00ff41] animate-pulse font-mono">
            Connecting...
          </span>
        </div>
      )}

      {isDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="text-center">
            <span className="text-xs text-[var(--color-warning)] font-mono block mb-2">
              Reconnecting...
            </span>
            <div className="w-4 h-4 border-2 border-[var(--color-warning)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      )}

      {exitCode !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="text-center">
            <span className="text-xs text-[var(--color-fg-muted)] font-mono block mb-2">
              Process exited with code {exitCode}
            </span>
            <button
              onClick={() => {
                setExitCode(null)
                window.location.reload()
              }}
              className="text-xs font-mono px-3 py-1 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41]/10"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
