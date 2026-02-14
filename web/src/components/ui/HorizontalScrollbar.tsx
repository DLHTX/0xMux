import { useCallback, useEffect, useRef, useState } from 'react'

interface HorizontalScrollbarProps {
  targetRef: React.RefObject<HTMLElement | null>
  className?: string
  thumbClassName?: string
  minThumbPx?: number
}

interface ScrollMetrics {
  visible: boolean
  thumbLeftPx: number
  thumbWidthPx: number
}

export function HorizontalScrollbar({
  targetRef,
  className,
  thumbClassName,
  minThumbPx = 24,
}: HorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    visible: false,
    thumbLeftPx: 0,
    thumbWidthPx: 0,
  })

  const update = useCallback(() => {
    const target = targetRef.current
    const track = trackRef.current
    if (!target || !track) return

    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth)
    if (maxScroll <= 0 || target.clientWidth <= 0) {
      setMetrics((prev) => (prev.visible ? { visible: false, thumbLeftPx: 0, thumbWidthPx: 0 } : prev))
      return
    }

    const trackWidth = track.clientWidth
    if (trackWidth <= 0) return

    const thumbWidth = Math.max(minThumbPx, (target.clientWidth / target.scrollWidth) * trackWidth)
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth)
    const thumbLeft = maxScroll > 0 ? (target.scrollLeft / maxScroll) * maxThumbLeft : 0

    setMetrics({
      visible: true,
      thumbLeftPx: thumbLeft,
      thumbWidthPx: thumbWidth,
    })
  }, [minThumbPx, targetRef])

  useEffect(() => {
    const target = targetRef.current
    const track = trackRef.current
    if (!target || !track) return

    const onScroll = () => update()
    const onResize = () => update()
    const ro = new ResizeObserver(onResize)
    const mo = new MutationObserver(onResize)

    target.addEventListener('scroll', onScroll, { passive: true })
    ro.observe(target)
    ro.observe(track)
    mo.observe(target, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', onResize)
    update()
    const raf = window.requestAnimationFrame(update)

    return () => {
      target.removeEventListener('scroll', onScroll)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', onResize)
      window.cancelAnimationFrame(raf)
    }
  }, [targetRef, update])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = targetRef.current
    const track = trackRef.current
    if (!target || !track) return

    event.preventDefault()
    const rect = track.getBoundingClientRect()
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth)
    const maxThumbLeft = Math.max(0, rect.width - metrics.thumbWidthPx)
    if (maxScroll <= 0 || maxThumbLeft <= 0) return

    const pointerX = event.clientX - rect.left
    const targetElement = event.target as HTMLElement
    const fromThumb = targetElement.dataset.scrollThumb === 'true'
    const offset = fromThumb ? pointerX - metrics.thumbLeftPx : metrics.thumbWidthPx / 2

    const apply = (clientX: number) => {
      const x = clientX - rect.left - offset
      const thumbLeft = Math.max(0, Math.min(maxThumbLeft, x))
      target.scrollLeft = (thumbLeft / maxThumbLeft) * maxScroll
    }

    apply(event.clientX)

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      apply(moveEvent.clientX)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [metrics.thumbLeftPx, metrics.thumbWidthPx, targetRef])

  return (
    <div
      ref={trackRef}
      className={className ?? 'absolute left-0 right-0 bottom-0 h-[4px]'}
      onPointerDown={handlePointerDown}
      style={{
        opacity: metrics.visible ? 1 : 0,
        pointerEvents: metrics.visible ? 'auto' : 'none',
      }}
    >
      {metrics.visible && (
        <div
          data-scroll-thumb="true"
          className={thumbClassName ?? 'absolute top-0 h-full bg-[var(--color-scrollbar-accent)]'}
          style={{
            left: `${metrics.thumbLeftPx}px`,
            width: `${metrics.thumbWidthPx}px`,
            borderRadius: 0,
          }}
        />
      )}
    </div>
  )
}
