/**
 * TermUI Buffer Scanner — scans xterm.js buffer for TERMUI markers
 * and extracts HTML content for rendering in a webview pane.
 *
 * Protocol (all printable text, tmux-safe):
 *   __TERMUI_BEGIN__
 *   <base64 HTML, may span lines>
 *   __TERMUI_END__
 */

import type { Terminal } from '@xterm/xterm'

const BEGIN_TEXT = '__TERMUI_BEGIN__'
const END_TEXT = '__TERMUI_END__'

export type TermUIRenderHandler = (html: string) => void

/**
 * Buffer scanner that checks xterm's buffer for TERMUI markers.
 * Uses content-based dedup (hash of base64) to avoid re-triggering
 * on the same block after clear/scroll.
 */
export class TermUIBufferScanner {
  private terminal: Terminal
  private onRender: TermUIRenderHandler
  private processedHashes = new Set<string>()
  private scanTimer: ReturnType<typeof setTimeout> | null = null
  private lastScanLength = 0

  constructor(terminal: Terminal, onRender: TermUIRenderHandler) {
    this.terminal = terminal
    this.onRender = onRender
  }

  /** Schedule a buffer scan (debounced 150ms, only if buffer grew) */
  scheduleScan() {
    if (this.scanTimer) return
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null
      const currentLength = this.terminal.buffer.active.length
      // Only scan if buffer has grown since last scan
      if (currentLength > this.lastScanLength) {
        this.scan()
        this.lastScanLength = currentLength
      }
    }, 150)
  }

  private simpleHash(s: string): string {
    // Fast hash for dedup — first 32 + last 32 chars + length
    if (s.length <= 64) return s
    return `${s.slice(0, 32)}...${s.slice(-32)}:${s.length}`
  }

  private scan() {
    const buf = this.terminal.buffer.active
    const totalLines = buf.length
    // Only scan lines added since last scan
    const startScan = Math.max(0, this.lastScanLength - 5) // small overlap for safety

    for (let i = startScan; i < totalLines; i++) {
      const line = buf.getLine(i)
      if (!line) continue
      const text = line.translateToString().trimEnd()

      if (!text.includes(BEGIN_TEXT)) continue

      // Found BEGIN — search for END
      const b64Lines: string[] = []
      let endLine = -1

      for (let j = i + 1; j < Math.min(totalLines, i + 100); j++) {
        const jLine = buf.getLine(j)
        if (!jLine) break
        const jText = jLine.translateToString().trimEnd()

        if (jText.includes(END_TEXT)) {
          endLine = j
          break
        }
        b64Lines.push(jText)
      }

      if (endLine === -1) continue

      // Content-based dedup
      const b64 = b64Lines.join('').replace(/\s/g, '')
      const hash = this.simpleHash(b64)
      if (this.processedHashes.has(hash)) {
        // Skip past this block
        i = endLine
        continue
      }
      this.processedHashes.add(hash)

      // Decode
      try {
        const html = atob(b64)
        console.log('[TermUI] Block found, html length:', html.length)
        this.onRender(html)
      } catch {
        console.warn('[TermUI] Invalid base64 at line', i)
      }

      // Skip past this block
      i = endLine
    }
  }

  dispose() {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }
    this.processedHashes.clear()
  }
}
