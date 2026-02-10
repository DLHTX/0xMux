import { useCallback, useEffect, useRef, useState } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { usePtySocket } from '../../hooks/usePtySocket'
import { useMobile } from '../../hooks/useMobile'
import type { ConnectionStatus } from '../../lib/types'

interface TerminalPaneProps {
  sessionName: string
  fontSize?: number
  focused?: boolean
  onFocus?: () => void
  terminalRef?: React.RefObject<import('@xterm/xterm').Terminal | null>
}

export function TerminalPane({
  sessionName,
  fontSize = 14,
  focused = false,
  onFocus,
  terminalRef: externalTerminalRef,
}: TerminalPaneProps) {
  const [ptyStatus, setPtyStatus] = useState<ConnectionStatus>('disconnected')
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
    onData: (data) => send(data),
    onResize: (cols, rows) => resize(cols, rows),
  })

  const { status, send, resize } = usePtySocket({
    session: sessionName,
    onOutput: useCallback(
      (data: Uint8Array) => write(data),
      [write]
    ),
    onExit: useCallback((code: number) => setExitCode(code), []),
    onError: useCallback(() => {}, []),
  })

  useEffect(() => {
    setPtyStatus(status)
  }, [status])

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

  // Sync actual terminal size to PTY after WebSocket connects.
  // Fixes: initial URL uses default 80x24, but terminal may already be larger.
  useEffect(() => {
    if (status === 'connected' && terminal.current) {
      requestAnimationFrame(() => {
        fit()
        if (terminal.current) {
          resize(terminal.current.cols, terminal.current.rows)
        }
      })
    }
  }, [status, fit, resize, terminal])

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
      const available = vv.height - wrapperTop
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
  }, [isMobile, fit])

  const borderClass = focused
    ? 'ring-1 ring-[var(--color-success)]'
    : 'ring-1 ring-transparent'

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full min-h-0 overflow-hidden ${borderClass} transition-[box-shadow,opacity] duration-150 ${mounted ? 'opacity-100' : 'opacity-0'}`}
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

      {ptyStatus === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <span className="text-xs text-[#00ff41] animate-pulse font-mono">
            Connecting...
          </span>
        </div>
      )}

      {ptyStatus === 'disconnected' && exitCode === null && (
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
