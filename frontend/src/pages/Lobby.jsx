import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../LanguageContext'
import { fetchApi } from '../services/api'
import { useWallet } from '../WalletContext'
import SocketService from '../services/socket'
import ReferralPromo from '../components/ReferralPromo'

const stakes = [10, 50, 100]

export default function Lobby() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { changeLanguage } = useLanguage()
  const { balance: walletBalance, refreshBalance } = useWallet()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [balanceError, setBalanceError] = useState('')
  const [roomError, setRoomError] = useState('')

  const toggleLanguage = () => {
    changeLanguage(i18n.language === 'en' ? 'am' : 'en')
  }

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

  useEffect(() => {
    const savedRoom = localStorage.getItem('activeGameRoom')
    if (!savedRoom) return

    let activeRoom
    try {
      activeRoom = JSON.parse(savedRoom)
    } catch (err) {
      console.error('Failed to read saved active room:', err)
      localStorage.removeItem('activeGameRoom')
      return
    }

    const userId = localStorage.getItem('dbUserId')
    const stake = Number(activeRoom?.stake)
    const cardNumber = Number(activeRoom?.cardNumber)
    if (
      !userId ||
      !activeRoom?.roomId ||
      !Number.isFinite(stake) ||
      stake <= 0 ||
      !Number.isInteger(cardNumber) ||
      cardNumber < 1 ||
      cardNumber > 400
    ) {
      localStorage.removeItem('activeGameRoom')
      return
    }

    let cancelled = false
    const resumeActiveRoom = async () => {
      try {
        const query = new URLSearchParams({ userId })
        const response = await fetchApi(
          `/rooms/${encodeURIComponent(activeRoom.roomId)}/my-cards?${query.toString()}`,
          { cache: 'no-store' },
        )

        if (cancelled) return
        setRoomError('')
        if (response.ok) {
          const data = await response.json()
          if (!Array.isArray(data.cards) || data.cards.length === 0) {
            localStorage.removeItem('activeGameRoom')
            return
          }

          const gameParams = new URLSearchParams({
            roomId: activeRoom.roomId,
            stake: String(stake),
          })
          navigate(`/game?${gameParams.toString()}`, { replace: true })
          return
        }

        if (response.status === 404) {
          localStorage.removeItem('activeGameRoom')
          return
        }

        if (response.status === 403) {
          const [cardsResponse, roomsResponse] = await Promise.all([
            fetchApi(`/rooms/active-cards?stake=${encodeURIComponent(stake)}`, { cache: 'no-store' }),
            fetchApi('/rooms', { cache: 'no-store' }),
          ])
          if (!cardsResponse.ok) {
            throw new Error(`Failed to check active room cards: ${cardsResponse.status}`)
          }
          if (!roomsResponse.ok) {
            throw new Error(`Failed to check waiting rooms: ${roomsResponse.status}`)
          }

          const activeCards = await cardsResponse.json()
          if (!Array.isArray(activeCards.takenCards) || activeCards.takenCards.length === 0) {
            localStorage.removeItem('activeGameRoom')
            return
          }

          const waitingRoomsData = await roomsResponse.json()
          if (!Array.isArray(waitingRoomsData.rooms)) {
            throw new Error('Waiting rooms response was invalid.')
          }
          const waitingRoomsForStake = waitingRoomsData.rooms.filter(
            (room) => Number(room.stake_amount) === stake,
          )
          const savedRoomIsWaiting = waitingRoomsForStake.some(
            (room) => String(room.id) === String(activeRoom.roomId),
          )
          const canRejoinWaitingRoom = savedRoomIsWaiting && waitingRoomsForStake.length === 1
          const canWatchActiveGame = waitingRoomsForStake.length === 0
          if (!canRejoinWaitingRoom && !canWatchActiveGame) {
            localStorage.removeItem('activeGameRoom')
            return
          }

          const joinResponse = await fetchApi('/rooms/join', {
            method: 'POST',
            body: JSON.stringify({
              stake,
              card_number: cardNumber,
              userId,
            }),
          })
          const joinedRoom = await joinResponse.json()
          if (cancelled) return
          if (!joinResponse.ok) {
            localStorage.removeItem('activeGameRoom')
            console.error('Failed to rejoin active room:', joinedRoom.error || joinResponse.status)
            return
          }

          if (joinedRoom.status === 'spectator') {
            localStorage.removeItem('activeGameRoom')
            const gameParams = new URLSearchParams({
              roomId: joinedRoom.roomId,
              stake: String(joinedRoom.stake || stake),
              spectator: 'true',
            })
            navigate(`/game?${gameParams.toString()}`, { replace: true })
            return
          }

          if (!joinedRoom.roomId) {
            throw new Error('Active room join response did not include a room ID.')
          }
          localStorage.setItem('activeGameRoom', JSON.stringify({
            roomId: joinedRoom.roomId,
            stake,
            cardNumber: joinedRoom.card?.id || cardNumber,
          }))
          const gameParams = new URLSearchParams({
            roomId: joinedRoom.roomId,
            stake: String(stake),
          })
          navigate(`/game?${gameParams.toString()}`, { replace: true })
          return
        }

        throw new Error(`Failed to verify saved room: ${response.status}`)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to resume active room:', err)
          setRoomError('Connection slow. Please refresh.')
        }
      }
    }

    resumeActiveRoom()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleJoin = async (stake) => {
    // Navigate to card selection instead of calling join directly
    const sanitizedStake = stake && stake > 0 ? stake : 10
    navigate(`/select-card?stake=${sanitizedStake}`)
  }

  const handleLogout = () => {
    localStorage.clear()
    SocketService.connect(null)
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.close()
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* Decorative background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-yellow-500/20 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Top Navigation Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-4">
        <button 
          onClick={() => setIsMenuOpen(true)}
          className="p-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 hover:bg-white/20 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleLanguage}
            className="px-3 py-1.5 bg-white/10 backdrop-blur-md text-white text-xs font-bold rounded-full border border-white/10 hover:bg-white/20 transition-all"
          >
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <div 
            onClick={() => navigate('/wallet')}
            className="flex items-center gap-2 bg-white text-[#0f2027] rounded-full px-4 py-1.5 font-extrabold shadow-lg shadow-yellow-500/20 cursor-pointer hover:scale-105 transition-transform"
          >
            <span className="text-green-600 text-lg">₿</span>
            <span>ETB {walletBalance.toFixed(2)}</span>
          </div>
        </div>
      </div>
      {(balanceError || roomError) && (
        <p role="alert" className="relative z-10 px-4 text-center text-red-300">
          {balanceError || roomError}
        </p>
      )}

      {/* Header */}
      <div className="relative z-10 text-center mt-6 mb-10 px-4">
        <h1 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 drop-shadow-lg">
          GOBINGO
        </h1>
        <p className="text-gray-400 font-medium mt-2 tracking-widest uppercase text-xs">
          {t('playWinRepeat')}
        </p>
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <ReferralPromo />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 px-4 pb-10">
        <h2 className="text-center text-xl font-bold text-white mb-6">
          {t('chooseStake')}
        </h2>

        <div className="flex flex-col gap-4 max-w-md mx-auto">
          {stakes.map((stake, idx) => (
            <div 
              key={stake} 
              className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl hover:bg-white/10 transition-all group overflow-hidden"
            >
              

              {/* Left side: Stake Value */}
              <div className="flex flex-col">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">{t('stake')}</span>
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
                  {stake} <span className="text-sm">ETB</span>
                </span>
              </div>

              {/* Right side: Join Button */}
              <button
                onClick={() => handleJoin(stake)}
                className="bg-gradient-to-r from-yellow-400 to-orange-500 text-[#0f2027] font-black text-lg px-6 py-3 rounded-xl shadow-lg shadow-orange-500/30 group-hover:scale-105 active:scale-95 transition-all"
              >
                {t('join')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Decorative Element */}
      <div className="relative z-10 text-center pb-6">
        <p className="text-xs text-gray-500">{t('poweredBy')}</p>
      </div>

      {/* Slide-out Menu Drawer */}
      {isMenuOpen && (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex" onClick={() => setIsMenuOpen(false)}>
    <div 
      className="w-72 bg-gradient-to-b from-[#0f2027] to-[#203a43] h-full p-6 flex flex-col shadow-2xl border-r border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">GOBINGO</h2>
          <p className="text-xs text-gray-400 mt-1">{t('playerMenu')}</p>
        </div>
        <button onClick={() => setIsMenuOpen(false)} className="text-white text-3xl hover:text-yellow-400 transition-colors">&times;</button>
      </div>

      {/* Profile Snapshot */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 mb-6 border border-white/10">
        <p className="text-xs text-gray-400 uppercase font-bold">{t('walletBalance')}</p>
        <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
          ETB {walletBalance.toFixed(2)}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2">
        <button onClick={() => { setIsMenuOpen(false); navigate('/wallet'); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">💰</span> 
          <span>{t('myWallet')}</span>
        </button>
        <button onClick={() => { setIsMenuOpen(false); navigate('/agent'); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">🤝</span>
          <span>{t('agent_dashboard')}</span>
        </button>
        <button onClick={() => { setIsMenuOpen(false); setHelpOpen(true); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">❓</span> 
          <span>{t('helpRules')}</span>
        </button>
      </nav>

      {/* Logout at bottom */}
      <div className="mt-auto pt-6 border-t border-white/10">
        <button onClick={handleLogout} className="w-full bg-red-600/20 text-red-400 border border-red-600/30 font-bold py-3 rounded-xl hover:bg-red-600 hover:text-white transition-all">
          {t('logout')}
        </button>
      </div>
    </div>
  </div>
)}

      {/* Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setHelpOpen(false)}>
          <div 
            className="bg-[#0f2027] p-6 rounded-2xl max-w-sm w-full border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('helpRules')}</h2>
            <p className="text-white text-sm whitespace-pre-wrap">{t('helpInstructions')}</p>
            <button onClick={() => setHelpOpen(false)} className="mt-6 w-full bg-yellow-500 text-[#0f2027] font-bold py-3 rounded-xl">{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  )
}