import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { IconX, IconZoomIn, IconZoomOut } from '../../lib/icons'

interface ImageViewerProps {
  src: string
  alt?: string
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Pinch state
  const pinchRef = useRef({ startDist: 0, startScale: 1 })
  // Pan state
  const panRef = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0, isPanning: false })
  // Double tap detection
  const lastTapRef = useRef(0)

  const resetTransform = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const getDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      pinchRef.current = {
        startDist: getDistance(e.touches),
        startScale: scale,
      }
    } else if (e.touches.length === 1) {
      // Double tap detection
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        // Double tap: toggle zoom
        if (scale > 1.1) {
          resetTransform()
        } else {
          setScale(DOUBLE_TAP_SCALE)
          setTranslate({ x: 0, y: 0 })
        }
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now

      // Pan start
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: translate.x,
        startTy: translate.y,
        isPanning: scale > 1,
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, translate, resetTransform])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch
      const dist = getDistance(e.touches)
      const ratio = dist / pinchRef.current.startDist
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio))
      setScale(newScale)
      e.preventDefault()
    } else if (e.touches.length === 1 && panRef.current.isPanning) {
      // Pan
      const dx = e.touches[0].clientX - panRef.current.startX
      const dy = e.touches[0].clientY - panRef.current.startY
      setTranslate({
        x: panRef.current.startTx + dx,
        y: panRef.current.startTy + dy,
      })
      e.preventDefault()
    }
  }, [])

  // Mouse wheel zoom (desktop)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)))
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[300] bg-black/90 flex flex-col select-none"
      onClick={(e) => {
        if (e.target === containerRef.current) onClose()
      }}
    >
      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onWheel={handleWheel}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ''}
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: panRef.current.isPanning ? 'none' : 'transform 0.1s ease-out',
          }}
          draggable={false}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-4 py-3 bg-black/60">
        <button
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s / 1.3))}
          className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <Icon icon={IconZoomOut} width={20} />
        </button>
        <span className="text-white/60 text-xs font-mono min-w-[48px] text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.3))}
          className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <Icon icon={IconZoomIn} width={20} />
        </button>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <Icon icon={IconX} width={20} />
        </button>
      </div>
    </div>
  )
}
