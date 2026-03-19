import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { RightPanelTab } from '../../lib/types'
import { useI18n } from '../../hooks/useI18n'
import { Icon } from '@iconify/react'
import { IconChevronLeft, IconChevronRight } from '../../lib/icons'

interface RightPanelProps {
  activeTab: RightPanelTab
  onTabChange: (tab: RightPanelTab) => void
  width: number
  onWidthChange: (width: number) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  gitChangeCount?: number
  children: Record<RightPanelTab, ReactNode>
}

const MIN_WIDTH = 220
const MAX_WIDTH = 520

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)))
}

const TABS: { key: RightPanelTab; labelKey: string }[] = [
  { key: 'files', labelKey: 'rightPanel.files' },
  { key: 'changes', labelKey: 'rightPanel.changes' },
  { key: 'search', labelKey: 'rightPanel.search' },
]

export function RightPanel({
  activeTab,
  onTabChange,
  width,
  onWidthChange,
  collapsed,
  onCollapsedChange,
  gitChangeCount = 0,
  children,
}: RightPanelProps) {
  const { t } = useI18n()
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
      // Dragging left edge: delta is negative when moving left (expanding)
      const delta = start.x - event.clientX
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
    if (collapsed) return
    event.preventDefault()
    dragStartRef.current = { x: event.clientX, width: draftWidthRef.current }
    setResizing(true)
  }, [collapsed])

  return (
    <div
      className="relative shrink-0 flex flex-col bg-[var(--color-bg)] border-l border-l-[var(--color-border-light)]/30"
      style={{
        width: collapsed ? 24 : draftWidth,
        overflow: collapsed ? 'visible' : 'hidden',
        transition: resizing ? 'none' : 'width 200ms ease',
      }}
    >
      {!collapsed && (
        <>
          {/* Tab bar */}
          <div className="shrink-0 flex items-center border-b border-b-[var(--color-border-light)]/30 bg-[var(--color-bg)]">
            {/* Collapse button */}
            <button
              onClick={() => onCollapsedChange(true)}
              className="shrink-0 w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
              title={t('rightPanel.collapse')}
            >
              <Icon icon={IconChevronRight} width={12} />
            </button>

            {/* Tabs */}
            {TABS.map(({ key, labelKey }) => {
              const isActive = activeTab === key
              const showBadge = key === 'changes' && gitChangeCount > 0
              return (
                <button
                  key={key}
                  onClick={() => onTabChange(key)}
                  className={`
                    relative flex-1 px-2 py-1.5 text-[10px] font-bold transition-colors cursor-pointer text-center
                    ${isActive
                      ? 'text-[var(--color-fg)] border-b-2 border-b-[var(--color-primary)]'
                      : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border-b-2 border-b-transparent'
                    }
                  `}
                >
                  {t(labelKey as 'rightPanel.files')}
                  {showBadge && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[9px] font-black leading-none px-0.5">
                      {gitChangeCount > 99 ? '99+' : gitChangeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {children[activeTab]}
          </div>
        </>
      )}

      {/* Left edge resize handle */}
      {!collapsed && (
        <div
          className={`absolute top-0 left-0 h-full w-1 cursor-col-resize z-10 ${resizing ? 'bg-[var(--color-primary)]/30' : 'hover:bg-[var(--color-primary)]/15'}`}
          onMouseDown={handleResizeStart}
          title="Resize panel"
        />
      )}

      {/* Collapsed state: show expand button in the narrow strip */}
      {collapsed && (
        <div className="flex flex-col items-center pt-2 w-full">
          <button
            onClick={() => onCollapsedChange(false)}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
            title={t('rightPanel.expand')}
          >
            <Icon icon={IconChevronLeft} width={12} />
          </button>
        </div>
      )}
    </div>
  )
}
