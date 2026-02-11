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
} from '../../lib/icons'
import type { SplitLayout, SplitDirection } from '../../lib/types'
import { useState, useCallback, useMemo, useSyncExternalStore, useEffect, useRef } from 'react'
import { getAllLeafIds, extractProjectName, getProjectColor } from '../../hooks/useSplitLayout'

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
  onDropSession?: (paneId: string, direction: SplitDirection, sessionName: string) => void
  onReplaceSession?: (paneId: string, sessionName: string) => void
  isWindowInUse?: (sessionName: string, windowIndex: number) => boolean
  activeTerminalRef?: React.RefObject<import('@xterm/xterm').Terminal | null>
}

function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`
        group relative flex items-center justify-center
        ${direction === 'horizontal' ? 'w-[3px]' : 'h-[3px]'}
        bg-[var(--color-border-light)]
        hover:bg-[var(--color-success)] active:bg-[var(--color-success)]
        transition-colors
      `}
    />
  )
}

// ---------------------------------------------------------------------------
// PaneSlot: drag-drop + hover buttons + terminal mount point (no TerminalPane)
// ---------------------------------------------------------------------------

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

function PaneSlot({
  nodeId,
  sessionContainers,
  sessionName,
  canSplit,
  paneCount,
  isDragging,
  isActive,
  onSplit,
  onClose,
  onDropSession,
  onReplaceSession,
  isSessionInUse,
}: {
  nodeId: string
  sessionContainers: Map<string, HTMLDivElement>
  sessionName: string
  canSplit: boolean
  paneCount: number
  isDragging: boolean
  isActive: boolean
  onSplit: (nodeId: string, direction: SplitDirection) => void
  onClose: (nodeId: string) => void
  onDropSession?: (paneId: string, direction: SplitDirection, sessionName: string) => void
  onReplaceSession?: (paneId: string, sessionName: string) => void
  isSessionInUse?: (sessionName: string) => boolean
}) {
  const [dropZone, setDropZone] = useState<DropZone>(null)

  // Calculate project color
  const projectName = extractProjectName(sessionName)
  const projectColor = getProjectColor(projectName)

  const detectZone = (e: React.DragEvent<HTMLDivElement>): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const threshold = 50

    if (x < threshold) return 'left'
    if (x > rect.width - threshold) return 'right'
    if (y < threshold) return 'top'
    if (y > rect.height - threshold) return 'bottom'
    return 'center'
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('text/session-name')) return
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
    const droppedSession = e.dataTransfer.getData('text/session-name')
    if (!droppedSession || !dropZone) {
      setDropZone(null)
      return
    }

    if (isSessionInUse?.(droppedSession)) {
      setDropZone(null)
      return
    }

    if (dropZone === 'center') {
      onReplaceSession?.(nodeId, droppedSession)
    } else if (onDropSession) {
      const direction: SplitDirection =
        dropZone === 'left' || dropZone === 'right' ? 'horizontal' : 'vertical'
      onDropSession(nodeId, direction, droppedSession)
    }
    setDropZone(null)
  }

  // Ref callback to mount the session container into this slot.
  // When sessionName or sessionContainers change, the callback identity changes,
  // so React re-invokes it — swapping the container in the commit phase
  // (before TerminalPane effects run, ensuring xterm.js has a DOM context).
  const mountRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      const container = sessionContainers.get(sessionName)
      if (container && container.parentElement !== el) {
        while (el.firstChild) el.removeChild(el.firstChild)
        el.appendChild(container)
      }
    },
    [sessionName, sessionContainers]
  )

  const dropHighlight = dropZone
    ? dropZone === 'center'
      ? 'bg-[var(--color-primary)]/20 border-2 border-dashed border-[var(--color-primary)]/50'
      : `${
          dropZone === 'left'
            ? 'border-l-4 border-l-[var(--color-primary)]'
            : dropZone === 'right'
              ? 'border-r-4 border-r-[var(--color-primary)]'
              : dropZone === 'top'
                ? 'border-t-4 border-t-[var(--color-primary)]'
                : 'border-b-4 border-b-[var(--color-primary)]'
        }`
    : ''

  return (
    <div
      className="group/pane relative h-full w-full"
      style={{
        border: isActive ? `2px solid ${projectColor}` : `1px solid var(--color-border-light)`,
        boxShadow: isActive ? `0 0 0 1px ${projectColor}` : 'none',
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Terminal mount point — rendered behind overlays */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Action buttons — pure CSS visibility via group-hover, z-30 above terminal */}
      <div className="absolute top-1 left-1 z-30 flex items-center gap-0.5
        bg-[var(--color-bg)]/80 border-[length:var(--border-w)] border-[var(--color-border-light)]
        rounded-[var(--radius)] px-0.5 py-0.5 backdrop-blur-sm
        opacity-0 group-hover/pane:opacity-100 transition-opacity pointer-events-none group-hover/pane:pointer-events-auto"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'horizontal') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="水平分屏"
        >
          <Icon icon={IconSplitHorizontal} width={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSplit(nodeId, 'vertical') }}
          disabled={!canSplit}
          className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30 transition-colors cursor-pointer"
          title="垂直分屏"
        >
          <Icon icon={IconSplitVertical} width={14} />
        </button>
        {paneCount > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(nodeId) }}
            className="p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
            title="关闭窗格"
          >
            <Icon icon={IconX} width={14} />
          </button>
        )}
      </div>

      {/* Drag overlay — transparent layer above terminal, only active during drag */}
      {isDragging && (
        <div
          className={`absolute inset-0 z-20 ${dropHighlight}`}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropZone(null)}
          onDrop={handleDrop}
        />
      )}

      {/* Center replace hint */}
      {dropZone === 'center' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 bg-[var(--color-bg)]/90 border-[length:var(--border-w)] border-[var(--color-primary)] rounded-[var(--radius)] px-3 py-1.5">
            <Icon icon={IconReplace} width={14} className="text-[var(--color-primary)]" />
            <span className="text-xs font-bold text-[var(--color-primary)]">替换窗口</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout tree renderer — PaneSlots only, no TerminalPane inside the tree
// ---------------------------------------------------------------------------

function renderLayoutStructure(
  node: SplitLayout,
  props: SplitWorkspaceProps,
  sessionContainers: Map<string, HTMLDivElement>,
  isDragging: boolean
): React.ReactNode {
  if (node.type === 'leaf') {
    const pw = props.paneWindowMap[node.id]
    const sessionName = pw ? `${pw.sessionName}:${pw.windowIndex}` : ''
    const isActive = props.activePaneId === node.id
    return (
      <PaneSlot
        key={node.id}
        nodeId={node.id}
        sessionContainers={sessionContainers}
        sessionName={sessionName}
        canSplit={props.canSplit}
        paneCount={props.paneCount}
        isDragging={isDragging}
        isActive={isActive}
        onSplit={props.onSplit}
        onClose={props.onClose}
        onDropSession={props.onDropSession}
        onReplaceSession={props.onReplaceSession}
        isSessionInUse={props.isWindowInUse}
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

  // Stable leaf ID list
  const leafIds = useMemo(() => getAllLeafIds(layout), [layout])

  // Window keys currently displayed in panes (format: "sessionName:windowIndex")
  const currentSessionNames = useMemo(() => {
    const names = new Set<string>()
    for (const id of leafIds) {
      const pw = props.paneWindowMap[id]
      if (pw) {
        names.add(`${pw.sessionName}:${pw.windowIndex}`)
      }
    }
    return [...names]
  }, [leafIds, props.paneWindowMap])

  // Persistent container elements keyed by session name.
  // ensureInPool only ADDS — switched-away sessions stay "warm" in the pool
  // so switching back is instant (no WS reconnect needed).
  const sessionContainers = useSessionPool(currentSessionNames)

  // Clean up orphaned windows when panes are closed
  const prevLeafIdsRef = useRef(leafIds)
  useEffect(() => {
    const prev = prevLeafIdsRef.current
    prevLeafIdsRef.current = leafIds

    // Only clean up when a pane was removed
    const hadRemoval = prev.some((id) => !leafIds.includes(id))
    if (!hadRemoval) return

    const usedNames = new Set<string>()
    for (const id of leafIds) {
      const pw = props.paneWindowMap[id]
      if (pw) {
        usedNames.add(`${pw.sessionName}:${pw.windowIndex}`)
      }
    }
    const orphaned = [...poolMap.keys()].filter((n) => !usedNames.has(n))
    if (orphaned.length > 0) removeFromPool(orphaned)
  }, [leafIds, props.paneWindowMap])

  // Track global drag state so PaneSlot can show a drag overlay above xterm
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let dragCount = 0
    const onDragEnter = () => { dragCount++; setIsDragging(true) }
    const onDragLeave = () => { dragCount--; if (dragCount <= 0) { dragCount = 0; setIsDragging(false) } }
    const onDragEnd = () => { dragCount = 0; setIsDragging(false) }
    const onDrop = () => { dragCount = 0; setIsDragging(false) }

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
      label: '水平分屏',
      icon: IconSplitHorizontal,
      disabled: !canSplit,
      onClick: () => {
        if (targetPaneId) onSplit(targetPaneId, 'horizontal')
      },
    },
    {
      label: '垂直分屏',
      icon: IconSplitVertical,
      disabled: !canSplit,
      onClick: () => {
        if (targetPaneId) onSplit(targetPaneId, 'vertical')
      },
    },
    {
      label: '关闭窗格',
      icon: IconX,
      disabled: props.paneCount <= 1,
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
        {renderLayoutStructure(layout, props, sessionContainers, isDragging)}
      </div>

      {/* Portaled terminals keyed by window — includes "warm" windows
          that were switched away from but kept alive for instant switch-back */}
      {[...sessionContainers.keys()].map((windowKey) => {
        const container = sessionContainers.get(windowKey)
        if (!container) return null

        // Parse windowKey (format: "sessionName:windowIndex")
        const [sessionName, windowIndexStr] = windowKey.split(':')
        const windowIndex = parseInt(windowIndexStr, 10)

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
