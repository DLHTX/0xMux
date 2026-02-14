import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { IconTrash } from '../../lib/icons'

interface ImagePreviewTooltipProps {
  imageUrl: string
  imagePath: string
  mouseX: number
  mouseY: number
  onClose: () => void
  onKeepAlive: () => void
  onOpenViewer: (url: string) => void
  onDelete: (imagePath: string) => void
}

export function ImagePreviewTooltip({
  imageUrl,
  imagePath,
  mouseX,
  mouseY,
  onClose,
  onKeepAlive,
  onOpenViewer,
  onDelete,
}: ImagePreviewTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [visible, setVisible] = useState(false)
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  const filename = imagePath.split('/').pop() ?? imagePath

  // Reposition after image loads (size changes)
  const reposition = () => {
    const el = ref.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const padding = 8
    let top = mouseY - rect.height - padding
    let left = mouseX - rect.width / 2

    // If not enough space above, show below
    if (top < padding) {
      top = mouseY + padding
    }

    // Clamp horizontal
    if (left < padding) left = padding
    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding
    }

    setPosition({ top, left })
  }

  useEffect(() => {
    reposition()
    requestAnimationFrame(() => setVisible(true))
  }, [mouseX, mouseY]) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] border border-[var(--color-border-light)] bg-[var(--color-bg)] shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.1s ease',
        maxWidth: 260,
      }}
      onMouseEnter={() => onKeepAlive()}
      onMouseLeave={onClose}
    >
      {/* Image preview — click to open viewer */}
      <div
        className="cursor-pointer overflow-hidden bg-[#0a0a0a] flex items-center justify-center"
        style={{ maxWidth: 240, maxHeight: 180, margin: 4, minHeight: imgStatus === 'loading' ? 40 : undefined }}
        onClick={() => onOpenViewer(imageUrl)}
      >
        {imgStatus === 'error' ? (
          <span className="text-[10px] text-[var(--color-fg-muted)] px-3 py-4 text-center">
            Failed to load image
          </span>
        ) : (
          <img
            src={imageUrl}
            alt={filename}
            className="object-contain"
            style={{ maxWidth: 240, maxHeight: 180, display: imgStatus === 'loading' ? 'none' : 'block' }}
            draggable={false}
            onLoad={() => {
              setImgStatus('loaded')
              // Reposition after image renders (tooltip size changes)
              requestAnimationFrame(reposition)
            }}
            onError={() => setImgStatus('error')}
          />
        )}
        {imgStatus === 'loading' && (
          <span className="text-[10px] text-[var(--color-fg-muted)] animate-pulse">Loading...</span>
        )}
      </div>

      {/* Bottom bar: filename + delete */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-[var(--color-border-light)]/30">
        <span
          className="flex-1 text-[10px] font-mono text-[var(--color-fg-muted)] truncate"
          title={imagePath}
        >
          {filename}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(imagePath)
            onClose()
          }}
          className="shrink-0 p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
          title="Delete image"
        >
          <Icon icon={IconTrash} width={12} />
        </button>
      </div>
    </div>,
    document.body
  )
}
