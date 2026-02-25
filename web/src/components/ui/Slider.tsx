interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  className?: string
  title?: string
}

export function Slider({ value, min, max, step, onChange, className = '', title }: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`floating-opacity-slider ${className}`}
      title={title}
    />
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}

export function SliderRow({ label, value, min, max, step, display, onChange }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-fg-muted)] w-14 shrink-0">{label}</span>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} className="flex-1" />
      <span className="text-xs font-bold w-10 text-right">{display}</span>
    </div>
  )
}
