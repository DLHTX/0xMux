import { useState, useRef, useCallback, useEffect } from 'react'
import { searchFiles } from '../lib/api'
import type { SearchResponse, SearchOptions, WorkspaceContext } from '../lib/types'

export function useSearch(workspace?: WorkspaceContext) {
  const [options, setOptions] = useState<SearchOptions>({
    query: '',
    isRegex: false,
    caseSensitive: false,
  })
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((opts: SearchOptions) => {
    setOptions(opts)

    if (timerRef.current) clearTimeout(timerRef.current)

    if (!opts.query.trim()) {
      setResults(null)
      setError(null)
      return
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await searchFiles(opts.query, {
          regex: opts.isRegex,
          case: opts.caseSensitive,
          glob: opts.fileGlob,
        }, workspace)
        setResults(res)
      } catch (e: unknown) {
        const msg = e && typeof e === 'object' && 'message' in e ? (e as { message: string }).message : 'Search failed'
        setError(msg)
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [workspace])

  const updateQuery = useCallback((query: string) => {
    search({ ...options, query })
  }, [options, search])

  const toggleRegex = useCallback(() => {
    const next = { ...options, isRegex: !options.isRegex }
    search(next)
  }, [options, search])

  const toggleCase = useCallback(() => {
    const next = { ...options, caseSensitive: !options.caseSensitive }
    search(next)
  }, [options, search])

  const setGlob = useCallback((glob: string) => {
    const next = { ...options, fileGlob: glob || undefined }
    search(next)
  }, [options, search])

  useEffect(() => {
    if (!options.query.trim()) {
      setResults(null)
      setError(null)
      return
    }
    search(options)
  }, [workspace?.session, workspace?.window])

  return {
    options,
    results,
    loading,
    error,
    updateQuery,
    toggleRegex,
    toggleCase,
    setGlob,
  }
}
