import type { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  options: Option[]
  error?: string
}

export function Select({ label, options, error, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-bold text-[var(--color-fg-muted)]">
          {label}
        </label>
      )}
      <select
        className={`
          w-full bg-[var(--color-bg)] border-[length:var(--border-w)] rounded-[var(--radius)] px-3 py-1.5 text-sm outline-none cursor-pointer
          transition-colors appearance-none font-[inherit]
          ${
            error
              ? 'border-[var(--color-danger)]'
              : 'border-[var(--color-border-light)] focus:border-[var(--color-border)]'
          }
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      )}
    </div>
  )
}
