interface LogoProps {
  onClick?: () => void
}

export function Logo({ onClick }: LogoProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0 cursor-pointer bg-transparent border-none p-0 select-none"
      style={{ fontFamily: 'var(--font-heading)' }}
      aria-label="0xMux Home"
    >
      <span className="text-[10px] font-bold text-[var(--color-fg-muted)] tracking-tight leading-none mr-0.5">
        0x
      </span>
      <span className="text-lg font-bold tracking-tight leading-none text-[var(--color-fg)]">
        Mux
      </span>
    </button>
  )
}
