import { createPortal } from 'react-dom'
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels'
import { TerminalPane } from './TerminalPane'
import { ContextMenu } from './ContextMenu'
import { Icon } from '@iconify/react'
import {
  IconSplitHorizontal,
  IconSplitVertical,
  IconX,
  IconReplace,
  IconPlus,
  IconGripVertical,
} from '../../lib/icons'
import type { SplitLayout, SplitDirection, PaneContent } from '../../lib/types'
import { useState, useCallback, useMemo, useSyncExternalStore, useEffect } from 'react'
import { getAllLeafIds } from '../../hooks/useSplitLayout'
import { SPLIT_GROUP_COLOR } from '../../lib/session-utils'

// ---------------------------------------------------------------------------
// Container pool — manages persistent DOM elements outside of React state.
// Uses useSyncExternalStore so the map is safely readable during render.
// ---------------------------------------------------------------------------

type Listener = () => void
const poolListeners = new Set<Listener>()
let poolMap = new Map<string, HTMLDivElement>()

function subscribePool(listener: Listener) {
  poolListeners.add(listener)
  return () => { poolListeners.delete(listener) }
}

function getPoolSnapshot() {
  return poolMap
}

/** Only adds missing sessions to the pool — never removes.
 *  Called during render, so must NOT notify listeners (would cause
 *  "setState during render" error). useSyncExternalStore detects the
 *  new poolMap reference via getPoolSnapshot automatically. */
function ensureInPool(sessionNames: string[]) {
  const needsAdd = sessionNames.some((n) => !poolMap.has(n))
  if (!needsAdd) return

  const next = new Map(poolMap)
  for (const name of sessionNames) {
    if (!next.has(name)) {
      const el = document.createElement('div')
      el.style.width = '100%'
      el.style.height = '100%'
      next.set(name, el)
    }
  }
  poolMap = next
  // No listener notification — called during render; useSyncExternalStore
  // picks up the change via getPoolSnapshot() reference comparison.
}

/** Explicitly remove sessions from the pool (e.g. when a pane is closed). */
function removeFromPool(names: string[]) {
  const toRemove = names.filter((n) => poolMap.has(n))
  if (toRemove.length === 0) return

  const next = new Map(poolMap)
  for (const name of toRemove) {
    const el = next.get(name)
    if (el) el.remove()
    next.delete(name)
  }
  poolMap = next
  poolListeners.forEach((l) => l())
}

function useSessionPool(sessionNames: string[]): Map<string, HTMLDivElement> {
  ensureInPool(sessionNames)
  return useSyncExternalStore(subscribePool, getPoolSnapshot)
}

interface SplitWorkspaceProps {
  layout: SplitLayout
  fontSize?: number
  canSplit: boolean
  activePaneId: string | null
  paneCount: number
  onSplit: (nodeId: string, direction: SplitDirection) => void
  onClose: (nodeId: string) => void
  onPaneFocus: (nodeId: string) => void
  paneWindowMap: Record<string, import('../../lib/types').PaneWindow>
  /** Maps pane IDs to non-terminal content. Panes with entries here
   *  render the corresponding panel instead of a terminal. */
  paneContentMap?: Record<string, PaneContent>
  /** Render function for non-terminal pane content */
  renderPaneContent?: (content: PaneContent, paneId: string) => React.ReactNode
  onDropWindow?: (paneId: string, sessionName: string, windowIndex: number) => void
  onSplitDrop?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => void
  /** Called when a pane-content drag is dropped on center */
  onDropContent?: (paneId: string, content: PaneContent) => void
  /** Called when a pane-content drag is dropped on an edge (split + assign) */
  onSplitDropContent?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', content: PaneContent) => void
  /** Called when a pane is dragged and dropped on another pane's center (swap) */
  onSwapPanes?: (sourcePaneId: string, targetPaneId: string) => void
  isWindowInUse?: (sessionName: string, windowIndex: number) => boolean
  activeTerminalRef?: React.RefObject<import('@xterm/xterm').Terminal | null>
  /** Returns all window keys tracked by any pane or saved layout.
   *  Used to decide which pool containers to keep alive across session switches. */
  getAllTrackedWindowKeys?: () => Set<string>
  /** Called when '@' is typed in any terminal pane */
  onAtTrigger?: () => void
  /** Whether the @ trigger is enabled */
  atTriggerEnabled?: boolean
  /** Called when a file path link is clicked in terminal output */
  onFileClick?: (path: string, line?: number, workspace?: import('../../lib/types').WorkspaceContext) => void
  /** Called when an image link is clicked in terminal output */
  onImageClick?: (imageUrl: string) => void
  /** Called to create a new window in the given session and attach to current pane */
  onCreateAndAttachWindow?: (sessionName: string) => void
  /** Called to create a new window and attach to a specific pane (for empty panes) */
  onCreateWindowForPane?: (paneId: string) => void
}

