import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-bold text-[var(--color-fg-muted)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-transparent border-[length:var(--border-w)] rounded-[var(--radius)] px-3 py-1.5 text-sm outline-none
            transition-colors
            ${
              error
                ? 'border-[var(--color-danger)]'
                : 'border-[var(--color-border-light)] focus:border-[var(--color-border)]'
            }
            placeholder:text-[var(--color-fg-faint)]
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-xs text-[var(--color-danger)]">{error}</span>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
