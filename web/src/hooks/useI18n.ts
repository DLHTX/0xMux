import { createContext, useContext, useState, useCallback, createElement, type ReactNode } from 'react'
import { type Locale, type MessageKey, getMessage, getInitialLocale, saveLocale } from '../lib/i18n'

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    saveLocale(l)
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
  }, [])

  const t = useCallback((key: MessageKey, params?: Record<string, string | number>) => {
    return getMessage(locale, key, params)
  }, [locale])

  return createElement(
    I18nContext.Provider,
    { value: { locale, setLocale, t } },
    children,
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
