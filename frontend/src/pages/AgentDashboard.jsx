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
      if (referralsResponse.status === 404) {
        throw new Error('Failed to load referral data')
      }
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
    <div className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-4 text-white">
      <div className="mx-auto max-w-lg">
        <header className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 shadow-2xl backdrop-blur-lg">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="min-h-11 rounded-xl border border-slate-600 bg-slate-700 px-4 font-bold text-white shadow-[0_3px_0_rgb(30,41,59)] transition-all active:translate-y-1 active:shadow-none"
          >
            ← {t('back')}
          </button>
          <h1 className="text-xl font-black text-white sm:text-2xl">{t('agent_dashboard')}</h1>
        </header>
        <div className="mb-5 overflow-hidden rounded-2xl border border-purple-400/30 bg-gradient-to-r from-purple-600/90 to-indigo-600/90 p-1 shadow-[0_0_25px_rgba(168,85,247,0.3)] backdrop-blur-md [&>section]:mb-0 [&>section]:rounded-2xl [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-4 [&>section]:shadow-none">
          <ReferralPromo />
        </div>

        {loading ? (
          <p id="agent-referral-content" className="py-8 text-center text-slate-300">{t('loading')}</p>
        ) : error ? (
          <div id="agent-referral-content" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200 backdrop-blur-md">
            <p>{error}</p>
            <button
              type="button"
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
              className="mt-3 min-h-11 font-bold text-white underline"
            >
              {t('retry')}
            </button>
          </div>
        ) : (
          <>
            <section id="agent-referral-content" className="mb-5 rounded-2xl border border-indigo-500/30 bg-indigo-900/40 p-5 shadow-[0_0_20px_rgba(99,102,241,0.2)] backdrop-blur-lg">
              <h2 className="mb-3 text-sm font-bold text-indigo-200">{t('your_referral_link')}</h2>
              <p className="mb-3 text-sm text-white">
                {t('tg_username')}: <span className="font-bold text-yellow-300">
                  {telegramUser?.username ? `@${telegramUser.username}` : telegramUser?.telegram_id}
                </span>
              </p>
              {!telegramUser?.username && (
                <p className="mb-3 text-xs text-yellow-300">{t('no_tg_username_warning')}</p>
              )}
              <p className="mb-3 break-all rounded-lg border border-slate-700 bg-slate-900/80 p-3 font-mono text-xs text-slate-300">
                {referralLink}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={copyLink}
                  className="min-h-11 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-[0_4px_0_#312e81] transition-all active:translate-y-1 active:shadow-none"
                >
                  {t('copy_bot_link')}
                </button>
                <button
                  type="button"
                  onClick={shareToGroup}
                  className="min-h-11 rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-xs font-bold text-white shadow-[0_4px_0_#0c4a6e] transition-all active:translate-y-1 active:shadow-none"
                >
                  {t('share_to_group')}
                </button>
              </div>
              {notice && <p role="status" className="mt-3 text-xs text-emerald-300">{notice}</p>}
            </section>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <section className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('total_earned')}</h2>
                <p className="mt-2 text-xl font-black text-emerald-400 sm:text-2xl">
                  {Number(dashboard.total_earned || 0).toFixed(2)} <span className="text-sm">ETB</span>
                </p>
              </section>

              <section className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('agent_balance')}</h2>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  {referralBalance.toFixed(2)} <span className="text-sm">ETB</span>
                </p>
                <p className="mt-1 text-[10px] text-slate-500">{t('withdrawal_threshold')}: {threshold} ETB</p>
                <div
                  className="mt-3 h-2.5 w-full rounded-full bg-slate-950"
                  role="progressbar"
                  aria-label={t('agent_balance')}
                  aria-valuemin={0}
                  aria-valuemax={threshold}
                  aria-valuenow={Math.min(Math.max(referralBalance, 0), threshold)}
                >
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]" style={{ width: `${progress}%` }} />
                </div>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/60 shadow-lg backdrop-blur-md">
              <div className="border-b border-slate-700/50 p-4">
                <h2 className="font-bold text-white">{t('invited_players')}</h2>
              </div>
              {referredUsers.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">{t('no_referrals_yet')}</p>
              ) : (
                <ul className="max-h-60 divide-y divide-slate-700/50 overflow-y-auto">
                  {referredUsers.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 p-4">
                      <span className="text-sm font-medium text-slate-300">{user.name}</span>
                      <time className="shrink-0 text-xs text-slate-500">
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
