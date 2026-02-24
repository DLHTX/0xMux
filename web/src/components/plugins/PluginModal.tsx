import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconPuzzle, IconRefreshCw, IconX, IconChevronDown, IconChevronUp } from '../../lib/icons'
import { Tabs } from '../ui'
import type {
  AiCatalogResponse,
  AiStatusResponse,
  AiProvider,
  AiSyncType,
  ProviderSyncState,
  SkillCatalogItem,
  McpCatalogItem,
  GlobalConfigResponse,
} from '../../lib/types'

interface PluginModalProps {
  open: boolean
  onClose: () => void
  status: AiStatusResponse | null
  catalog: AiCatalogResponse | null
  loading: boolean
  syncing: boolean
  lastResultText: string | null
  onRefresh: () => void
  onSyncAll: (providers: AiProvider[]) => void
  onSyncItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onUninstallAll: (providers: AiProvider[]) => void
  onUninstallItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onDeleteAll: (providers: AiProvider[]) => void
  onDeleteItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  globalConfig: GlobalConfigResponse | null
  globalConfigSaving: boolean
  onSaveGlobalConfig: (content: string) => void
  onSyncGlobalConfig: () => void
}

export function PluginModal({
  open,
  onClose,
  status,
  catalog,
  loading,
  syncing,
  lastResultText,
  onRefresh,
  onSyncAll,
  onSyncItem,
  onUninstallAll,
  onUninstallItem,
  onDeleteAll,
  onDeleteItem,
  globalConfig,
  globalConfigSaving,
  onSaveGlobalConfig,
  onSyncGlobalConfig,
}: PluginModalProps) {
  const [search, setSearch] = useState('')
  if (!open) return null
  const providerMeta: Record<AiProvider, { label: string; installed: boolean; path: string | null }> = {
    claude: {
      label: 'Claude',
      installed: status?.providers.claude.installed ?? false,
      path: status?.providers.claude.path ?? null,
    },
    codex: {
      label: 'Codex',
      installed: status?.providers.codex.installed ?? false,
      path: status?.providers.codex.path ?? null,
    },
  }

  const activeProviders = (Object.keys(providerMeta) as AiProvider[]).filter(
    (provider) => providerMeta[provider].installed
  )
  const canOperate = activeProviders.length > 0

  const isGlobalSource = (source: string) =>
    source.startsWith('~/.0xmux/') || source.includes('/.0xmux/')

  const allSkills = (catalog?.skills ?? []).filter((item) => isGlobalSource(item.source))
  const allMcp = (catalog?.mcp ?? []).filter((item) => isGlobalSource(item.source))
  const keyword = search.trim().toLowerCase()
  const skills = keyword
    ? allSkills.filter((item) =>
      [item.id, item.name, item.source].some((v) => v.toLowerCase().includes(keyword))
    )
    : allSkills
  const mcp = keyword
    ? allMcp.filter((item) =>
      [item.id, item.name, item.source, item.command, item.args.join(' ')]
        .some((v) => v.toLowerCase().includes(keyword))
    )
    : allMcp
  const isEmpty = !loading && allSkills.length === 0 && allMcp.length === 0
  const noMatch = !loading && !isEmpty && skills.length === 0 && mcp.length === 0

  const handleUninstallAll = () => {
    if (!canOperate || syncing) return
    if (!window.confirm('确认卸载全部 Skills + MCP？')) return
    onUninstallAll(activeProviders)
  }

  const handleDeleteAll = () => {
    if (!canOperate || syncing) return
    if (!window.confirm('确认彻底删除全部 Skills + MCP？此操作会删除源内容。')) return
    onDeleteAll(activeProviders)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: 'var(--modal-backdrop-blur)' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div
        className="pipboy-crt-open-center relative w-[860px] max-w-[95vw] max-h-[86vh] bg-[var(--color-bg)] border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] shadow-[4px_4px_0_var(--color-border-light)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b-[length:var(--border-w)] border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Icon icon={IconPuzzle} width={18} />
            <h2 className="text-base font-bold">插件中心（技能 + MCP）</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            <Icon icon={IconX} width={20} />
          </button>
        </div>

        <div className="p-4 border-b-[length:var(--border-w)] border-[var(--color-border-light)] space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(providerMeta) as AiProvider[]).map((provider) => (
              <div key={provider} className="px-2.5 py-1 rounded-[var(--radius)] border-[length:var(--border-w)] border-[var(--color-border-light)]">
                <span className="font-bold mr-1">{providerMeta[provider].label}</span>
                <span className={providerMeta[provider].installed ? 'text-[var(--color-success)]' : 'text-[var(--color-fg-muted)]'}>
                  {providerMeta[provider].installed ? '已安装' : '未安装'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading || syncing}
              className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] hover:border-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Icon icon={IconRefreshCw} width={14} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>

            <button
              onClick={() => onSyncAll(activeProviders)}
              disabled={!canOperate || syncing}
              className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-primary)] text-[var(--color-primary)] rounded-[var(--radius)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? '处理中...' : '同步全部'}
            </button>

            <button
              onClick={handleUninstallAll}
              disabled={!canOperate || syncing}
              className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)] hover:bg-[var(--color-danger)] hover:text-[var(--color-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              卸载全部
            </button>

            <button
              onClick={handleDeleteAll}
              disabled={!canOperate || syncing}
              className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)] hover:bg-[var(--color-danger)] hover:text-[var(--color-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              彻底删除全部
            </button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索技能 / MCP"
            className="w-full px-3 py-2 text-sm border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] bg-[var(--color-bg)] text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />

          {!canOperate && (
            <div className="text-xs text-[var(--color-warning)]">未检测到可用 Provider（Claude/Codex）。</div>
          )}
          <div className="text-xs text-[var(--color-fg-muted)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] px-3 py-2">
            同步说明：点击“同步”会把这里的技能和 MCP 分发到已安装的 Claude / Codex；“卸载”只从客户端移除；“彻底删除”会连同源内容一起删除。
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Tabs
            tabs={[
              {
                id: 'skills',
                label: `Skills (${skills.length})`,
                content: (
                  <>
                    {isEmpty && (
                      <div className="p-3 border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
                        <div className="font-bold text-[var(--color-fg)] mb-1">暂无可管理内容</div>
                        <div>可在设置里导入或添加技能后再同步。</div>
                      </div>
                    )}
                    {noMatch && (
                      <div className="p-3 border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
                        没有匹配 &quot;{search.trim()}&quot; 的结果。
                      </div>
                    )}
                    {!isEmpty && !noMatch && (
                      <SkillList
                        items={skills}
                        syncing={syncing}
                        providers={activeProviders}
                        onSyncItem={onSyncItem}
                        onUninstallItem={onUninstallItem}
                        onDeleteItem={onDeleteItem}
                      />
                    )}
                  </>
                ),
              },
              {
                id: 'mcp',
                label: `MCP (${mcp.length})`,
                content: (
                  <>
                    {isEmpty && (
                      <div className="p-3 border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
                        <div className="font-bold text-[var(--color-fg)] mb-1">暂无可管理内容</div>
                        <div>可在设置里导入或添加技能后再同步。</div>
                      </div>
                    )}
                    {noMatch && (
                      <div className="p-3 border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
                        没有匹配 &quot;{search.trim()}&quot; 的结果。
                      </div>
                    )}
                    {!isEmpty && !noMatch && (
                      <McpList
                        items={mcp}
                        syncing={syncing}
                        providers={activeProviders}
                        onSyncItem={onSyncItem}
                        onUninstallItem={onUninstallItem}
                        onDeleteItem={onDeleteItem}
                      />
                    )}
                  </>
                ),
              },
              {
                id: 'global-config',
                label: '全局配置',
                content: (
                  <GlobalConfigEditor
                    config={globalConfig}
                    saving={globalConfigSaving}
                    onSave={onSaveGlobalConfig}
                    onSync={onSyncGlobalConfig}
                  />
                ),
              },
            ]}
            defaultTab="skills"
          />

          {lastResultText && (
            <div className="p-3 border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] text-xs text-[var(--color-fg-muted)]">
              {lastResultText}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SkillList({
  items,
  syncing,
  providers,
  onSyncItem,
  onUninstallItem,
  onDeleteItem,
}: {
  items: SkillCatalogItem[]
  syncing: boolean
  providers: AiProvider[]
  onSyncItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onUninstallItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onDeleteItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
}) {
  if (items.length === 0) {
    return <div className="text-xs text-[var(--color-fg-muted)]">暂无 Skills。</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          id={item.id}
          name={item.name}
          description={item.description}
          source={item.source}
          command={null}
          claude={item.claude}
          codex={item.codex}
          syncing={syncing}
          providers={providers}
          kind="skills"
          recommended={item.recommended}
          official={item.official}
          onSyncItem={onSyncItem}
          onUninstallItem={onUninstallItem}
          onDeleteItem={onDeleteItem}
        />
      ))}
    </div>
  )
}

function McpList({
  items,
  syncing,
  providers,
  onSyncItem,
  onUninstallItem,
  onDeleteItem,
}: {
  items: McpCatalogItem[]
  syncing: boolean
  providers: AiProvider[]
  onSyncItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onUninstallItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onDeleteItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
}) {
  if (items.length === 0) {
    return <div className="text-xs text-[var(--color-fg-muted)]">暂无 MCP。</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          id={item.id}
          name={item.name}
          description={item.description}
          source={item.source}
          command={`${item.command} ${item.args.join(' ')}`.trim()}
          claude={item.claude}
          codex={item.codex}
          syncing={syncing}
          providers={providers}
          kind="mcp"
          recommended={item.recommended}
          official={item.official}
          onSyncItem={onSyncItem}
          onUninstallItem={onUninstallItem}
          onDeleteItem={onDeleteItem}
        />
      ))}
    </div>
  )
}

