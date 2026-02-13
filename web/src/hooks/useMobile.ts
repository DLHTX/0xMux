import { useEffect, useState } from 'react'

/**
 * Mobile breakpoint: 640px (down from 768px to support foldable phones).
 * Foldable devices like Galaxy Z Fold have ~716px CSS width when unfolded,
 * which should use desktop layout with a collapsible sidebar.
 */
export function useMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

/**
 * Detect compact desktop mode (foldables / small tablets: 640–768px).
 * In this range, desktop layout is used but sidebar should auto-collapse.
 */
export function useCompact() {
  const [isCompact, setIsCompact] = useState(
    () => window.innerWidth >= 640 && window.innerWidth < 768
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px) and (max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsCompact(e.matches)
    mq.addEventListener('change', handler)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCompact(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isCompact
}
