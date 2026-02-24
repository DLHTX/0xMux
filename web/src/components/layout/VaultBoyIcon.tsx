/** Pixel-art Vault Boy (thumbs-up) — purely inline SVG, no external assets. */
export function VaultBoyIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Head */}
      <rect x="13" y="4" width="6" height="5" fill="currentColor" />
      {/* Hair */}
      <rect x="12" y="2" width="8" height="3" fill="currentColor" />
      <rect x="14" y="1" width="4" height="2" fill="currentColor" />
      {/* Body */}
      <rect x="14" y="9" width="4" height="7" fill="currentColor" />
      {/* Left arm */}
      <rect x="9" y="9" width="5" height="2" fill="currentColor" />
      <rect x="8" y="10" width="2" height="4" fill="currentColor" />
      {/* Right arm + thumbs up */}
      <rect x="18" y="9" width="5" height="2" fill="currentColor" />
      <rect x="22" y="4" width="2" height="7" fill="currentColor" />
      <rect x="21" y="3" width="4" height="2" fill="currentColor" />
      {/* Legs */}
      <rect x="14" y="16" width="2" height="5" fill="currentColor" />
      <rect x="17" y="16" width="2" height="5" fill="currentColor" />
      {/* Feet */}
      <rect x="13" y="20" width="3" height="2" fill="currentColor" />
      <rect x="17" y="20" width="3" height="2" fill="currentColor" />
      {/* Terminal prompt at bottom */}
      <rect x="4" y="26" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="8" y="26" width="16" height="2" fill="currentColor" opacity="0.35" />
      <rect x="26" y="26" width="2" height="2" fill="currentColor" opacity="0.8" />
    </svg>
  )
}
