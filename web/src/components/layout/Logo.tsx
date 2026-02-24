import { useTheme } from '../../hooks/useTheme'
import { VaultBoyIcon } from './VaultBoyIcon'

interface LogoProps {
  onClick?: () => void
  className?: string
}

export function Logo({ onClick, className }: LogoProps) {
  const { preset } = useTheme()
  const isPipboy = preset === 'pipboy'

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 cursor-pointer bg-transparent border-none p-0 select-none ${className ?? ''}`}
      aria-label="0xMux Home"
    >
      {isPipboy ? (
        <>
          <VaultBoyIcon size={22} className="text-[var(--color-primary)]" />
          <span
            className="text-sm font-bold tracking-wider text-[var(--color-primary)]"
            style={{ fontFamily: 'var(--font-heading)', textShadow: '0 0 6px rgba(27,255,128,0.5)' }}
          >
            0xMux
          </span>
        </>
      ) : (
        <img
          src="/logo-small.png"
          alt="0xMux"
          className="h-6 w-auto object-contain"
        />
      )}
    </button>
  )
}
