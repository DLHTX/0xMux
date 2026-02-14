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
  IconTerminal,
} from '../../lib/icons'
import type { SplitLayout, SplitDirection } from '../../lib/types'
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
  onDropWindow?: (paneId: string, sessionName: string, windowIndex: number) => void
  onSplitDrop?: (paneId: string, zone: 'left' | 'right' | 'top' | 'bottom', sessionName: string, windowIndex: number) => void
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
}) {
  const [isDropOver, setIsDropOver] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('text/window-key')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDropOver(true)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDropOver(false)
    const windowKey = e.dataTransfer.getData('text/window-key')
    if (!windowKey) return
    const [sessionName, windowIndexStr] = windowKey.split(':')
    const windowIndex = parseInt(windowIndexStr, 10)
    if (sessionName && !isNaN(windowIndex)) {
      onDropWindow?.(nodeId, sessionName, windowIndex)
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

      {/* Empty state prompt */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[var(--color-fg-muted)] select-none pointer-events-none">
          <Icon icon={IconTerminal} width={28} className="text-[var(--color-border-light)]" />
          <span className="text-xs font-bold">Select a window</span>
          <span className="text-[10px] text-[var(--color-fg-faint)]">Click a window in the sidebar</span>
        </div>

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
    if (!e.dataTransfer.types.includes('text/window-key')) return
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
    const droppedKey = e.dataTransfer.getData('text/window-key')
    if (!droppedKey || !dropZone) {
      setDropZone(null)
      return
    }

    const [droppedSession, droppedWindowStr] = droppedKey.split(':')
    const droppedWindowIndex = parseInt(droppedWindowStr, 10)
    if (!droppedSession || isNaN(droppedWindowIndex)) {
      setDropZone(null)
      return
    }

    if (dropZone === 'center') {
      // Replace current pane's window
      onDropWindow?.(nodeId, droppedSession, droppedWindowIndex)
    } else {
      // Edge drop — split the pane and assign the dropped window
      onSplitDrop?.(nodeId, dropZone, droppedSession, droppedWindowIndex)
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
    const isActive = props.activePaneId === node.id

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
    const isWindowDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('text/window-key')
    const onDragEnter = (event: DragEvent) => {
      if (!isWindowDrag(event)) return
      dragCount++
      setIsDragging(true)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!isWindowDrag(event)) return
      dragCount--
      if (dragCount <= 0) {
        dragCount = 0
        setIsDragging(false)
      }
    }
    const onDragEnd = () => { dragCount = 0; setIsDragging(false) }
    const onDrop = (event: DragEvent) => {
      if (!isWindowDrag(event)) return
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
