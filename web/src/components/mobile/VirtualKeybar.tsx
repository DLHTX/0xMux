import { useRef, useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconX,
} from '../../lib/icons'

/** Approximate height of the VirtualKeybar in px (border + padding + button) */
export const VIRTUAL_KEYBAR_HEIGHT = 58

interface VirtualKeybarProps {
  /** xterm Terminal instance to send keys to */
  terminalRef: React.RefObject<import('@xterm/xterm').Terminal | null>
  /** Called when the back/close button is pressed (go back to sessions) */
  onBack?: () => void
}

type KeyAction =
  | { type: 'key'; key: string }
  | { type: 'ctrl'; key: string; label: string }
  | { type: 'sequence'; sequence: string; label: string }

const KEY_ACTIONS: KeyAction[] = [
  // 方向键
  { type: 'key', key: '\x1b[A' }, // ↑
  { type: 'key', key: '\x1b[B' }, // ↓
  { type: 'key', key: '\x1b[D' }, // ←
  { type: 'key', key: '\x1b[C' }, // →

  // 特殊键
  { type: 'key', key: '\t' }, // Tab
  { type: 'key', key: '\x1b' }, // Esc

  // Ctrl组合键
  { type: 'ctrl', key: '\x03', label: 'Ctrl+C' },
  { type: 'ctrl', key: '\x04', label: 'Ctrl+D' },
  { type: 'ctrl', key: '\x1a', label: 'Ctrl+Z' },
  { type: 'ctrl', key: '\x0c', label: 'Ctrl+L' },
  { type: 'ctrl', key: '\x12', label: 'Ctrl+R' },
]

export function VirtualKeybar({ terminalRef, onBack }: VirtualKeybarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [ctrlPressed, setCtrlPressed] = useState(false)
  const [bottomOffset, setBottomOffset] = useState(0)

  // Track visual viewport so the bar floats above the virtual keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      // Distance from bottom of layout viewport to bottom of visual viewport
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setBottomOffset(Math.max(0, Math.round(offset)))
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const sendKey = (action: KeyAction) => {
    const term = terminalRef.current
    if (!term) return

    if (action.type === 'key') {
      term.input(action.key, true)
    } else if (action.type === 'ctrl' || action.type === 'sequence') {
      term.input(action.key, true)
    }

    // Visual feedback
    if (action.type === 'ctrl') {
      setCtrlPressed(true)
      setTimeout(() => setCtrlPressed(false), 150)
    }
  }

  const renderButton = (action: KeyAction, index: number) => {
    let icon = null
    let label = ''

    if (action.type === 'key') {
      switch (action.key) {
        case '\x1b[A':
          icon = IconChevronUp
          label = '↑'
          break
        case '\x1b[B':
          icon = IconChevronDown
          label = '↓'
          break
        case '\x1b[D':
          icon = IconChevronLeft
          label = '←'
          break
        case '\x1b[C':
          icon = IconChevronRight
          label = '→'
          break
        case '\t':
          label = 'Tab'
          break
        case '\x1b':
          label = 'Esc'
          icon = IconX
          break
      }
    } else if (action.type === 'ctrl' || action.type === 'sequence') {
      label = action.label
    }

    return (
      <button
        key={index}
        onClick={() => sendKey(action)}
        className="shrink-0 h-10 px-4 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)]
                   hover:bg-[var(--color-border-light)] active:bg-[var(--color-fg)] active:text-[var(--color-bg)]
                   transition-colors font-bold text-xs flex items-center justify-center gap-1.5 min-w-[44px]
                   shadow-[2px_2px_0_var(--color-border-light)]"
        style={{ touchAction: 'manipulation' }}
      >
        {icon && <Icon icon={icon} width={14} />}
        {label && <span>{label}</span>}
      </button>
    )
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 bg-[var(--color-bg)] border-t-[length:var(--border-w)] border-[var(--color-border-light)]"
      style={{ bottom: `${bottomOffset}px` }}
    >
      {/* Ctrl indicator */}
      {ctrlPressed && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 px-2 py-0.5 bg-[var(--color-success)] text-[var(--color-bg)] text-[10px] font-bold rounded-sm">
          CTRL
        </div>
      )}

      {/* Scrollable button row */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden py-2 px-3"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="flex gap-2 w-max">
          {/* Back / close terminal view button */}
          {onBack && (
            <button
              onClick={onBack}
              className="shrink-0 h-10 px-3 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)]
                         hover:bg-[var(--color-border-light)] active:bg-[var(--color-fg)] active:text-[var(--color-bg)]
                         transition-colors font-bold text-xs flex items-center justify-center gap-1 min-w-[44px]
                         shadow-[2px_2px_0_var(--color-border-light)]"
              style={{ touchAction: 'manipulation' }}
            >
              <Icon icon={IconChevronLeft} width={14} />
              <span>Back</span>
            </button>
          )}
          {KEY_ACTIONS.map((action, idx) => renderButton(action, idx))}
        </div>
      </div>

      {/* Hide scrollbar */}
      <style>{`
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
