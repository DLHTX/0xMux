import { useState, useCallback } from 'react'
import { getGitStatus, getGitLog, getGitBranches } from '../lib/api'
import type { GitStatus, GitCommit, GitBranch, WorkspaceContext } from '../lib/types'
import { getErrorMessage } from '../lib/error'

export function useGitStatus(workspace?: WorkspaceContext) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, l, b] = await Promise.all([
        getGitStatus(workspace),
        getGitLog(20, workspace),
        getGitBranches(workspace),
      ])
      setStatus(s)
      setCommits(l.commits)
      setBranches(b.branches)
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to fetch git status'))
    } finally {
      setLoading(false)
    }
  }, [workspace])

  return { status, commits, branches, loading, error, refresh }
}
