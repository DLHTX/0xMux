import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import type { RndDragCallback, RndResizeCallback } from 'react-rnd'
import { Icon } from '@iconify/react/offline'
import { IconMinus, IconX } from '../../lib/icons.ts'

export interface FloatingWindowProps {
  isOpen: boolean
  minimized: boolean
  x: number
  y: number
  width: number
  height: number
  opacity: number
  title: string
  onClose: () => void
  onMinimize: () => void
  onRestore: () => void
  onPositionChange: (x: number, y: number) => void
  onSizeChange: (w: number, h: number) => void
  onOpacityChange: (o: number) => void
  children: React.ReactNode
}

const TITLE_BAR_HEIGHT = 24
const MIN_WINDOW_HEIGHT = 260
const MIN_WINDOW_WIDTH = 320

export default function FloatingWindow({
  isOpen,
  minimized,
  x,
  y,
  width,
  height,
  opacity,
  title: _title,
  onClose,
  onMinimize,
  onRestore,
  onPositionChange,
  onSizeChange,
  onOpacityChange,
  children,
}: FloatingWindowProps) {
  const handleDragStop: RndDragCallback = useCallback(
    (_e, d) => {
      onPositionChange(d.x, d.y)
    },
    [onPositionChange],
  )

  const handleResizeStop: RndResizeCallback = useCallback(
    (_e, _dir, ref, _delta, position) => {
      onSizeChange(ref.offsetWidth, ref.offsetHeight)
      onPositionChange(position.x, position.y)
    },
    [onSizeChange, onPositionChange],
  )

  const handleTitleDoubleClick = useCallback(() => {
    if (minimized) {
      onRestore()
    } else {
      onMinimize()
    }
  }, [minimized, onMinimize, onRestore])

  const handleOpacityInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onOpacityChange(parseFloat(e.target.value))
    },
    [onOpacityChange],
  )

  if (!isOpen) return null

  const normalizedOpacity = Math.min(1, Math.max(0.3, opacity))
  const isTranslucent = normalizedOpacity < 1
  const surfaceAlpha = Math.round(normalizedOpacity * 100)
  const displayHeight = minimized ? TITLE_BAR_HEIGHT : height

  const floatingContent = (
    <Rnd
      position={{ x, y }}
      size={{ width, height: displayHeight }}
      minWidth={MIN_WINDOW_WIDTH}
      minHeight={minimized ? TITLE_BAR_HEIGHT : MIN_WINDOW_HEIGHT}
      bounds="window"
      dragHandleClassName="floating-drag-handle"
      enableResizing={!minimized}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      style={{
        zIndex: 45,
      }}
    >
      <div
        className="flex flex-col h-full"
        style={{
          border: 'var(--border-w) solid var(--color-border-light)',
          background: isTranslucent
            ? `color-mix(in srgb, var(--color-bg) ${surfaceAlpha}%, transparent)`
            : 'var(--color-bg)',
          color: 'var(--color-fg)',
          backdropFilter: isTranslucent ? 'blur(16px) saturate(130%)' : 'none',
          WebkitBackdropFilter: isTranslucent
            ? 'blur(16px) saturate(130%)'
            : 'none',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div
          className="floating-drag-handle flex items-center justify-between shrink-0 select-none cursor-move"
          style={{
            height: TITLE_BAR_HEIGHT,
            borderBottom: minimized
              ? 'none'
              : 'var(--border-w) solid var(--color-border-light)',
            background: isTranslucent
              ? `color-mix(in srgb, var(--color-bg-alt) ${Math.min(surfaceAlpha + 10, 100)}%, transparent)`
              : 'var(--color-bg-alt)',
            padding: '0 8px',
          }}
          onDoubleClick={handleTitleDoubleClick}
        >
          {/* Left: drag handle spacer */}
          <div className="flex-1" />

          {/* Right: opacity slider + minimize + close */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Opacity slider */}
            <input
              type="range"
              min={0.3}
              max={1.0}
              step={0.05}
              value={opacity}
              onChange={handleOpacityInput}
              className="floating-opacity-slider w-14 h-3 cursor-pointer"
              title="Opacity"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />

            {/* Minimize button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (minimized) {
                  onRestore()
                } else {
                  onMinimize()
                }
              }}
              className="flex items-center justify-center w-5 h-5 cursor-pointer"
              style={{
                color: 'var(--color-fg-muted)',
                background: 'none',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-fg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-fg-muted)'
              }}
            >
              <Icon icon={IconMinus} width={14} height={14} />
            </button>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="flex items-center justify-center w-5 h-5 cursor-pointer"
              style={{
                color: 'var(--color-fg-muted)',
                background: 'none',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-fg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-fg-muted)'
              }}
            >
              <Icon icon={IconX} width={14} height={14} />
            </button>
          </div>
        </div>

        {/* Content area */}
        {!minimized && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">{children}</div>
        )}
      </div>
    </Rnd>
  )

  return createPortal(floatingContent, document.body)
}
