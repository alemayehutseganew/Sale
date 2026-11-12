import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../WalletContext'
import { fetchApi } from '../services/api'
import { useTranslation } from 'react-i18next'

export default function Wallet() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { balance, referralBalance, referralThreshold, loading, refreshBalance } = useWallet()
  const [user, setUser] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [userError, setUserError] = useState('')
  const [balanceError, setBalanceError] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [reference, setReference] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState(100)
  const [phoneNumber, setPhoneNumber] = useState('')

  const token = localStorage.getItem('token')
  const userId = user?.id || localStorage.getItem('dbUserId')

  const loadUser = async () => {
    try {
      const res = await fetchApi('/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      }
      setUserError('')
    } catch (err) {
      console.error('Failed to load user:', err)
      setUserError('Connection slow. Please refresh.')
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('dbUserId')) {
      navigate('/')
    }
  }, [navigate])

  useEffect(() => {
    loadUser()
  }, [token])

  useEffect(() => {
    const refreshWalletBalance = () => {
      refreshBalance()
        .then(() => setBalanceError(''))
        .catch((err) => {
          console.error('Failed to refresh wallet balance:', err)
          setBalanceError('Connection slow. Please refresh.')
        })
    }
    refreshWalletBalance()
    const onFocus = refreshWalletBalance
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshBalance])

  const deposit = async () => {
    setSubmitting(true)
    setMessage('')
    setMessageType('')
    try {
      const res = await fetchApi('/wallet/deposit', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({ amount: Number(depositAmount), reference }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(t('depositVerified'))
        setMessageType('success')
        loadUser()
        refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
      } else {
        setMessage(data.error || t('verificationFailed'))
        setMessageType('error')
      }
    } catch (e) {
      setMessage(t('networkError'))
      setMessageType('error')
    } finally {
      setSubmitting(false)
    }
  }

  const withdraw = async (source = 'wallet') => {
    setSubmitting(true)
    setMessage('')
    setMessageType('')
    try {
      const res = await fetchApi('/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(withdrawAmount), provider: 'telebirr', phoneNumber, source }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message || t('withdrawalSubmitted'))
        setMessageType('success')
        loadUser()
        refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
      } else {
        setMessage(data.error || t('withdrawalFailed'))
        setMessageType('error')
      }
    } catch (e) {
      setMessage(t('networkError'))
      setMessageType('error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white placeholder-slate-400 shadow-inner focus:border-blue-500 focus:outline-none"

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-4 text-white">
      <header className="mx-auto mb-5 flex max-w-2xl items-center gap-3 rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 shadow-2xl backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="min-h-11 rounded-xl border border-slate-600 bg-slate-700 px-4 font-bold text-white shadow-[0_3px_0_rgb(30,41,59)] transition-all active:translate-y-1 active:shadow-none"
        >
          ← {t('back')}
        </button>
        <h1 className="text-xl font-black text-white sm:text-2xl">{t('wallet')}</h1>
      </header>
      {(userError || balanceError) && (
        <p role="alert" className="mx-auto mb-4 max-w-2xl text-center text-red-300">
          {userError || balanceError}
        </p>
      )}

      {/* Balance Cards */}
      <div className="relative mx-auto mb-4 max-w-2xl overflow-hidden rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-6 text-center shadow-[0_0_30px_rgba(59,130,246,0.15)] backdrop-blur-lg">
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 to-emerald-400" />
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">{t('playable_balance')}</p>
        <h2 className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-4xl font-black text-transparent drop-shadow-[0_0_15px_rgba(52,211,153,0.4)] sm:text-5xl">
          {Number(balance).toFixed(2)} <span className="text-2xl">ETB</span>
        </h2>
        <p className="mt-1 text-xs text-slate-400">{t('withdraw_anytime')}</p>
      </div>

      <div className="relative mx-auto mb-4 max-w-2xl overflow-hidden rounded-3xl border border-purple-400/30 bg-gradient-to-br from-purple-950/80 via-slate-900/90 to-slate-900/90 p-6 shadow-[0_0_30px_rgba(168,85,247,0.15)] backdrop-blur-lg">
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-purple-500 to-fuchsia-400" />
        <p className="text-sm font-bold uppercase tracking-widest text-purple-200">{t('agent_balance')}</p>
        <div className="flex justify-between items-end mt-1">
          <span className="text-2xl font-black text-white">{Number(referralBalance).toFixed(2)} ETB</span>
          <span className="text-sm text-slate-400">/ {referralThreshold} ETB</span>
        </div>
        <div
          className="mt-3 h-2.5 w-full rounded-full bg-slate-950"
          role="progressbar"
          aria-label={t('agent_balance')}
          aria-valuemin={0}
          aria-valuemax={referralThreshold}
          aria-valuenow={Math.min(Math.max(referralBalance, 0), referralThreshold)}
        >
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400 shadow-[0_0_12px_rgba(192,132,252,0.45)]"
            style={{ width: `${Math.min(Math.max((referralBalance / referralThreshold) * 100, 0), 100)}%` }}
          />
        </div>
        {referralBalance >= referralThreshold ? (
          <button
            onClick={() => withdraw('referral')}
            disabled={loading || submitting}
            className="mt-3 min-h-11 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 py-3 font-bold text-white shadow-[0_5px_0_#14532d] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            {t('withdraw_agent_earnings')}
          </button>
        ) : (
          <p className="mt-2 text-xs text-amber-300">{t('locked_until_threshold')}</p>
        )}
      </div>

      {/* Manual Deposit */}
      <div className="mx-auto mb-4 max-w-2xl rounded-3xl border border-slate-600/50 bg-slate-800/60 p-5 shadow-xl backdrop-blur-lg sm:p-6">
        <h2 className="mb-3 text-lg font-bold">{t('manualDeposit')}</h2>
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-inner">
          <p className="mb-2 text-sm text-slate-300">{t('sendDepositToTelebirr')}</p>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/80 p-3 shadow-inner">
            <span className="text-2xl font-black text-yellow-400 tracking-wider">0991179163</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('0991179163');
                alert(t('numberCopied'));
              }}
              className="min-h-11 rounded-lg bg-gradient-to-b from-amber-300 to-yellow-500 px-4 text-sm font-bold text-slate-950 shadow-[0_3px_0_#92400e] transition-all active:translate-y-1 active:shadow-none"
            >
              {t('copy')}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">{t('accountName')} <strong>Saleamlak misganaw dagnaw</strong></p>
          <p className="text-xs text-slate-400">{t('afterSending')}</p>
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">{t('amountToDeposit')}</label>
          <input
            type="number"
            placeholder={t('exampleAmount')}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">{t('receiptReferenceId')}</label>
          <input
            type="text"
            placeholder={t('exampleReceipt')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          onClick={deposit}
          disabled={loading || submitting}
          className="mt-2 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3.5 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {t('verifyDeposit')}
        </button>
      </div>

      {/* Withdraw */}
      <div className="mx-auto mb-4 max-w-2xl rounded-3xl border border-slate-600/50 bg-slate-800/60 p-5 shadow-xl backdrop-blur-lg sm:p-6">
        <h2 className="mb-2 text-lg font-bold">{t('withdraw')}</h2>
        <p className="mb-2 text-sm text-slate-300">{t('minimumWithdrawal')}</p>
        <input
          type="number"
          placeholder={t('amount')}
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <input
          type="text"
          placeholder={t('phoneNumber')}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <button
          onClick={() => withdraw('wallet')}
          disabled={loading || submitting}
          className="mt-2 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3.5 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {t('withdraw')}
        </button>
      </div>

      {message && (
        <p className={`mx-auto mt-4 max-w-2xl text-center font-bold ${messageType === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
