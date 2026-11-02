import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import i18n from './i18n'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('lang') || 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    i18n.changeLanguage(lang)
  }, [lang])

  const changeLanguage = useCallback((newLang) => {
    setLang(newLang)
    try {
      localStorage.setItem('lang', newLang)
    } catch {}
    i18n.changeLanguage(newLang)
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
