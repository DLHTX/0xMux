import { createContext, useContext } from 'react'
import { useWindowActivity, type UseWindowActivityReturn } from '../hooks/useWindowActivity'

const WindowActivityContext = createContext<UseWindowActivityReturn | null>(null)

export function WindowActivityProvider({ children }: { children: React.ReactNode }) {
  const activity = useWindowActivity()
  return <WindowActivityContext.Provider value={activity}>{children}</WindowActivityContext.Provider>
}

/** Access the shared window activity tracker. Must be used inside <WindowActivityProvider>. */
export function useActivity(): UseWindowActivityReturn {
  const ctx = useContext(WindowActivityContext)
  if (!ctx) {
    throw new Error('useActivity() must be used within <WindowActivityProvider>')
  }
  return ctx
}
