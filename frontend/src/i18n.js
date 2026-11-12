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
        promo_title: '🎉 Invite & Earn with YogaBingo!',
        promo_subtitle: 'Share your link and earn 5% of the winnings from every player you invite!',
        promo_how_it_works: '🏆 How it works:',
        promo_step_1: '1. Share your unique link in Telegram groups/channels.',
        promo_step_2: '2. Your friends join and play the game.',
        promo_step_3: '3. When they win, you get 5% of their prize!',
        promo_threshold_note: '💰 Withdraw your earnings once you reach 1,000 ETB!',
        promo_cta: 'Start Inviting Now',
        wellPlayed: 'Well Played!',
        resultEncouragement: 'Thank you for playing. There is always another round.',
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
        promo_title: '🎉 በዮጋቢንጎ ይጋብዙ እና ያግቡ!',
        promo_subtitle: 'ሊንክዎን በማጋራት ከሚጋብዙት ተጫዋች ከሚያሸንፈው ገንዘብ 5% ያግኙ!',
        promo_how_it_works: '🏆 እንዴት ይሰራል?',
        promo_step_1: '1. ልዩ ሊንክዎን በቴሌግራም ቡድኖች/ቻናሎች ያጋሩ።',
        promo_step_2: '2. ጓደኞችዎ ይቀላቀላሉ እና ይጫወታሉ።',
        promo_step_3: '3. ሲያሸንፉ የሽልማቱን 5% ያገኛሉ!',
        promo_threshold_note: '💰 የወኪል ቀሪ ሂሳብዎ 1,000 ብር ሲደርስ ማውጣት ይችላሉ!',
        promo_cta: 'አሁን መጋበዝ ይጀምሩ',
        wellPlayed: 'ጥሩ ተጫውተዋል!',
        resultEncouragement: 'ስለተጫወቱ እናመሰግናለን። ሁልጊዜ ሌላ ዙር አለ።',
      },
    },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
