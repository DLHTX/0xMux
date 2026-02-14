export interface EditorStatusBarProps {
  language: string
  line: number
  col: number
  fileSize: number
  encoding: string
}

/** Format byte size into human-readable string */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EditorStatusBar({
  language,
  line,
  col,
  fileSize,
  encoding,
}: EditorStatusBarProps) {
  return (
    <div
      className="flex items-center justify-between px-3 text-[11px] font-mono shrink-0 select-none"
      style={{
        height: 22,
        background: 'var(--color-bg-alt)',
        color: 'var(--color-fg-muted)',
        borderTop: 'var(--border-w) solid var(--color-border-light)',
      }}
    >
      <div className="flex items-center gap-3">
        <span>{language}</span>
        <span>Ln {line}, Col {col}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{encoding}</span>
        <span>{formatSize(fileSize)}</span>
      </div>
    </div>
  )
}
