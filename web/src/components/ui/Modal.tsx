import { useEffect, type ReactNode } from 'react'
import { useCrtClose } from '../../hooks/useCrtClose'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, children, className = '' }: ModalProps) {
  const { visible, closing } = useCrtClose(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 bg-[var(--color-bg)]/80 flex items-center justify-center z-50 ${closing ? 'pipboy-crt-backdrop-close' : ''}`}
      style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
      onClick={onClose}
    >
      <div
        className={`${closing ? 'pipboy-crt-close-center' : 'pipboy-crt-open-center'} bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] p-6 w-full max-w-md mx-4 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
