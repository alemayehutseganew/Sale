import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translations } from './translations'

let savedLang = 'en'
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('lang') === 'am') {
    savedLang = 'am'
  }
} catch {
  savedLang = 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: translations.en },
    am: { translation: translations.am },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
