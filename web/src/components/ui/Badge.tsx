import type { ReactNode } from 'react'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'outline'

interface BadgeProps {
  variant?: Variant
  children: ReactNode
  className?: string
}

const variantStyles: Record<Variant, string> = {
  default:
    'border-[length:var(--border-w)] border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]',
  success:
    'border-[length:var(--border-w)] border-[var(--color-success)] text-[var(--color-success)] bg-transparent',
  warning:
    'border-[length:var(--border-w)] border-[var(--color-warning)] text-[var(--color-warning)] bg-transparent',
  danger:
    'border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] bg-transparent',
  outline:
    'border-[length:var(--border-w)] border-[var(--color-border-light)] text-[var(--color-fg-muted)] bg-transparent',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-[var(--radius)]
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
