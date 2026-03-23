import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react/offline'
import { IconX } from '../../lib/icons.ts'
import type { EditorTab } from '../../lib/types.ts'
import { setTerminalFileDragData } from '../../lib/terminalFileDrag.ts'
import { HorizontalScrollbar } from '../ui/HorizontalScrollbar.tsx'
import { useI18n } from '../../hooks/useI18n'

export interface EditorTabsProps {
  tabs: EditorTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseAllTabs: () => void
  onCloseOtherTabs: (id: string) => void
  onCloseTabsToLeft: (id: string) => void
  onCloseTabsToRight: (id: string) => void
  onPinTab?: (id: string) => void
}

/** Extract filename from a full file path */
function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

function TabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  onDoubleClick,
}: {
  tab: EditorTab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void
  onDoubleClick?: () => void
}) {
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onClose()
    },
    [onClose],
  )

  const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    setTerminalFileDragData(e.dataTransfer, tab.filePath, tab.workspace)
  }, [tab.filePath, tab.workspace])

  return (
    <button
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={handleDragStart}
      className={`flex items-center gap-1.5 shrink-0 px-4 h-full text-[13px] leading-none font-mono cursor-pointer whitespace-nowrap ${tab.isPreview ? 'italic' : ''}`}
      style={{
        background: isActive ? 'var(--color-bg)' : 'var(--color-bg-alt)',
        color: isActive ? 'var(--color-fg)' : 'var(--color-fg-muted)',
        borderRight: 'var(--border-w) solid var(--color-border-light)',
        borderBottom: isActive
          ? 'none'
          : 'var(--border-w) solid var(--color-border-light)',
        border: 'none',
        borderRightStyle: 'solid',
        borderRightWidth: 'var(--border-w)',
        borderRightColor: 'var(--color-border-light)',
      }}
    >
      {/* Dirty indicator */}
      {tab.isDirty && (
        <span
          className="w-1.5 h-1.5 shrink-0"
          style={{ background: 'var(--color-primary)' }}
        />
      )}

      <span className="truncate max-w-44">{basename(tab.filePath)}</span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleClose(e as unknown as React.MouseEvent)
        }}
        className="flex items-center justify-center w-5 h-5 ml-1 shrink-0 opacity-0 group-hover/tab:opacity-100 hover:opacity-100!"
        style={{ color: 'var(--color-fg-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-fg)'
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-fg-muted)'
          e.currentTarget.style.opacity = ''
        }}
      >
        <Icon icon={IconX} width={13} height={13} />
      </span>
    </button>
  )
}

export default function EditorTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onPinTab,
}: EditorTabsProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [contextTabId, setContextTabId] = useState<string | null>(null)
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeContextMenu = useCallback(() => {
    setContextTabId(null)
    setContextPos(null)
  }, [])

  useEffect(() => {
    if (!contextPos) return

    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeContextMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu()
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextPos, closeContextMenu])

  useLayoutEffect(() => {
    if (!contextPos || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const nextX = Math.min(
      Math.max(8, contextPos.x),
      Math.max(8, window.innerWidth - rect.width - 8),
    )
    const nextY = Math.min(
      Math.max(8, contextPos.y),
      Math.max(8, window.innerHeight - rect.height - 8),
    )
    if (nextX !== contextPos.x || nextY !== contextPos.y) {
      setContextPos({ x: nextX, y: nextY })
    }
  }, [contextPos])

  const contextIndex = useMemo(
    () => tabs.findIndex((tab) => tab.id === contextTabId),
    [tabs, contextTabId],
  )
  const canCloseOthers = tabs.length > 1 && contextIndex !== -1
  const canCloseLeft = contextIndex > 0
  const canCloseRight = contextIndex >= 0 && contextIndex < tabs.length - 1

  const openContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>, tabId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextTabId(tabId)
    setContextPos({ x: event.clientX, y: event.clientY })
  }, [])

  const runMenuAction = useCallback((action: () => void) => {
    action()
    closeContextMenu()
  }, [closeContextMenu])

  if (tabs.length === 0) return null

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="floating-editor-tabs-scrollbar hide-native-scrollbar flex items-stretch overflow-x-auto shrink-0"
        style={{
          height: 38,
          background: 'var(--color-bg-alt)',
          borderBottom: 'var(--border-w) solid var(--color-border-light)',
        }}
      >
        {tabs.map((tab) => (
          <div key={tab.id} className="group/tab flex">
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => onSelectTab(tab.id)}
              onClose={() => onCloseTab(tab.id)}
              onContextMenu={(event) => openContextMenu(event, tab.id)}
              onDoubleClick={tab.isPreview && onPinTab ? () => onPinTab(tab.id) : undefined}
            />
          </div>
        ))}
      </div>
      <HorizontalScrollbar
        targetRef={scrollRef}
        className="absolute left-0 right-0 bottom-0 h-[4px]"
        thumbClassName="absolute top-0 h-full bg-[var(--color-scrollbar-accent)]"
      />

      {contextPos && contextTabId && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] py-1 bg-[var(--color-bg)] border border-[var(--color-border-light)] shadow-lg"
          style={{
            left: contextPos.x,
            top: contextPos.y,
            width: 'max-content',
            minWidth: 180,
            maxWidth: 220,
          }}
        >
          <button
            className="block w-full px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-[var(--color-bg-alt)]"
            onClick={() => runMenuAction(() => onCloseTab(contextTabId))}
          >
            {t('editor.close')}
          </button>
          <button
            className="block w-full px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-[var(--color-bg-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => runMenuAction(() => onCloseOtherTabs(contextTabId))}
            disabled={!canCloseOthers}
          >
            {t('editor.closeOthers')}
          </button>
          <button
            className="block w-full px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-[var(--color-bg-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => runMenuAction(() => onCloseTabsToRight(contextTabId))}
            disabled={!canCloseRight}
          >
            {t('editor.closeRight')}
          </button>
          <button
            className="block w-full px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-[var(--color-bg-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => runMenuAction(() => onCloseTabsToLeft(contextTabId))}
            disabled={!canCloseLeft}
          >
            {t('editor.closeLeft')}
          </button>
          <div className="my-1 border-t border-[var(--color-border-light)]" />
          <button
            className="block w-full px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-[var(--color-bg-alt)]"
            onClick={() => runMenuAction(onCloseAllTabs)}
          >
            {t('editor.closeAll')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
