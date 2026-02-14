export type Locale = 'en' | 'zh'

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'zh', label: '中文' },
]

const en = {
  // Header
  'header.subtitle': 'tmux session manager',
  'header.active': 'active',
  'header.settings': 'Theme settings',

  // Connection status
  'status.connected': 'connected',
  'status.connecting': 'connecting',
  'status.disconnected': 'disconnected',

  // Session
  'session.attached': 'attached',
  'session.detached': 'detached',
  'session.deleteConfirm': 'Delete session "{name}"?',
  'session.windows': '{n}w',

  // Session grid
  'grid.connecting': 'connecting...',
  'grid.empty': 'no tmux sessions found',
  'grid.emptyHint': 'click + to create a new session',

  // Create modal
  'create.command': '$ tmux new-session -s',
  'create.placeholder': 'session-name',
  'create.cancel': 'esc',
  'create.submit': 'enter',
  'create.maxChars': 'Max 50 characters',
  'create.invalidChars': 'Only letters, numbers, _ . - allowed',
  'create.required': 'Name required',
  'create.workdir': 'Working Directory',
  'create.selectThisDir': 'Select this directory',
  'create.recentDirs': 'Recent',
  'create.emptyDir': 'Empty directory',

  // Setup wizard
  'setup.command': '0xmux --check-deps',
  'setup.title': 'Environment Setup',
  'setup.system': 'System:',
  'setup.noPkgMgr': 'no package manager',
  'setup.restart': '> Restart 0xMux',
  'setup.reconnecting': 'Reconnecting...',

  // Dependencies
  'dep.optional': 'optional',
  'dep.notFound': 'not found',
  'dep.install': 'Install',
  'dep.skip': 'Skip',
  'dep.installOk': '[ok] Installation completed',
  'dep.installFail': '[x] Installation failed',
  'dep.tryManually': 'Try manually:',

  // Terminal errors
  'terminal.ptyExhausted': 'PTY Exhausted',
  'terminal.ptyExhaustedHint': 'System pseudo-terminals (PTY) exhausted. Zombie processes may be occupying resources. Please clean up and retry.',
  'terminal.channelError': 'Channel Error',
  'terminal.reconnect': 'Reconnect',
  'terminal.retry': 'Retry',
  'terminal.connecting': 'Connecting...',
  'terminal.reconnecting': 'Reconnecting...',
  'terminal.exitCode': 'Process exited with code {code}',

  // App
  'app.initializing': 'initializing...',

  // Theme configurator
  'theme.title': 'Theme',
  'theme.presets': 'Presets',
  'theme.mode': 'Mode',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.primaryColor': 'Primary Color',
  'theme.border': 'Border',
  'theme.borderWidth': 'Width',
  'theme.borderRadius': 'Radius',
  'theme.font': 'Font',
  'theme.fontBody': 'Body',
  'theme.fontMono': 'Mono',
  'theme.fontSize': 'Font Size',
  'theme.fontScale': 'Scale',
  'theme.reset': 'Reset to Preset Default',
  'theme.language': 'Language',

  // Activity Bar
  'activity.sessions': 'Sessions',
  'activity.files': 'Files',
  'activity.search': 'Search',
  'activity.git': 'Git',
  'activity.notifications': 'Notifications',

  // Notifications
  'notification.markAllRead': 'Mark all read',
  'notification.empty': 'No notifications',
  'notification.screenshot': 'Screenshot',

  // File Explorer
  'files.title': 'Explorer',
  'files.expandAll': 'Expand All',
  'files.collapseAll': 'Collapse All',
  'files.empty': 'No files',

  // Search Panel
  'search.title': 'Search',
  'search.placeholder': 'Search...',
  'search.regex': 'Regex',
  'search.caseSensitive': 'Case Sensitive',
  'search.fileFilter': 'File filter (e.g. *.rs)',
  'search.noResults': 'No results',
  'search.results': '{files} files, {matches} matches',
  'search.truncated': 'Results truncated (max {max})',

  // Git Panel
  'git.title': 'Source Control',
  'git.branch': 'Branch',
  'git.noRepo': 'Not a git repository',
  'git.staged': 'Staged Changes',
  'git.unstaged': 'Changes',
  'git.untracked': 'Untracked',
  'git.commits': 'Recent Commits',
  'git.branches': 'Branches',
  'git.refresh': 'Refresh',
  'git.ahead': '{n} ahead',
  'git.behind': '{n} behind',

  // Drag & Drop
  'terminal.dropExternal': 'Upload & paste path',
  'terminal.dropFile': 'Drop to paste path',
  'editor.dropHere': 'Drop files to current directory',

  // Editor
  'editor.unsaved': 'Unsaved changes',
  'editor.save': 'Save (Ctrl+S)',
  'editor.close': 'Close',
  'editor.closeOthers': 'Close Others',

  // Context Menu (File Explorer)
  'ctx.open': 'Open',
  'ctx.newFile': 'New File...',
  'ctx.newFolder': 'New Folder...',
  'ctx.copyPath': 'Copy Relative Path',
  'ctx.copyAbsPath': 'Copy Absolute Path',
  'ctx.copyName': 'Copy Name',
  'ctx.rename': 'Rename',
  'ctx.delete': 'Delete',
  'ctx.reveal': 'Reveal in File Manager',
  'ctx.deleteConfirm': 'Delete "{name}"?',
  'ctx.deleteMultiple': 'Delete {n} items?',
  'ctx.deleteSelected': 'Delete Selected ({n})',
  'ctx.deleteHint': 'File will be moved to system trash.',
  'ctx.dontAskAgain': "Don't ask again",
  'ctx.cancel': 'Cancel',
  'ctx.confirmDelete': 'Delete',

  // Undo
  'undo.rename': 'Undo rename: {old} → {new}',
  'undo.create': 'Undo create: {name}',
  'undo.empty': 'Nothing to undo',
} as const