function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`
        group relative flex items-center justify-center
        ${direction === 'horizontal' ? 'w-[1px]' : 'h-[1px]'}
        bg-[var(--color-border-light)]/30
        hover:bg-[var(--color-success)] active:bg-[var(--color-success)]
        transition-colors
      `}
    />
  )
}

// ---------------------------------------------------------------------------
// EmptyPaneSlot: shown when a split pane has no window assigned
// ---------------------------------------------------------------------------

function EmptyPaneSlot({
  nodeId,
  canSplit,
  paneCount,
  isActive,
  isDragging,
  onSplit,
  onClose,
  onPaneFocus,
  onDropWindow,
  onDropContent,
  onSwapPanes,
  onCreateWindowForPane,
}: {
  nodeId: string
  canSplit: boolean
  paneCount: number
  isActive: boolean
  isDragging: boolean
  onSplit: (nodeId: string, direction: SplitDirection) => void
  onClose: (nodeId: string) => void
  onPaneFocus: (nodeId: string) => void
  onDropWindow?: (paneId: string, sessionName: string, windowIndex: number) => void
  onDropContent?: (paneId: string, content: PaneContent) => void
  onSwapPanes?: (sourcePaneId: string, targetPaneId: string) => void
  onCreateWindowForPane?: (paneId: string) => void
}) {
  const [isDropOver, setIsDropOver] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types
    const hasWindowKey = types.includes('text/window-key')
    const hasPaneContent = types.includes('text/pane-content')
    const hasPaneDrag = types.includes('text/pane-drag')
    if (!hasWindowKey && !hasPaneContent && !hasPaneDrag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDropOver(true)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDropOver(false)

    // Handle pane-to-pane drag (swap into empty)
    const paneDragData = e.dataTransfer.getData('text/pane-drag')
    if (paneDragData) {
      try {
        const { sourcePaneId } = JSON.parse(paneDragData) as { sourcePaneId: string }
        if (sourcePaneId && sourcePaneId !== nodeId) {
          onSwapPanes?.(sourcePaneId, nodeId)
        }
      } catch { /* ignore */ }
      return
    }

    // Handle window key drops
    const windowKey = e.dataTransfer.getData('text/window-key')
    if (windowKey) {
      const [sessionName, windowIndexStr] = windowKey.split(':')
      const windowIndex = parseInt(windowIndexStr, 10)
      if (sessionName && !isNaN(windowIndex)) {
        onDropWindow?.(nodeId, sessionName, windowIndex)
      }
      return
    }

    // Handle pane content drops
    const paneContentData = e.dataTransfer.getData('text/pane-content')
    if (paneContentData) {
      try {
        const content = JSON.parse(paneContentData) as PaneContent
        onDropContent?.(nodeId, content)
      } catch { /* ignore */ }
      return
    }
  }

  return (
    <div
      className={`group/pane relative flex flex-col h-full w-full cursor-pointer
        ${isDropOver ? 'bg-[var(--color-primary)]/10 border-2 border-dashed border-[var(--color-primary)]/50' : ''}
      `}
      onClick={() => onPaneFocus(nodeId)}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDropOver(false)}
      onDrop={handleDrop}
    >
      {/* Focus border overlay */}
      {isActive && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }}
        />
      )}
      {/* Top toolbar — fixed at pane top */}
      <div className="shrink-0 flex items-center gap-0.5
        bg-[var(--color-bg)] border-b border-b-[var(--color-border-light)]/15
        px-1 py-0.5"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'horizontal') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split horizontal"
        >
          <Icon icon={IconSplitHorizontal} width={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'vertical') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split vertical"
        >
          <Icon icon={IconSplitVertical} width={14} />
        </button>
        {paneCount > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(nodeId) }}
            className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
            title="Close pane"
          >
            <Icon icon={IconX} width={14} />
          </button>
        )}
      </div>

      {/* Empty state prompt — clickable to create a new window */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <button
          className="flex flex-col items-center gap-2 text-[var(--color-fg-muted)] select-none cursor-pointer
            hover:text-[var(--color-fg)] transition-colors group/empty"
          onClick={(e) => {
            e.stopPropagation()
            onCreateWindowForPane?.(nodeId)
          }}
          disabled={!onCreateWindowForPane}
        >
          <Icon icon={IconPlus} width={28} className="text-[var(--color-border-light)] group-hover/empty:text-[var(--color-primary)] transition-colors" />
          <span className="text-xs font-bold">New window</span>
          <span className="text-[10px] text-[var(--color-fg-faint)]">Click to create, or drag from sidebar</span>
        </button>

        {/* Drag overlay for empty pane */}
        {isDragging && (
          <div
            className={`absolute inset-0 z-20 ${isDropOver ? 'bg-[var(--color-primary)]/20 border-2 border-dashed border-[var(--color-primary)]/50' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDropOver(false)}
            onDrop={handleDrop}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PaneSlot: drag-drop + hover buttons + terminal mount point
// ---------------------------------------------------------------------------

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

function PaneSlot({
  nodeId,
  sessionContainers,
  windowKey,
  canSplit,
  paneCount,
  isDragging,
  isActive,
  onSplit,
  onClose,
  onPaneFocus,
  onDropWindow,
  onSplitDrop,
  onDropContent,
  onSplitDropContent,
  onSwapPanes,
  onCreateAndAttachWindow,
}: {
  nodeId: string
  sessionContainers: Map<string, HTMLDivElement>
  windowKey: string
  canSplit: boolean
  paneCount: number
  isDragging: boolean
  isActive: boolean
  onSplit: (nodeId: string, direction: SplitDirection) => void
  onClose: (nodeId: string) => void
  onPaneFocus: (nodeId: string) => void
  onDropWindow?: (paneId: string, sessionName: string, windowIndex: number) => void
  onSplitDrop?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => void
  onDropContent?: (paneId: string, content: PaneContent) => void
  onSplitDropContent?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', content: PaneContent) => void
  onSwapPanes?: (sourcePaneId: string, targetPaneId: string) => void
  onCreateAndAttachWindow?: (sessionName: string) => void
}) {
  const [dropZone, setDropZone] = useState<DropZone>(null)

  // In split mode (2+ panes), use a uniform color for all panes
  const inSplit = paneCount > 1

  const detectZone = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Normalized distance from each edge (0 = at edge, 0.5 = center)
    const fromLeft   = x / rect.width
    const fromRight  = 1 - fromLeft
    const fromTop    = y / rect.height
    const fromBottom = 1 - fromTop

    // Find the closest edge
    const minDist = Math.min(fromLeft, fromRight, fromTop, fromBottom)

    // If the closest edge is beyond 30% from the edge, it's the center zone
    if (minDist > 0.30) return 'center'

    if (minDist === fromLeft)  return 'left'
    if (minDist === fromRight) return 'right'
    if (minDist === fromTop)   return 'top'
    return 'bottom'
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types
    const accepted = types.includes('text/window-key') ||
                     types.includes('text/pane-content') ||
                     types.includes('text/pane-drag')
    if (!accepted) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const zone = detectZone(e)
    if (zone !== 'center' && !canSplit) {
      setDropZone('center')
    } else {
      setDropZone(zone)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!dropZone) { setDropZone(null); return }

    // Handle pane-to-pane drag (swap or split-move)
    const paneDragData = e.dataTransfer.getData('text/pane-drag')
    if (paneDragData) {
      try {
        const { sourcePaneId } = JSON.parse(paneDragData) as { sourcePaneId: string }
        if (sourcePaneId && sourcePaneId !== nodeId) {
          if (dropZone === 'center') {
            onSwapPanes?.(sourcePaneId, nodeId)
          } else {
            // Edge: split target pane, then swap new pane with source
            // For now, just swap on center. Edge splitting is complex.
            onSwapPanes?.(sourcePaneId, nodeId)
          }
        }
      } catch { /* ignore */ }
      setDropZone(null)
      return
    }

    // Handle window key drops (terminal)
    const droppedKey = e.dataTransfer.getData('text/window-key')
    if (droppedKey) {
      const [droppedSession, droppedWindowStr] = droppedKey.split(':')
      const droppedWindowIndex = parseInt(droppedWindowStr, 10)
      if (droppedSession && !isNaN(droppedWindowIndex)) {
        if (dropZone === 'center') {
          onDropWindow?.(nodeId, droppedSession, droppedWindowIndex)
        } else {
          onSplitDrop?.(nodeId, dropZone, droppedSession, droppedWindowIndex)
        }
      }
      setDropZone(null)
      return
    }

    // Handle pane content drops
    const paneContentData = e.dataTransfer.getData('text/pane-content')
    if (paneContentData) {
      try {
        const droppedContent = JSON.parse(paneContentData) as PaneContent
        if (dropZone === 'center') {
          onDropContent?.(nodeId, droppedContent)
        } else {
          onSplitDropContent?.(nodeId, dropZone, droppedContent)
        }
      } catch { /* ignore invalid JSON */ }
      setDropZone(null)
      return
    }

    setDropZone(null)
  }

  // Ref callback to mount the session container into this slot.
  const mountRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      const container = sessionContainers.get(windowKey)
      if (container && container.parentElement !== el) {
        while (el.firstChild) el.removeChild(el.firstChild)
        el.appendChild(container)
      }
    },
    [windowKey, sessionContainers]
  )

  // Compute the edge drop-zone overlay style: covers ~50% of the pane
  // in the direction of the split, previewing where the new pane will appear.
  const edgeOverlayStyle: React.CSSProperties | null =
    dropZone && dropZone !== 'center'
      ? {
          position: 'absolute',
          top:    dropZone === 'bottom' ? '50%' : 0,
          bottom: dropZone === 'top'    ? '50%' : 0,
          left:   dropZone === 'right'  ? '50%' : 0,
          right:  dropZone === 'left'   ? '50%' : 0,
          zIndex: 25,
          pointerEvents: 'none' as const,
          borderRadius: 0,
          transition: 'all 0.15s ease',
        }
      : null

  return (
    <div
      className="group/pane relative flex flex-col h-full w-full"
      onClick={() => onPaneFocus(nodeId)}
    >
      {/* Focus border overlay */}
      {(isActive || inSplit) && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            border: inSplit
              ? `1px solid ${isActive ? SPLIT_GROUP_COLOR + '60' : SPLIT_GROUP_COLOR + '25'}`
              : '1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)',
          }}
        />
      )}
      {/* Top toolbar — fixed at pane top */}
      <div className="shrink-0 flex items-center gap-0.5
        bg-[var(--color-bg)] border-b border-b-[var(--color-border-light)]/15
        px-1 py-0.5"
      >
        {/* Drag grip — drag this pane to swap with another */}
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/pane-drag', JSON.stringify({ sourcePaneId: nodeId }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          className="p-0.5 text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to swap"
        >
          <Icon icon={IconGripVertical} width={12} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'horizontal') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split horizontal"
        >
          <Icon icon={IconSplitHorizontal} width={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'vertical') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split vertical"
        >
          <Icon icon={IconSplitVertical} width={14} />
        </button>
        {paneCount > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(nodeId) }}
            className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
            title="Close pane"
          >
            <Icon icon={IconX} width={14} />
          </button>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1 pr-0.5">
          {onCreateAndAttachWindow && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                const colonIdx = windowKey.lastIndexOf(':')
                const sessionName = windowKey.substring(0, colonIdx)
                if (sessionName) onCreateAndAttachWindow(sessionName)
              }}
              className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              title="New window"
            >
              <Icon icon={IconPlus} width={14} />
            </button>
          )}
          <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">{windowKey}</span>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative">
        {/* Terminal mount point */}
        <div ref={mountRef} className="absolute inset-0" />

        {/* Drag overlay — transparent layer above terminal, only active during drag */}
        {isDragging && (
          <div
            className="absolute inset-0 z-20"
            onDragOver={handleDragOver}
            onDragLeave={() => setDropZone(null)}
            onDrop={handleDrop}
          />
        )}

        {/* Center drop indicator — full pane translucent highlight + "Replace" label */}
        {dropZone === 'center' && (
          <>
            <div className="absolute inset-0 z-25 bg-[var(--color-primary)]/15 border-2 border-dashed border-[var(--color-primary)]/50 pointer-events-none" />
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 bg-[var(--color-bg)]/90 border-[length:var(--border-w)] border-[var(--color-primary)] rounded-[var(--radius)] px-3 py-1.5">
                <Icon icon={IconReplace} width={14} className="text-[var(--color-primary)]" />
                <span className="text-xs font-bold text-[var(--color-primary)]">Replace window</span>
              </div>
            </div>
          </>
        )}

        {/* Edge drop indicator — half-pane translucent overlay previewing split position */}
        {edgeOverlayStyle && (
          <div
            className="bg-[var(--color-primary)]/15 border-2 border-[var(--color-primary)]/40"
            style={edgeOverlayStyle}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContentPaneSlot: renders non-terminal content (files, changes, search, editor)
// ---------------------------------------------------------------------------

function ContentPaneSlot({
  nodeId,
  content,
  canSplit,
  paneCount,
  isDragging,
  isActive,
  onSplit,
  onClose,
  onPaneFocus,
  onDropWindow,
  onSplitDrop,
  onDropContent,
  onSplitDropContent,
  onSwapPanes,
  renderContent,
}: {
  nodeId: string
  content: PaneContent
  canSplit: boolean
  paneCount: number
  isDragging: boolean
  isActive: boolean
  onSplit: (nodeId: string, direction: SplitDirection) => void
  onClose: (nodeId: string) => void
  onPaneFocus: (nodeId: string) => void
  onDropWindow?: (paneId: string, sessionName: string, windowIndex: number) => void
  onSplitDrop?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => void
  onDropContent?: (paneId: string, content: PaneContent) => void
  onSplitDropContent?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', content: PaneContent) => void
  onSwapPanes?: (sourcePaneId: string, targetPaneId: string) => void
  renderContent?: (content: PaneContent, paneId: string) => React.ReactNode
}) {
  const [dropZone, setDropZone] = useState<DropZone>(null)
  const inSplit = paneCount > 1

  // Content type label for toolbar
  const contentLabel = content.type === 'files' ? 'Files'
    : content.type === 'changes' ? 'Changes'
    : content.type === 'search' ? 'Search'
    : content.type === 'editor' ? (content.filePath?.split('/').pop() ?? 'Editor')
    : content.type

  const detectZone = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const fromLeft   = x / rect.width
    const fromRight  = 1 - fromLeft
    const fromTop    = y / rect.height
    const fromBottom = 1 - fromTop
    const minDist = Math.min(fromLeft, fromRight, fromTop, fromBottom)
    if (minDist > 0.30) return 'center'
    if (minDist === fromLeft)  return 'left'
    if (minDist === fromRight) return 'right'
    if (minDist === fromTop)   return 'top'
    return 'bottom'
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types
    const accepted = types.includes('text/window-key') ||
                     types.includes('text/pane-content') ||
                     types.includes('text/pane-drag')
    if (!accepted) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const zone = detectZone(e)
    if (zone !== 'center' && !canSplit) {
      setDropZone('center')
    } else {
      setDropZone(zone)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!dropZone) { setDropZone(null); return }

    // Handle pane-to-pane drag (swap)
    const paneDragData = e.dataTransfer.getData('text/pane-drag')
    if (paneDragData) {
      try {
        const { sourcePaneId } = JSON.parse(paneDragData) as { sourcePaneId: string }
        if (sourcePaneId && sourcePaneId !== nodeId) {
          onSwapPanes?.(sourcePaneId, nodeId)
        }
      } catch { /* ignore */ }
      setDropZone(null)
      return
    }

    // Handle window key drops (terminal)
    const windowKey = e.dataTransfer.getData('text/window-key')
    if (windowKey) {
      const [droppedSession, droppedWindowStr] = windowKey.split(':')
      const droppedWindowIndex = parseInt(droppedWindowStr, 10)
      if (droppedSession && !isNaN(droppedWindowIndex)) {
        if (dropZone === 'center') {
          onDropWindow?.(nodeId, droppedSession, droppedWindowIndex)
        } else {
          onSplitDrop?.(nodeId, dropZone, droppedSession, droppedWindowIndex)
        }
      }
      setDropZone(null)
      return
    }

    // Handle pane content drops
    const paneContentData = e.dataTransfer.getData('text/pane-content')
    if (paneContentData) {
      try {
        const droppedContent = JSON.parse(paneContentData) as PaneContent
        if (dropZone === 'center') {
          onDropContent?.(nodeId, droppedContent)
        } else {
          onSplitDropContent?.(nodeId, dropZone, droppedContent)
        }
      } catch { /* ignore invalid JSON */ }
      setDropZone(null)
      return
    }

    setDropZone(null)
  }

  const edgeOverlayStyle: React.CSSProperties | null =
    dropZone && dropZone !== 'center'
      ? {
          position: 'absolute',
          top:    dropZone === 'bottom' ? '50%' : 0,
          bottom: dropZone === 'top'    ? '50%' : 0,
          left:   dropZone === 'right'  ? '50%' : 0,
          right:  dropZone === 'left'   ? '50%' : 0,
          zIndex: 25,
          pointerEvents: 'none' as const,
          transition: 'all 0.15s ease',
        }
      : null

  return (
    <div
      className="group/pane relative flex flex-col h-full w-full"
      onClick={() => onPaneFocus(nodeId)}
    >
      {/* Focus border overlay */}
      {(isActive || inSplit) && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            border: inSplit
              ? `1px solid ${isActive ? SPLIT_GROUP_COLOR + '60' : SPLIT_GROUP_COLOR + '25'}`
              : '1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)',
          }}
        />
      )}
      {/* Top toolbar */}
      <div className="shrink-0 flex items-center gap-0.5
        bg-[var(--color-bg)] border-b border-b-[var(--color-border-light)]/15
        px-1 py-0.5"
      >
        {/* Drag grip — drag this pane to swap with another */}
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/pane-drag', JSON.stringify({ sourcePaneId: nodeId }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          className="p-0.5 text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to swap"
        >
          <Icon icon={IconGripVertical} width={12} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'horizontal') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split horizontal"
        >
          <Icon icon={IconSplitHorizontal} width={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'vertical') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="Split vertical"
        >
          <Icon icon={IconSplitVertical} width={14} />
        </button>
        {paneCount > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(nodeId) }}
            className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
            title="Close pane"
          >
            <Icon icon={IconX} width={14} />
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[10px] font-mono font-bold text-[var(--color-fg-muted)] pr-0.5">{contentLabel}</span>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {renderContent?.(content, nodeId)}

        {/* Drag overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 z-20"
            onDragOver={handleDragOver}
            onDragLeave={() => setDropZone(null)}
            onDrop={handleDrop}
          />
        )}

        {/* Center drop indicator */}
        {dropZone === 'center' && (
          <>
            <div className="absolute inset-0 z-25 bg-[var(--color-primary)]/15 border-2 border-dashed border-[var(--color-primary)]/50 pointer-events-none" />
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 bg-[var(--color-bg)]/90 border-[length:var(--border-w)] border-[var(--color-primary)] px-3 py-1.5">
                <Icon icon={IconReplace} width={14} className="text-[var(--color-primary)]" />
                <span className="text-xs font-bold text-[var(--color-primary)]">Replace</span>
              </div>
            </div>
          </>
        )}

        {/* Edge drop indicator */}
        {edgeOverlayStyle && (
          <div
            className="bg-[var(--color-primary)]/15 border-2 border-[var(--color-primary)]/40"
            style={edgeOverlayStyle}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout tree renderer
// ---------------------------------------------------------------------------

function renderLayoutStructure(
  node: SplitLayout,
  props: SplitWorkspaceProps,
  sessionContainers: Map<string, HTMLDivElement>,
  isDragging: boolean
): React.ReactNode {
  if (node.type === 'leaf') {
    const pw = props.paneWindowMap[node.id]
    const content = props.paneContentMap?.[node.id]
    const isActive = props.activePaneId === node.id

    // Non-terminal content pane (files, changes, search, editor)
    if (content && content.type !== 'terminal') {
      return (
        <ContentPaneSlot
          key={node.id}
          nodeId={node.id}
          content={content}
          canSplit={props.canSplit}
          paneCount={props.paneCount}
          isDragging={isDragging}
          isActive={isActive}
          onSplit={props.onSplit}
          onClose={props.onClose}
          onPaneFocus={props.onPaneFocus}
          onDropWindow={props.onDropWindow}
          onSplitDrop={props.onSplitDrop}
          onDropContent={props.onDropContent}
          onSplitDropContent={props.onSplitDropContent}
          onSwapPanes={props.onSwapPanes}
          renderContent={props.renderPaneContent}
        />
      )
    }

    // Unassigned pane — show empty state
    if (!pw) {
      return (
        <EmptyPaneSlot
          key={node.id}
          nodeId={node.id}
          canSplit={props.canSplit}
          paneCount={props.paneCount}
          isActive={isActive}
          isDragging={isDragging}
          onSplit={props.onSplit}
          onClose={props.onClose}
          onPaneFocus={props.onPaneFocus}
          onDropWindow={props.onDropWindow}
          onDropContent={props.onDropContent}
          onSwapPanes={props.onSwapPanes}
          onCreateWindowForPane={props.onCreateWindowForPane}
        />
      )
    }

    const windowKey = `${pw.sessionName}:${pw.windowIndex}`
    return (
      <PaneSlot
        key={node.id}
        nodeId={node.id}
        sessionContainers={sessionContainers}
        windowKey={windowKey}
        canSplit={props.canSplit}
        paneCount={props.paneCount}
        isDragging={isDragging}
        isActive={isActive}
        onSplit={props.onSplit}
        onClose={props.onClose}
        onPaneFocus={props.onPaneFocus}
        onDropWindow={props.onDropWindow}
        onSplitDrop={props.onSplitDrop}
        onDropContent={props.onDropContent}
        onSplitDropContent={props.onSplitDropContent}
        onSwapPanes={props.onSwapPanes}
        onCreateAndAttachWindow={props.onCreateAndAttachWindow}
      />
    )
  }

  const dir: 'horizontal' | 'vertical' =
    node.direction === 'horizontal' ? 'horizontal' : 'vertical'

  return (
    <PanelGroup orientation={dir} key={node.id}>
      {node.children.flatMap((child, i) => {
        const elements: React.ReactNode[] = []
        if (i > 0) {
          elements.push(<ResizeHandle key={`sep-${child.id}`} direction={dir} />)
        }
        elements.push(
          <Panel key={child.id} minSize={5} defaultSize={node.sizes[i] ?? 50}>
            {renderLayoutStructure(child, props, sessionContainers, isDragging)}
          </Panel>
        )
        return elements
      })}
    </PanelGroup>
  )
}

// ---------------------------------------------------------------------------
// SplitWorkspace — portal-based terminal management
// ---------------------------------------------------------------------------

export function SplitWorkspace(props: SplitWorkspaceProps) {
  const { layout, canSplit, activePaneId, onSplit, onClose } = props

  // Stable leaf ID list — derive pane count from actual layout tree
  // to guarantee consistency within a single render pass.
  const leafIds = useMemo(() => getAllLeafIds(layout), [layout])
  const localPaneCount = leafIds.length

  // Window keys currently assigned to panes (format: "sessionName:windowIndex")
  const currentWindowKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const id of leafIds) {
      const pw = props.paneWindowMap[id]
      if (pw) {
        keys.add(`${pw.sessionName}:${pw.windowIndex}`)
      }
    }
    return [...keys]
  }, [leafIds, props.paneWindowMap])

  // Persistent container elements keyed by window key.
  // ensureInPool only ADDS — switched-away windows stay "warm" in the pool
  // so switching back is instant (no WS reconnect needed).
  const sessionContainers = useSessionPool(currentWindowKeys)

  // Smart pool cleanup: only remove containers that are not tracked by ANY
  // pane in the current layout OR any saved layout (session switch history).
  // This fixes the old bug where session-switch would destroy all old
  // containers and force a full WebSocket reconnect.
  useEffect(() => {
    const trackedKeys = props.getAllTrackedWindowKeys?.() ?? new Set(currentWindowKeys)
    const orphaned = [...poolMap.keys()].filter((k) => !trackedKeys.has(k))
    if (orphaned.length > 0) removeFromPool(orphaned)
  }, [leafIds, props.paneWindowMap, props.getAllTrackedWindowKeys, currentWindowKeys])

  // Track global drag state so PaneSlot can show a drag overlay above xterm
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let dragCount = 0
    const isPaneDrag = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      return types.includes('text/window-key') || types.includes('text/pane-content') || types.includes('text/pane-drag')
    }
    const onDragEnter = (event: DragEvent) => {
      if (!isPaneDrag(event)) return
      dragCount++
      setIsDragging(true)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!isPaneDrag(event)) return
      dragCount--
      if (dragCount <= 0) {
        dragCount = 0
        setIsDragging(false)
      }
    }
    const onDragEnd = () => { dragCount = 0; setIsDragging(false) }
    const onDrop = (event: DragEvent) => {
      if (!isPaneDrag(event)) return
      dragCount = 0
      setIsDragging(false)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragend', onDragEnd)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    paneId?: string
  } | null>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, paneId: activePaneId ?? undefined })
    },
    [activePaneId]
  )

  const targetPaneId = contextMenu?.paneId ?? activePaneId
  const contextMenuItems = [
    {
      label: 'Split horizontal',
      icon: IconSplitHorizontal,
      disabled: !canSplit,
      onClick: () => {
        if (targetPaneId) onSplit(targetPaneId, 'horizontal')
      },
    },
    {
      label: 'Split vertical',
      icon: IconSplitVertical,
      disabled: !canSplit,
      onClick: () => {
        if (targetPaneId) onSplit(targetPaneId, 'vertical')
      },
    },
    {
      label: 'Close pane',
      icon: IconX,
      disabled: localPaneCount <= 1,
      onClick: () => {
        if (targetPaneId) onClose(targetPaneId)
      },
    },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Layout tree — PaneSlots with drag-drop and buttons, no terminals */}
      <div
        className="flex-1 min-h-0"
        onContextMenu={handleContextMenu}
      >
        {renderLayoutStructure(layout, { ...props, paneCount: localPaneCount }, sessionContainers, isDragging)}
      </div>

      {/* Portaled terminals keyed by window — includes "warm" windows
          that were switched away from but kept alive for instant switch-back */}
      {[...sessionContainers.keys()].map((windowKey) => {
        const container = sessionContainers.get(windowKey)
        if (!container) return null

        // Parse windowKey (format: "sessionName:windowIndex")
        const colonIdx = windowKey.lastIndexOf(':')
        const sessionName = windowKey.substring(0, colonIdx)
        const windowIndex = parseInt(windowKey.substring(colonIdx + 1), 10)

        // Determine if this window is focused in any pane
        const focusedLeaf = leafIds.find((id) => {
          const pw = props.paneWindowMap[id]
          return pw && `${pw.sessionName}:${pw.windowIndex}` === windowKey && props.activePaneId === id
        })

        return createPortal(
          <TerminalPane
            key={windowKey}
            sessionName={sessionName}
            windowIndex={windowIndex}
            fontSize={props.fontSize}
            focused={!!focusedLeaf}
            terminalRef={focusedLeaf ? props.activeTerminalRef : undefined}
            onFocus={() => {
              const paneId = leafIds.find((id) => {
                const pw = props.paneWindowMap[id]
                return pw && `${pw.sessionName}:${pw.windowIndex}` === windowKey
              })
              if (paneId) props.onPaneFocus(paneId)
            }}
            onAtTrigger={props.onAtTrigger}
            atTriggerEnabled={props.atTriggerEnabled}
            onFileClick={props.onFileClick}
            onImageClick={props.onImageClick}
          />,
          container
        )
      })}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
