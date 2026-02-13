import { useRef, useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import type { IconifyIcon } from '@iconify/types'
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconX,
  IconSettings,
  IconPlus,
} from '../../lib/icons'

/** Approximate height of the compact VirtualKeybar in px (border + padding + button) */
export const VIRTUAL_KEYBAR_HEIGHT = 50

const STORAGE_KEY = '0xmux-mobile-keybar-actions'
const MAX_CUSTOM_ACTIONS = 18

interface VirtualKeybarProps {
  /** xterm Terminal instance to send keys to */
  terminalRef: React.RefObject<import('@xterm/xterm').Terminal | null>
  /** Called when the back/close button is pressed (go back to sessions) */
  onBack?: () => void
}

type KeyAction = {
  id: string
  label: string
  sequence: string
  icon?: string | IconifyIcon
}

const NAV_ACTIONS: KeyAction[] = [
  { id: 'arrow-up', label: '↑', sequence: '\x1b[A', icon: IconChevronUp },
  { id: 'arrow-down', label: '↓', sequence: '\x1b[B', icon: IconChevronDown },
  { id: 'arrow-left', label: '←', sequence: '\x1b[D', icon: IconChevronLeft },
  { id: 'arrow-right', label: '→', sequence: '\x1b[C', icon: IconChevronRight },
]

const QUICK_ACTIONS: KeyAction[] = [
  { id: 'tab', label: 'Tab', sequence: '\t' },
  { id: 'esc', label: 'Esc', sequence: '\x1b', icon: IconX },
  { id: 'ctrl-c', label: 'Ctrl+C', sequence: '\x03' },
  { id: 'ctrl-d', label: 'Ctrl+D', sequence: '\x04' },
  { id: 'slash', label: '/', sequence: '/' },
  { id: 'dollar', label: '$', sequence: '$' },
  { id: 'pipe', label: '|', sequence: '|' },
]

const DEFAULT_CUSTOM_ACTIONS: KeyAction[] = [
  QUICK_ACTIONS[0],
  QUICK_ACTIONS[1],
  QUICK_ACTIONS[2],
  QUICK_ACTIONS[4],
  QUICK_ACTIONS[5],
]