const zh: { [K in keyof typeof en]: string } = {
  'header.subtitle': 'tmux 会话管理器',
  'header.active': '活跃',
  'header.settings': '主题设置',

  'status.connected': '已连接',
  'status.connecting': '连接中',
  'status.disconnected': '已断开',

  'session.attached': '已挂载',
  'session.detached': '已分离',
  'session.deleteConfirm': '删除会话 "{name}"？',
  'session.windows': '{n}窗口',

  'grid.connecting': '连接中...',
  'grid.empty': '未找到 tmux 会话',
  'grid.emptyHint': '点击 + 创建新会话',

  'create.command': '$ tmux new-session -s',
  'create.placeholder': '会话名称',
  'create.cancel': '取消',
  'create.submit': '确认',
  'create.maxChars': '最多 50 个字符',
  'create.invalidChars': '仅允许字母、数字、_ . -',
  'create.required': '需要名称',
  'create.workdir': '工作目录',
  'create.selectThisDir': '选择当前目录',
  'create.recentDirs': '最近',
  'create.emptyDir': '空目录',

  'setup.command': '0xmux --check-deps',
  'setup.title': '环境配置',
  'setup.system': '系统：',
  'setup.noPkgMgr': '无包管理器',
  'setup.restart': '> 重启 0xMux',
  'setup.reconnecting': '重连中...',

  'dep.optional': '可选',
  'dep.notFound': '未找到',
  'dep.install': '安装',
  'dep.skip': '跳过',
  'dep.installOk': '[ok] 安装完成',
  'dep.installFail': '[x] 安装失败',
  'dep.tryManually': '手动尝试：',

  'terminal.ptyExhausted': 'PTY 耗尽',
  'terminal.ptyExhaustedHint': '系统伪终端(PTY)已用完，可能有僵尸进程占用资源。请清理后重试。',
  'terminal.channelError': '通道错误',
  'terminal.reconnect': '重新连接',
  'terminal.retry': '重试',
  'terminal.connecting': '连接中...',
  'terminal.reconnecting': '重连中...',
  'terminal.exitCode': '进程退出，代码 {code}',

  'app.initializing': '初始化中...',

  'theme.title': '主题',
  'theme.presets': '预设',
  'theme.mode': '模式',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.primaryColor': '主色',
  'theme.border': '边框',
  'theme.borderWidth': '粗细',
  'theme.borderRadius': '圆角',
  'theme.font': '字体',
  'theme.fontBody': '正文',
  'theme.fontMono': '等宽',
  'theme.fontSize': '字号',
  'theme.fontScale': '缩放',
  'theme.reset': '恢复预设默认',
  'theme.language': '语言',

  'activity.sessions': '终端',
  'activity.files': '文件',
  'activity.search': '搜索',
  'activity.git': 'Git',
  'activity.notifications': '通知',

  'notification.markAllRead': '全部已读',
  'notification.empty': '暂无通知',
  'notification.screenshot': '截图',

  'files.title': '资源管理器',
  'files.expandAll': '展开全部',
  'files.collapseAll': '折叠全部',
  'files.empty': '无文件',

  'search.title': '搜索',
  'search.placeholder': '搜索...',
  'search.regex': '正则',
  'search.caseSensitive': '区分大小写',
  'search.fileFilter': '文件过滤 (如 *.rs)',
  'search.noResults': '无结果',
  'search.results': '{files} 个文件，{matches} 个匹配',
  'search.truncated': '结果已截断 (最多 {max})',

  'git.title': '源代码管理',
  'git.branch': '分支',
  'git.noRepo': '非 Git 仓库',
  'git.staged': '暂存的更改',
  'git.unstaged': '更改',
  'git.untracked': '未跟踪',
  'git.commits': '最近提交',
  'git.branches': '分支',
  'git.refresh': '刷新',
  'git.ahead': '领先 {n}',
  'git.behind': '落后 {n}',

  'terminal.dropExternal': '上传文件并粘贴路径',
  'terminal.dropFile': '粘贴文件绝对路径',
  'editor.dropHere': '拖拽文件到当前目录',

  'editor.unsaved': '未保存更改',
  'editor.save': '保存 (Ctrl+S)',
  'editor.close': '关闭',
  'editor.closeOthers': '关闭其他',

  'ctx.open': '打开',
  'ctx.newFile': '新建文件...',
  'ctx.newFolder': '新建文件夹...',
  'ctx.copyPath': '复制相对路径',
  'ctx.copyAbsPath': '复制绝对路径',
  'ctx.copyName': '复制名称',
  'ctx.rename': '重命名',
  'ctx.delete': '删除',
  'ctx.reveal': '在文件管理器中打开',
  'ctx.deleteConfirm': '删除 "{name}"？',
  'ctx.deleteMultiple': '删除 {n} 个项目？',
  'ctx.deleteSelected': '删除选中 ({n})',
  'ctx.deleteHint': '文件将移至系统回收站。',
  'ctx.dontAskAgain': '下次不再提醒',
  'ctx.cancel': '取消',
  'ctx.confirmDelete': '删除',

  'undo.rename': '撤销重命名：{old} → {new}',
  'undo.create': '撤销创建：{name}',
  'undo.empty': '没有可撤销的操作',
}

export type MessageKey = keyof typeof en

type Messages = { [K in keyof typeof en]: string }

const messages: Record<Locale, Messages> = { en, zh }

export function getMessage(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = messages[locale][key] ?? messages.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

const I18N_STORAGE_KEY = '0xmux-locale'

export function getInitialLocale(): Locale {
  const stored = localStorage.getItem(I18N_STORAGE_KEY)
  if (stored === 'en' || stored === 'zh') return stored
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'zh'
  return 'en'
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(I18N_STORAGE_KEY, locale)
}
