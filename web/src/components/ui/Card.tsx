import type { ReactNode, HTMLAttributes } from 'react'

type Variant = 'solid' | 'dashed'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  children: ReactNode
}

export function Card({ variant = 'solid', children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        border-[length:var(--border-w)] p-4 transition-colors rounded-[var(--radius)]
        ${variant === 'dashed' ? 'border-dashed border-[var(--color-border-light)]' : 'border-[var(--color-border-light)]'}
        hover:border-[var(--color-border)]
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-sm font-extrabold mb-2 ${className}`}>{children}</h3>
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-xs text-[var(--color-fg-muted)] ${className}`}>{children}</div>
}
