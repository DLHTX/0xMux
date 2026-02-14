import { useState, useCallback } from 'react'

export interface ToastItem {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
  imageUrl?: string
  onClick?: () => void
}

export interface AddToastOptions {
  imageUrl?: string
  onClick?: () => void
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'error', options?: AddToastOptions) => {
    // crypto.randomUUID() is unavailable over plain HTTP on LAN; use fallback
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
    setToasts((prev) => [...prev, { id, message, type, imageUrl: options?.imageUrl, onClick: options?.onClick }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
