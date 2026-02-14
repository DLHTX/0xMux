import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ActivityView } from '../../lib/types'

interface SidebarContainerProps {
  activeView: ActivityView | null
  children: Record<ActivityView, ReactNode>
  width: number
  onWidthChange: (width: number) => void
}

const MIN_WIDTH = 220
const MAX_WIDTH = 520

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)))
}

export function SidebarContainer({ activeView, children, width, onWidthChange }: SidebarContainerProps) {
  const isOpen = activeView !== null
  const [resizing, setResizing] = useState(false)
  const [draftWidth, setDraftWidth] = useState(clampWidth(width))
  const draftWidthRef = useRef(draftWidth)
  const dragStartRef = useRef<{ x: number; width: number } | null>(null)

  draftWidthRef.current = draftWidth

  useEffect(() => {
    setDraftWidth(clampWidth(width))
  }, [width])

  useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return
      const delta = event.clientX - start.x
      setDraftWidth(clampWidth(start.width + delta))
    }

    const handleMouseUp = () => {
      setResizing(false)
      dragStartRef.current = null
      onWidthChange(draftWidthRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing, onWidthChange])

  const handleResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isOpen) return
    event.preventDefault()
    dragStartRef.current = { x: event.clientX, width: draftWidthRef.current }
    setResizing(true)
  }, [isOpen])

  return (
    <div
      className="relative shrink-0 overflow-hidden flex flex-col bg-[var(--color-bg)]"
      style={{
        width: isOpen ? draftWidth : 0,
        transition: 'width 200ms ease',
      }}
    >
      {isOpen && (
        <div className="w-full h-full flex flex-col overflow-hidden">
          {children[activeView]}
        </div>
      )}
      {isOpen && (
        <div
          className={`absolute top-0 right-0 h-full w-1 cursor-col-resize z-10 ${resizing ? 'bg-[var(--color-primary)]/30' : 'hover:bg-[var(--color-primary)]/15'}`}
          onMouseDown={handleResizeStart}
          title="Resize sidebar"
        />
      )}
    </div>
  )
}
