import { useState } from 'react'
import { Icon } from '@iconify/react'
import { IconSettings } from '../../lib/icons'
import type { ConnectionStatus } from '../../lib/types'
import { ThemeConfigurator } from '../settings/ThemeConfigurator'
import { Logo } from './Logo'

interface HeaderProps {
  connectionStatus: ConnectionStatus
  onSettingsClick?: () => void
  onLogoClick?: () => void
}

export function Header({ connectionStatus, onSettingsClick, onLogoClick }: HeaderProps) {
  const [showConfig, setShowConfig] = useState(false)

  const statusConfig: Record<ConnectionStatus, { dotClass: string; label: string }> = {
    connected: { dotClass: 'bg-[var(--color-success)]', label: 'Connected' },
    connecting: { dotClass: 'bg-[var(--color-warning)]', label: 'Connecting' },
    disconnected: { dotClass: 'bg-[var(--color-danger)]', label: 'Offline' },
  }

  const status = statusConfig[connectionStatus]

  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick()
    } else {
      setShowConfig(true)
    }
  }

  return (
    <>
      <header
        className="flex items-center justify-between px-3 md:px-4 border-b-[length:var(--border-w)] border-[var(--color-border)] bg-[var(--color-bg)] shrink-0 h-10 md:h-12"
      >
        {/* Left: Logo */}
        <Logo onClick={onLogoClick} />

        {/* Right: status + settings */}
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${status.dotClass}`} />
            <span className="text-[10px] font-bold text-[var(--color-fg-muted)]">
              {status.label}
            </span>
          </div>

          {/* Settings button */}
          <button
            onClick={handleSettingsClick}
            className="w-8 h-8 flex items-center justify-center border-[length:var(--border-w)] border-[var(--color-border)]
              rounded-[var(--radius)] transition-colors cursor-pointer
              hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)] hover:border-[var(--color-primary)]"
            aria-label="Settings"
          >
            <Icon icon={IconSettings} width={16} height={16} />
          </button>
        </div>
      </header>

      <ThemeConfigurator open={showConfig} onClose={() => setShowConfig(false)} />
    </>
  )
}
