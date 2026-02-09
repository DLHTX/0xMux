import { useState, type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (id: string) => void
}

export function Tabs({ tabs, defaultTab, onChange }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id ?? '')

  const handleClick = (id: string) => {
    setActive(id)
    onChange?.(id)
  }

  const current = tabs.find((t) => t.id === active)

  return (
    <div>
      <div className="flex border-b-[length:var(--border-w)] border-[var(--color-border)] gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleClick(tab.id)}
            className={`
              px-4 py-2 text-sm font-bold transition-colors -mb-[var(--border-w)] border-b-[length:var(--border-w)] cursor-pointer
              ${
                tab.id === active
                  ? 'border-[var(--color-border)] text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current && <div className="pt-4">{current.content}</div>}
    </div>
  )
}
