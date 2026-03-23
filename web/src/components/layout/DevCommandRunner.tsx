import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { IconZap, IconPlay, IconPlus, IconTrash, IconEdit } from '../../lib/icons'
import { runDevCommand } from '../../lib/api'
import { loadJSON, saveJSON } from '../../lib/storage'

const DEV_COMMANDS_KEY = '0xmux-dev-commands'

export interface DevCommand {
  id: string
  name: string
  command: string
  port?: number
}

type DevCommandStore = Record<string, DevCommand[]>

function loadCommands(): DevCommandStore {
  return loadJSON<DevCommandStore>(DEV_COMMANDS_KEY) ?? {}
}

function saveCommands(store: DevCommandStore) {
  saveJSON(DEV_COMMANDS_KEY, store)
}

function genId(): string {
  return Math.random().toString(36).slice(2, 8)
}

interface DevCommandRunnerProps {
  repoRoot: string | null
  sessionName: string | null
}

export function DevCommandRunner({ repoRoot, sessionName }: DevCommandRunnerProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [commands, setCommands] = useState<DevCommand[]>([])
  const [running, setRunning] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  // Form state for add/edit
  const [editId, setEditId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formPort, setFormPort] = useState('')

  const key = repoRoot ?? '__global'

  useEffect(() => {
    const store = loadCommands()
    setCommands(store[key] ?? [])
  }, [key, open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setEditing(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [open])

  const persistCommands = useCallback((cmds: DevCommand[]) => {
    setCommands(cmds)
    const store = loadCommands()
    store[key] = cmds
    saveCommands(store)
  }, [key])

  const handleRun = useCallback(async (cmd: DevCommand) => {
    if (!sessionName) return
    setRunning(prev => new Set(prev).add(cmd.id))
    try {
      await runDevCommand(sessionName, cmd.command, cmd.name, cmd.port)
    } catch (e) {
      console.error('[DevRunner] failed:', e)
    } finally {
      setRunning(prev => {
        const next = new Set(prev)
        next.delete(cmd.id)
        return next
      })
    }
  }, [sessionName])

  const handleAdd = useCallback(() => {
    setEditId(null)
    setFormName('')
    setFormCommand('')
    setFormPort('')
    setEditing(true)
  }, [])

  const handleEditCmd = useCallback((cmd: DevCommand) => {
    setEditId(cmd.id)
    setFormName(cmd.name)
    setFormCommand(cmd.command)
    setFormPort(cmd.port ? String(cmd.port) : '')
    setEditing(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    persistCommands(commands.filter(c => c.id !== id))
  }, [commands, persistCommands])

  const handleSave = useCallback(() => {
    if (!formName.trim() || !formCommand.trim()) return
    const port = formPort ? parseInt(formPort, 10) : undefined
    if (editId) {
      persistCommands(commands.map(c =>
        c.id === editId ? { ...c, name: formName.trim(), command: formCommand.trim(), port } : c
      ))
    } else {
      persistCommands([...commands, {
        id: genId(),
        name: formName.trim(),
        command: formCommand.trim(),
        port,
      }])
    }
    setEditing(false)
    setEditId(null)
  }, [editId, formName, formCommand, formPort, commands, persistCommands])

  const projectName = repoRoot?.split('/').pop() ?? 'global'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(prev => !prev); setEditing(false) }}
        className="flex items-center gap-1 px-1.5 h-full text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
        title="Dev Commands"
      >
        <Icon icon={IconZap} width={13} />
        <span className="font-bold">dev</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 z-50 bg-[var(--color-bg)] border border-[var(--color-border-light)] shadow-lg"
          style={{ minWidth: 280, maxWidth: 360 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-light)]">
            <span className="text-[11px] font-bold text-[var(--color-fg-muted)] uppercase tracking-wider truncate">
              {projectName}
            </span>
            <button
              onClick={handleAdd}
              className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              title="添加命令"
            >
              <Icon icon={IconPlus} width={14} />
            </button>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="px-3 py-2 border-b border-[var(--color-border-light)] flex flex-col gap-1.5">
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="名称 (如: frontend)"
                className="w-full bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1 border border-[var(--color-border-light)] outline-none"
                autoFocus
              />
              <input
                value={formCommand}
                onChange={(e) => setFormCommand(e.target.value)}
                placeholder="命令 (如: npm run dev)"
                className="w-full bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1 border border-[var(--color-border-light)] outline-none font-mono"
              />
              <div className="flex items-center gap-2">
                <input
                  value={formPort}
                  onChange={(e) => setFormPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="端口 (可选)"
                  className="flex-1 bg-[var(--color-bg-alt)] text-[var(--color-fg)] text-xs px-2 py-1 border border-[var(--color-border-light)] outline-none font-mono"
                />
                <button
                  onClick={handleSave}
                  disabled={!formName.trim() || !formCommand.trim()}
                  className="px-2 py-1 text-[10px] font-bold bg-[var(--color-primary)] text-[var(--color-primary-fg)] disabled:opacity-40 cursor-pointer"
                >
                  {editId ? '保存' : '添加'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditId(null) }}
                  className="px-2 py-1 text-[10px] font-bold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] cursor-pointer"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Command list */}
          {commands.length > 0 ? (
            <div className="py-1">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="group/cmd flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-bg-alt)] transition-colors"
                >
                  {/* Run button */}
                  <button
                    onClick={() => void handleRun(cmd)}
                    disabled={!sessionName || running.has(cmd.id)}
                    className="shrink-0 w-6 h-6 flex items-center justify-center text-[var(--color-success)] hover:bg-[var(--color-success)]/15 transition-colors cursor-pointer disabled:opacity-40"
                    title={`运行: ${cmd.command}`}
                  >
                    <Icon icon={IconPlay} width={14} className={running.has(cmd.id) ? 'animate-pulse' : ''} />
                  </button>

                  {/* Name + command */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[var(--color-fg)] truncate">{cmd.name}</div>
                    <div className="text-[10px] font-mono text-[var(--color-fg-muted)] truncate">
                      {cmd.command}
                      {cmd.port && <span className="ml-1 text-[var(--color-accent)]">:{cmd.port}</span>}
                    </div>
                  </div>

                  {/* Edit / Delete — visible on hover */}
                  <div className="shrink-0 flex items-center gap-0 opacity-0 group-hover/cmd:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditCmd(cmd)}
                      className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors cursor-pointer"
                    >
                      <Icon icon={IconEdit} width={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(cmd.id)}
                      className="w-5 h-5 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
                    >
                      <Icon icon={IconTrash} width={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : !editing ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-[var(--color-fg-faint)]">还没有 dev 命令</p>
              <button
                onClick={handleAdd}
                className="mt-1 text-[11px] text-[var(--color-primary)] hover:underline cursor-pointer"
              >
                添加一个
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
