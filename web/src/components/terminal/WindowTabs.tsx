import { useEffect, useState, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { IconPlus, IconX } from '../../lib/icons'
import type { TmuxWindow } from '../../lib/types'
import * as api from '../../lib/api'
import { markWindowPending } from '../../lib/init-commands'
import { HorizontalScrollbar } from '../ui/HorizontalScrollbar'

interface WindowTabsProps {
  sessionName: string
}

export function WindowTabs({ sessionName }: WindowTabsProps) {
  const [windows, setWindows] = useState<TmuxWindow[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchWindows = useCallback(async () => {
    try {
      const data = await api.getWindows(sessionName)
      setWindows(data)
      const active = data.find((w) => w.active)
      if (active) setActiveIndex(active.index)
    } catch {
      // ignore - session might not exist yet
    }
  }, [sessionName])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchWindows()
  }, [fetchWindows])

  const handleSelect = async (index: number) => {
    try {
      await api.selectWindow(sessionName, index)
      setActiveIndex(index)
    } catch {
      // ignore
    }
  }

  const handleCreate = async () => {
    try {
      const newWindow = await api.createWindow(sessionName)
      markWindowPending(sessionName, newWindow.index)
      setWindows((prev) => [...prev, newWindow])
      setActiveIndex(newWindow.index)
    } catch {
      // ignore
    }
  }

  const handleClose = async (index: number) => {
    if (windows.length <= 1) return
    try {
      await api.deleteWindow(sessionName, index)
      const remaining = windows.filter((w) => w.index !== index)
      setWindows(remaining)
      if (activeIndex === index && remaining.length > 0) {
        const next = remaining[0].index
        await api.selectWindow(sessionName, next)
        setActiveIndex(next)
      }
    } catch {
      // ignore
    }
  }

  // Only show tabs when there are multiple windows
  if (windows.length <= 1) return null

  return (
    <div className="relative shrink-0 border-b-[length:var(--border-w)] border-[var(--color-border-light)]">
      <div
        ref={scrollRef}
        className="window-tabs-scrollbar hide-native-scrollbar flex items-center overflow-x-auto"
      >
        {windows.map((win) => (
          <div
            key={win.index}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0
            border-r-[length:var(--border-w)] border-[var(--color-border-light)]
            ${
              activeIndex === win.index
                ? 'bg-[var(--color-bg-alt)] border-b-2 border-b-[var(--color-success)] font-bold'
                : 'hover:bg-[var(--color-bg-alt)]'
            }
            transition-colors`}
            onClick={() => handleSelect(win.index)}
          >
            <span className="text-[var(--color-fg-muted)]">{win.index}:</span>
            <span>{win.name}</span>
            {windows.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose(win.index)
                }}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-opacity ml-1"
              >
                <Icon icon={IconX} width={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleCreate}
          className="p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors shrink-0"
          title="New Window"
        >
          <Icon icon={IconPlus} width={14} />
        </button>
      </div>
      <HorizontalScrollbar
        targetRef={scrollRef}
        className="absolute left-0 right-0 bottom-0 h-[4px]"
        thumbClassName="absolute top-0 h-full bg-[var(--color-scrollbar-accent)]"
      />
    </div>
  )
}
