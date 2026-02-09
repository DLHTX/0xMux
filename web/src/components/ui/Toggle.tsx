interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  className?: string
}

export function Toggle({ checked, onChange, label, className = '' }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative w-10 h-5 border-[length:var(--border-w)] border-[var(--color-border)] rounded-[var(--radius)] transition-colors
          ${checked ? 'bg-[var(--color-primary)]' : 'bg-transparent'}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-3 h-3 rounded-[var(--radius)] transition-all
            ${checked ? 'left-5 bg-[var(--color-primary-fg)]' : 'left-0.5 bg-[var(--color-border)]'}
          `}
        />
      </button>
      {label && (
        <span className="text-xs font-bold text-[var(--color-fg-muted)]">{label}</span>
      )}
    </label>
  )
}
