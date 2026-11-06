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
    en: {
      translation: {
        ...translations.en,
        playable_balance: 'Playable Balance',
        withdraw_anytime: 'Withdraw anytime',
        agent_balance: 'Agent Balance',
        locked_until_threshold: 'Locked until you reach 1,000 ETB',
        withdraw_agent_earnings: 'Withdraw Agent Earnings',
        agent_dashboard: 'Agent Dashboard',
        your_referral_link: 'Your Referral Link',
        copy_link: 'Copy Link',
        copy_bot_link: 'Copy Bot Link',
        share_telegram: 'Share to Telegram',
        share_to_group: 'Share to Group/Channel',
        tg_username: 'Telegram Username',
        no_tg_username_warning: 'Set a Telegram username in your Telegram settings to unlock custom links.',
        total_earned: 'Total Earned',
        invited_players: 'Invited Players',
        no_referrals_yet: "You haven't invited anyone yet.",
        link_copied: 'Referral link copied.',
        copy_link_failed: 'Unable to copy link.',
        telegram_share_text: 'Join me on YogaBingo and win big!',
        withdrawal_threshold: 'Withdrawal threshold',
        loading: 'Loading...',
        retry: 'Retry',
      },
    },
    am: {
      translation: {
        ...translations.am,
        playable_balance: 'ለጨዋታ የሚያገለግል ቀሪ ሂሳብ',
        withdraw_anytime: 'በማንኛውም ጊዜ ማውጣት ይችላሉ',
        agent_balance: 'የወኪል ቀሪ ሂሳብ',
        locked_until_threshold: 'እስከ 1,000 ብር እስኪደርስ ድረስ የተቆለፈ',
        withdraw_agent_earnings: 'የወኪል ገቢን ያውጡ',
        agent_dashboard: 'የወኪል ዳሽቦርድ',
        your_referral_link: 'የእርስዎ የግብዣ ሊንክ',
        copy_link: 'ሊንክ ቅዳ',
        copy_bot_link: 'የቦት ሊንክ ቅዳ',
        share_telegram: 'በቴሌግራም አጋራ',
        share_to_group: 'ለቡድን/ቻናል አጋራ',
        tg_username: 'የቴሌግራም መለያ',
        no_tg_username_warning: 'ብጁ ሊንክ ለማግኘት በቴሌግራም ቅንብሮችዎ ውስጥ የቴሌግራም መለያ ያዘጋጁ።',
        total_earned: 'ጠቅላላ ገቢ',
        invited_players: 'የጋበዟቸው ተጫዋቾች',
        no_referrals_yet: 'እስካሁን ማንንም አልጋበዙም።',
        link_copied: 'የግብዣ ሊንኩ ተቀድቷል።',
        copy_link_failed: 'ሊንኩን መቅዳት አልተቻለም።',
        telegram_share_text: 'በYogaBingo አብረን እንጫወት እና ትልቅ ሽልማት እናሸንፍ!',
        withdrawal_threshold: 'የማውጣት ገደብ',
        loading: 'በመጫን ላይ...',
        retry: 'እንደገና ይሞክሩ',
      },
    },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