function ItemCard({
  id,
  name,
  description,
  source,
  command,
  claude,
  codex,
  syncing,
  providers,
  kind,
  recommended,
  official,
  onSyncItem,
  onUninstallItem,
  onDeleteItem,
}: {
  id: string
  name: string
  description: string
  source: string
  command: string | null
  claude: ProviderSyncState
  codex: ProviderSyncState
  syncing: boolean
  providers: AiProvider[]
  kind: AiSyncType
  recommended?: boolean
  official?: boolean
  onSyncItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onUninstallItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
  onDeleteItem: (kind: AiSyncType, id: string, providers: AiProvider[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasDescription = description.length > 0
  const highlighted = official || recommended

  return (
    <div className={`p-3 border-[length:var(--border-w)] rounded-[var(--radius)] ${highlighted ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border-light)]'}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate flex items-center gap-2">
            {name}
            {official && (
              <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-bold shrink-0">
                官方
              </span>
            )}
            {recommended && !official && (
              <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-warning)] text-[var(--color-bg)] font-bold shrink-0">
                推荐
              </span>
            )}
          </div>
          {command ? (
            <div className="text-xs text-[var(--color-fg-muted)] font-mono truncate">{command}</div>
          ) : (
            <div className="text-xs text-[var(--color-fg-muted)] font-mono truncate">{source}</div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onSyncItem(kind, id, providers)}
            disabled={syncing || providers.length === 0}
            className="px-2 py-1 text-xs border-[length:var(--border-w)] border-[var(--color-primary)] text-[var(--color-primary)] rounded-[var(--radius)] disabled:opacity-50"
          >
            同步
          </button>
          <button
            onClick={() => onUninstallItem(kind, id, providers)}
            disabled={syncing || providers.length === 0}
            className="px-2 py-1 text-xs border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)] disabled:opacity-50"
          >
            卸载
          </button>
          <button
            onClick={() => {
              if (!window.confirm(`确认彻底删除 ${name}？此操作会删除源内容。`)) return
              onDeleteItem(kind, id, providers)
            }}
            disabled={syncing || providers.length === 0}
            className="px-2 py-1 text-xs border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] rounded-[var(--radius)] disabled:opacity-50"
          >
            彻底删除
          </button>
        </div>
      </div>
      <div className="text-xs flex items-center gap-3 text-[var(--color-fg-muted)]">
        <span>Claude: <StateTag state={claude} /></span>
        <span>Codex: <StateTag state={codex} /></span>
        {hasDescription && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto flex items-center gap-0.5 text-[var(--color-primary)] hover:underline"
          >
            {expanded ? '收起' : '详情'}
            <Icon icon={expanded ? IconChevronUp : IconChevronDown} width={12} />
          </button>
        )}
      </div>
      {expanded && hasDescription && (
        <div className="mt-2 pt-2 border-t-[length:var(--border-w)] border-[var(--color-border-light)] text-xs text-[var(--color-fg-muted)] whitespace-pre-wrap">
          {description}
        </div>
      )}
    </div>
  )
}

function StateTag({ state }: { state: ProviderSyncState }) {
  if (!state.exists) return <span className="text-[var(--color-fg-muted)]">未配置</span>
  if (state.in_sync) return <span className="text-[var(--color-success)]">已同步</span>
  return <span className="text-[var(--color-warning)]">待同步</span>
}

function GlobalConfigEditor({
  config,
  saving,
  onSave,
  onSync,
}: {
  config: GlobalConfigResponse | null
  saving: boolean
  onSave: (content: string) => void
  onSync: () => void
}) {
  const [draft, setDraft] = useState(config?.content ?? '')
  const [initialized, setInitialized] = useState(false)

  // Sync draft from config when first loaded
  if (config && !initialized) {
    setDraft(config.content)
    setInitialized(true)
  }

  const isDirty = draft !== (config?.content ?? '')

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--color-fg-muted)] border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] px-3 py-2">
        编写全局指令（如 CLAUDE.md 内容），保存后可同步到 Claude CLI 和 Codex CLI。
        目标文件中会用注释标记 0xMux 管理的区域，不会覆盖你手写的其他内容。
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="在此输入全局指令..."
        className="w-full h-48 px-3 py-2 text-sm font-mono border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] bg-[var(--color-bg)] text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-y"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !isDirty}
          className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-primary)] text-[var(--color-primary)] rounded-[var(--radius)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存'}
        </button>

        <button
          onClick={onSync}
          disabled={saving || isDirty}
          className="px-3 py-1.5 text-xs font-bold border-[length:var(--border-w)] border-[var(--color-border-light)] rounded-[var(--radius)] hover:border-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed"
          title={isDirty ? '请先保存再同步' : '同步到已安装的 Provider'}
        >
          同步到 Provider
        </button>

        {config && (
          <div className="flex gap-3 text-xs text-[var(--color-fg-muted)] ml-auto">
            <span>Claude: <StateTag state={config.claude} /></span>
            <span>Codex: <StateTag state={config.codex} /></span>
          </div>
        )}
      </div>
    </div>
  )
}
