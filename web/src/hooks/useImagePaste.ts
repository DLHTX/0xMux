import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import { registerImage } from '../lib/imageRegistry'

export function useImagePaste(terminalRef: React.RefObject<Terminal | null>) {
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()

          const file = item.getAsFile()
          if (!file) continue

          try {
            const formData = new FormData()
            formData.append('image', file)

            const res = await fetch('/api/upload/image', {
              method: 'POST',
              body: formData,
            })

            if (!res.ok) throw new Error('上传失败')

            const { path } = await res.json()

            // Register image in global registry
            const filename = path.split('/').pop()
            if (filename) {
              registerImage(path, `/api/images/${encodeURIComponent(filename)}`)
            }

            // 粘贴路径到terminal
            terminalRef.current?.paste(path)

            console.log(`图片已保存到: ${path}`)
          } catch (err) {
            console.error('图片上传失败:', err)
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [terminalRef])
}