function randomId() {
  return `k_${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeAction(raw: unknown): KeyAction | null {
  if (!raw || typeof raw !== 'object') return null

  const action = raw as Partial<KeyAction>
  const label = (action.label ?? '').toString().trim().slice(0, 16)
  const sequence = (action.sequence ?? '').toString().slice(0, 16)

  if (!label || !sequence) return null

  return {
    id: action.id?.toString().trim() || randomId(),
    label,
    sequence,
  }
}

function loadCustomActions(): KeyAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CUSTOM_ACTIONS.map((action) => ({ ...action, id: randomId() }))

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_CUSTOM_ACTIONS.map((action) => ({ ...action, id: randomId() }))

    const next = parsed
      .map(sanitizeAction)
      .filter((action): action is KeyAction => action !== null)
      .slice(0, MAX_CUSTOM_ACTIONS)

    return next.length > 0 ? next : DEFAULT_CUSTOM_ACTIONS.map((action) => ({ ...action, id: randomId() }))
  } catch {
    return DEFAULT_CUSTOM_ACTIONS.map((action) => ({ ...action, id: randomId() }))
  }
}

function saveCustomActions(actions: KeyAction[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(actions.map((action) => ({ id: action.id, label: action.label, sequence: action.sequence })))
    )
  } catch {
    // ignore storage errors on mobile browsers
  }
}

export function VirtualKeybar({ terminalRef, onBack }: VirtualKeybarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [ctrlPressed, setCtrlPressed] = useState(false)
  const [bottomOffset, setBottomOffset] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [customActions, setCustomActions] = useState<KeyAction[]>(loadCustomActions)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftSequence, setDraftSequence] = useState('')

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

  useEffect(() => {
    saveCustomActions(customActions)
  }, [customActions])

  const sendKey = (action: KeyAction) => {
    const term = terminalRef.current
    if (!term) return

    term.input(action.sequence, true)

    if (action.label.startsWith('Ctrl+')) {
      setCtrlPressed(true)
      setTimeout(() => setCtrlPressed(false), 150)
    }
  }

  const actionExists = (candidate: KeyAction) => {
    return customActions.some(
      (action) => action.label.toLowerCase() === candidate.label.toLowerCase() || action.sequence === candidate.sequence
    )
  }

  const addQuickAction = (template: KeyAction) => {
    if (customActions.length >= MAX_CUSTOM_ACTIONS) return
    if (actionExists(template)) return

    setCustomActions((prev) => [...prev, { ...template, id: randomId() }])
  }

  const addCustomAction = () => {
    if (customActions.length >= MAX_CUSTOM_ACTIONS) return

    const sequence = draftSequence.trim().slice(0, 16)
    const label = (draftLabel.trim() || sequence).slice(0, 16)

    if (!sequence || !label) return

    const next: KeyAction = {
      id: randomId(),
      label,
      sequence,
    }

    if (actionExists(next)) return

    setCustomActions((prev) => [...prev, next])
    setDraftLabel('')
    setDraftSequence('')
  }

  const removeCustomAction = (id: string) => {
    setCustomActions((prev) => prev.filter((action) => action.id !== id))
  }

  const renderButton = (action: KeyAction) => {
    return (
      <button
        key={action.id}
        onClick={() => sendKey(action)}
        className="shrink-0 h-8 px-2.5 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)]
                   hover:bg-[var(--color-border-light)] active:bg-[var(--color-fg)] active:text-[var(--color-bg)]
                   transition-colors font-bold text-[11px] flex items-center justify-center gap-1 min-w-[36px]
                   shadow-[1px_1px_0_var(--color-border-light)]"
        style={{ touchAction: 'manipulation' }}
      >
        {action.icon && <Icon icon={action.icon} width={12} />}
        <span>{action.label}</span>
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

      {editorOpen && (
        <div className="px-2.5 pt-2 pb-2 border-b-[length:var(--border-w)] border-[var(--color-border-light)] bg-[var(--color-bg-alt)]/40">
          <div className="text-[10px] font-bold text-[var(--color-fg-muted)] mb-1.5">
            自定义快捷按键（同步保存在当前浏览器）
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {QUICK_ACTIONS.map((action) => {
              const exists = actionExists(action)
              return (
                <button
                  key={`quick-${action.id}`}
                  onClick={() => addQuickAction(action)}
                  disabled={exists || customActions.length >= MAX_CUSTOM_ACTIONS}
                  className="shrink-0 h-7 px-2 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-border-light)]
                             bg-[var(--color-bg)] disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  {action.label}
                </button>
              )
            })}
          </div>

          <div className="flex gap-1.5 mt-1.5">
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="显示名(可选)"
              className="w-[38%] h-7 px-2 text-[11px] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] outline-none"
            />
            <input
              value={draftSequence}
              onChange={(e) => setDraftSequence(e.target.value)}
              placeholder="发送内容，如 / 或 $"
              className="flex-1 h-7 px-2 text-[11px] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border-light)] outline-none"
            />
            <button
              onClick={addCustomAction}
              disabled={!draftSequence.trim() || customActions.length >= MAX_CUSTOM_ACTIONS}
              className="shrink-0 h-7 w-7 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border-light)]
                         bg-[var(--color-bg)] disabled:opacity-35 disabled:cursor-not-allowed"
              title="添加"
            >
              <Icon icon={IconPlus} width={12} />
            </button>
          </div>

          {customActions.length > 0 && (
            <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              {customActions.map((action) => (
                <button
                  key={`remove-${action.id}`}
                  onClick={() => removeCustomAction(action.id)}
                  className="shrink-0 h-6 px-2 text-[10px] font-bold border-[length:var(--border-w)] border-[var(--color-border-light)]
                             bg-[var(--color-bg)]/85 flex items-center gap-1"
                  title={`移除 ${action.label}`}
                >
                  <span>{action.label}</span>
                  <Icon icon={IconX} width={10} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scrollable button row */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden py-1.5 px-2"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="flex gap-1.5 w-max">
          {/* Back / close terminal view button */}
          {onBack && (
            <button
              onClick={onBack}
              className="shrink-0 h-8 px-2 bg-[var(--color-bg-alt)] border-[length:var(--border-w)] border-[var(--color-border-light)]
                         hover:bg-[var(--color-border-light)] active:bg-[var(--color-fg)] active:text-[var(--color-bg)]
                         transition-colors font-bold text-[11px] flex items-center justify-center gap-1 min-w-[36px]
                         shadow-[1px_1px_0_var(--color-border-light)]"
              style={{ touchAction: 'manipulation' }}
            >
              <Icon icon={IconChevronLeft} width={12} />
              <span>Back</span>
            </button>
          )}

          {NAV_ACTIONS.map((action) => renderButton(action))}
          {customActions.map((action) => renderButton(action))}

          <button
            onClick={() => setEditorOpen((prev) => !prev)}
            className={`shrink-0 h-8 px-2 border-[length:var(--border-w)] transition-colors font-bold text-[11px] flex items-center justify-center gap-1 min-w-[36px]
              ${editorOpen
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'border-[var(--color-border-light)] bg-[var(--color-bg-alt)] text-[var(--color-fg)] active:bg-[var(--color-border-light)]'
              }`}
            style={{ touchAction: 'manipulation' }}
            title="管理按键"
          >
            <Icon icon={IconSettings} width={12} />
            <span>键盘</span>
          </button>
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
