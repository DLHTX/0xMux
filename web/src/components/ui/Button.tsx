import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary:
    'border-[length:var(--border-w)] border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:bg-transparent hover:text-[var(--color-fg)]',
  secondary:
    'border-[length:var(--border-w)] border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-fg)] hover:bg-[var(--color-border)] hover:text-[var(--color-bg)]',
  outline:
    'border-[length:var(--border-w)] border-[var(--color-border)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)]',
  ghost:
    'border-[length:var(--border-w)] border-transparent bg-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-alt)]',
  danger:
    'border-[length:var(--border-w)] border-[var(--color-danger)] text-[var(--color-danger)] bg-transparent hover:bg-[var(--color-danger)] hover:text-[var(--color-bg)]',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        font-bold transition-colors cursor-pointer rounded-[var(--radius)]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
