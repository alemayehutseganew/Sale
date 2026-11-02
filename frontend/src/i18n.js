import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  en: {
    translation: {
      chooseStake: 'Please Choose Your Stake',
      stake: 'Stake',
      active: 'Active',
      possibleWin: 'Possible Win',
      join: 'Join',
      bonus: 'Bonus',
      none: 'None',
    },
  },
  am: {
    translation: {
      chooseStake: 'እባክዎ የጨዋታ ውለታዎን ይምረጡ',
      stake: 'ውለታ',
      active: 'ንቁ',
      possibleWin: 'ሊያሸንፍ የሚችለው',
      join: 'ይቀላቀሉ',
      bonus: 'ጉርሻ',
      none: 'None',
    },
  },
}

const savedLang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'en'

i18n.use(initReactI18next).init({
  resources,
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
