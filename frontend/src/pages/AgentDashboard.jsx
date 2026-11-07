import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../services/api'
import ReferralPromo from '../components/ReferralPromo'

const REFERRAL_THRESHOLD = 1000

export default function AgentDashboard() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [dashboard, setDashboard] = useState(null)
  const [telegramUser, setTelegramUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const referralLink = useMemo(() => {
    if (!telegramUser) return ''
    const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'GoBingoBot').replace(/^@/, '')
    const referralRef = String(telegramUser.telegram_id)
    return `https://t.me/${botUsername}?start=${encodeURIComponent(referralRef)}`
  }, [telegramUser])

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/')
      return null
    }

    const headers = { Authorization: `Bearer ${token}` }
    const [referralsResponse, profileResponse] = await Promise.all([
      fetchApi('/users/referrals', { headers }),
      fetchApi('/me', { headers }),
    ])
    const [referrals, profile] = await Promise.all([
      referralsResponse.json(),
      profileResponse.json(),
    ])
    if (!referralsResponse.ok) {
      throw new Error(referrals.error || 'Unable to load referral information.')
    }
    if (!profileResponse.ok) {
      throw new Error(profile.error || 'Unable to load Telegram profile.')
    }
    return { referrals, profile }
  }, [navigate])

  useEffect(() => {
    let active = true
    loadDashboard()
      .then((data) => {
        if (active && data) {
          setDashboard(data.referrals)
          setTelegramUser(data.profile)
        }
      })
      .catch((err) => {
        console.error('Failed to load agent dashboard:', err)
        if (active) setError(err.message || 'Unable to load referral information.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadDashboard])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setNotice(t('link_copied'))
    } catch (err) {
      console.error('Failed to copy referral link:', err)
      setNotice(t('copy_link_failed'))
    }
  }

  const shareToGroup = async () => {
    const telegram = window.Telegram?.WebApp
    if (telegram && typeof telegram.switchInlineQuery === 'function') {
      const referralRef = String(telegramUser.telegram_id)
      telegram.switchInlineQuery(`start=${referralRef}`, ['groups', 'channels', 'users'])
      return
    }
    await copyLink()
  }

  const referralBalance = Number(dashboard?.referral_balance || 0)
  const threshold = Number(dashboard?.referral_threshold || REFERRAL_THRESHOLD)
  const progress = threshold > 0
    ? Math.min(Math.max((referralBalance / threshold) * 100, 0), 100)
    : 0
  const referredUsers = dashboard?.referred_users || []

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">
          ← {t('back')}
        </button>
        <h1 className="text-2xl font-bold mb-4">{t('agent_dashboard')}</h1>
        <ReferralPromo />

        {loading ? (
          <p className="text-center text-gray-300 py-8">{t('loading')}</p>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-4 text-red-200">
            <p>{error}</p>
            <button
              onClick={() => {
                setLoading(true)
                setError('')
                loadDashboard()
                  .then((data) => {
                    if (data) {
                      setDashboard(data.referrals)
                      setTelegramUser(data.profile)
                    }
                  })
                  .catch((err) => {
                    console.error('Failed to load agent dashboard:', err)
                    setError(err.message || 'Unable to load referral information.')
                  })
                  .finally(() => setLoading(false))
              }}
              className="mt-3 font-bold text-white underline"
            >
              {t('retry')}
            </button>
          </div>
        ) : (
          <>
            <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-4">
              <h2 className="text-sm text-gray-300 font-bold mb-3">{t('your_referral_link')}</h2>
              <p className="text-sm text-white mb-3">
                {t('tg_username')}: <span className="font-bold text-yellow-300">
                  {telegramUser?.username ? `@${telegramUser.username}` : telegramUser?.telegram_id}
                </span>
              </p>
              {!telegramUser?.username && (
                <p className="text-xs text-yellow-400 mb-3">{t('no_tg_username_warning')}</p>
              )}
              <p className="break-all bg-black/20 rounded-lg p-3 text-sm text-yellow-300">
                {referralLink}
              </p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={copyLink}
                  className="bg-yellow-500 text-[#0f2027] font-bold py-2 rounded-lg"
                >
                  {t('copy_bot_link')}
                </button>
                <button
                  onClick={shareToGroup}
                  className="bg-sky-600 text-white font-bold py-2 rounded-lg"
                >
                  {t('share_to_group')}
                </button>
              </div>
              {notice && <p className="text-xs text-green-300 mt-3">{notice}</p>}
            </section>

            <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-4">
              <h2 className="text-sm text-gray-300 font-bold">{t('total_earned')}</h2>
              <p className="text-3xl font-black text-green-300 mt-1">
                ETB {Number(dashboard.total_earned || 0).toFixed(2)}
              </p>
            </section>

            <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-end">
                <h2 className="text-sm text-gray-300 font-bold">{t('agent_balance')}</h2>
                <span className="text-xs text-gray-400">{t('withdrawal_threshold')}</span>
              </div>
              <p className="text-xl font-black mt-2">
                ETB {referralBalance.toFixed(2)} <span className="text-gray-400 text-sm">/ {threshold} ETB</span>
              </p>
              <div
                className="w-full bg-gray-900 rounded-full h-2.5 mt-3"
                role="progressbar"
                aria-label={t('agent_balance')}
                aria-valuemin={0}
                aria-valuemax={threshold}
                aria-valuenow={Math.min(Math.max(referralBalance, 0), threshold)}
              >
                <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </section>

            <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h2 className="text-lg font-bold mb-3">{t('invited_players')}</h2>
              {referredUsers.length === 0 ? (
                <p className="text-sm text-gray-400">{t('no_referrals_yet')}</p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {referredUsers.map((user) => (
                    <li key={user.id} className="py-3 flex justify-between gap-3">
                      <span className="font-medium">{user.name}</span>
                      <time className="text-xs text-gray-400 shrink-0">
                        {user.joined_at
                          ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(user.joined_at))
                          : ''}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
