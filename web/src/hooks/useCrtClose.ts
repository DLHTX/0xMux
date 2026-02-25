import { useState, useEffect, useRef } from 'react'

/**
 * Delays modal unmount when `open` transitions true→false,
 * giving the CRT-shutdown CSS animation time to play.
 */
export function useCrtClose(open: boolean, duration = 350) {
  const [visible, setVisible] = useState(open)
  const [closing, setClosing] = useState(false)
  const prevOpen = useRef(open)

  useEffect(() => {
    if (open && !prevOpen.current) {
      // opening
      setVisible(true)
      setClosing(false)
    } else if (!open && prevOpen.current) {
      // closing — play animation then unmount
      setClosing(true)
      const timer = setTimeout(() => {
        setClosing(false)
        setVisible(false)
      }, duration)
      prevOpen.current = open
      return () => clearTimeout(timer)
    }
    prevOpen.current = open
  }, [open, duration])

  return { visible, closing }
}
