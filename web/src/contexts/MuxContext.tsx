import { createContext, useContext } from 'react'
import { useMuxSocket, type UseMuxSocketReturn } from '../hooks/useMuxSocket'

const MuxContext = createContext<UseMuxSocketReturn | null>(null)

export function MuxProvider({ children }: { children: React.ReactNode }) {
  const mux = useMuxSocket()
  return <MuxContext.Provider value={mux}>{children}</MuxContext.Provider>
}

/** Access the shared MuxSocket instance. Must be used inside <MuxProvider>. */
export function useMux(): UseMuxSocketReturn {
  const ctx = useContext(MuxContext)
  if (!ctx) {
    throw new Error('useMux() must be used within <MuxProvider>')
  }
  return ctx
}
