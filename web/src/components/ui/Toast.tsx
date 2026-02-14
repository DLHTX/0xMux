import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { IconX } from '../../lib/icons'
import type { ToastItem } from '../../hooks/useToast'

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

function ToastEntry({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(() => onDismiss(toast.id), 150)
  }

  const colorMap = {
    error: 'border-[var(--color-danger)] text-[var(--color-danger)]',
    success: 'border-[var(--color-success)] text-[var(--color-success)]',
    info: 'border-[var(--color-border)] text-[var(--color-fg)]',
  }

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 min-w-[240px] max-w-[360px]
        bg-[var(--color-bg)] border-[length:var(--border-w)] rounded-[var(--radius)]
        shadow-lg transition-all duration-150 ease-out
        ${colorMap[toast.type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
        ${toast.onClick ? 'cursor-pointer' : ''}
      `}
      onClick={toast.onClick}
    >
      {/* Optional thumbnail */}
      {toast.imageUrl && (
        <div className="shrink-0 w-8 h-8 border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-bg-alt)]">
          <img src={toast.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <span className="flex-1 text-xs font-mono truncate">{toast.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleDismiss()
        }}
        className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <Icon icon={IconX} width={12} height={12} />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastEntry toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
