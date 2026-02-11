interface LogoProps {
  onClick?: () => void
}

export function Logo({ onClick }: LogoProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0 cursor-pointer bg-transparent border-none p-0 select-none"
      aria-label="0xMux Home"
    >
      <img
        src="/logo-small.png"
        alt="0xMux"
        className="h-6 w-auto object-contain"
      />
    </button>
  )
}
