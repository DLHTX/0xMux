import type { GitFileStatus } from './types'

const STATUS_PRIORITY: Record<GitFileStatus, number> = {
  deleted: 5,
  modified: 4,
  renamed: 3,
  copied: 3,
  added: 2,
  untracked: 1,
}

const STATUS_BADGE: Record<GitFileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'u',
}

const STATUS_COLOR: Record<GitFileStatus, string> = {
  // Match VSCode SCM decoration semantics: modified≈yellow, added/untracked≈green.
  modified: 'var(--color-warning, #e2c08d)',
  added: 'var(--color-success, #73c991)',
  deleted: 'var(--color-danger, #f14c4c)',
  renamed: 'var(--color-success, #73c991)',
  copied: 'var(--color-success, #73c991)',
  untracked: 'var(--color-success, #73c991)',
}

function isGitFileStatus(value: string): value is GitFileStatus {
  return value in STATUS_PRIORITY
}

export function getGitStatusBadge(status: string): string {
  return isGitFileStatus(status) ? STATUS_BADGE[status] : '?'
}

export function getGitStatusColor(status: string): string {
  return isGitFileStatus(status) ? STATUS_COLOR[status] : 'var(--color-fg-muted)'
}

export function buildGitStatusMap(
  files: Array<{ path: string; status: string }>
): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>()

  for (const file of files) {
    if (!isGitFileStatus(file.status)) continue

    const existing = map.get(file.path)
    if (!existing || STATUS_PRIORITY[file.status] > STATUS_PRIORITY[existing]) {
      map.set(file.path, file.status)
    }
  }

  return map
}
