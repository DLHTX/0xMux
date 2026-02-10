import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconX,
} from '../../lib/icons'

interface VirtualKeybarProps {
  /** xterm Terminal instance to send keys to */
  terminalRef: React.RefObject<import('@xterm/xterm').Terminal | null>
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

export function VirtualKeybar({ terminalRef }: VirtualKeybarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [ctrlPressed, setCtrlPressed] = useState(false)

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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg)]/95 backdrop-blur-sm border-t-[length:var(--border-w)] border-[var(--color-border-light)] shadow-lg">
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
