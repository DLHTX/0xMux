export type PasswordStrength = 'weak' | 'medium' | 'strong'

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) {
    return 'weak'
  }

  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)

  const strengthScore =
    (hasLower ? 1 : 0) +
    (hasUpper ? 1 : 0) +
    (hasNumber ? 1 : 0) +
    (hasSpecial ? 1 : 0)

  if (password.length >= 12 && strengthScore >= 3) {
    return 'strong'
  }

  if (password.length >= 8 && (hasNumber || hasSpecial)) {
    return 'medium'
  }

  return 'weak'
}

export function getStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'var(--color-danger)'
    case 'medium':
      return 'var(--color-warning)'
    case 'strong':
      return 'var(--color-success)'
  }
}

export function getStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return '弱'
    case 'medium':
      return '中'
    case 'strong':
      return '强'
  }
}
