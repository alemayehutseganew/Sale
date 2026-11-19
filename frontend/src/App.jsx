import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import CardSelection from './pages/CardSelection'
import GameScreen from './pages/GameScreen'
import Wallet from './pages/Wallet'
import Settings from './pages/Settings'
import GameHistory from './pages/GameHistory'
import Leaderboard from './pages/Leaderboard'
import AgentDashboard from './pages/AgentDashboard'
import { LanguageProvider } from './LanguageContext'
import { WalletProvider } from './WalletContext'
import SocketService from './services/socket'
import { fetchApi } from './services/api'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminUsers from './admin/AdminUsers'
import AdminGames from './admin/AdminGames'
import AdminPayments from './admin/AdminPayments'


export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

function getActiveGamePath() {
  const activeRoomData = localStorage.getItem('activeGameRoom')
  if (!activeRoomData) return null

  try {
    const { roomId, stake } = JSON.parse(activeRoomData)
    if (!roomId) {
      localStorage.removeItem('activeGameRoom')
      return null
    }

    const parsedStake = Number(stake)
    const gameParams = new URLSearchParams({
      roomId: String(roomId),
      stake: String(Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 10),
      spectator: 'false',
    })
    return `/game?${gameParams.toString()}`
  } catch (err) {
    console.error('[App] Failed to parse active game data', err)
    localStorage.removeItem('activeGameRoom')
    return null
  }
}

function AppRoutes() {
  const navigate = useNavigate()

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready()
    tg?.expand()

    const initData = tg?.initData || ''
    if (!initData) {
      const activeGamePath = getActiveGamePath()
      if (activeGamePath) navigate(activeGamePath, { replace: true })
      return
    }

    const referralRef = new URLSearchParams(window.location.search).get('ref')
      || tg?.initDataUnsafe?.start_param
    fetchApi('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, ...(referralRef ? { referralRef } : {}) }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem('token', data.token)
          localStorage.setItem('dbUserId', data.user.id)
          localStorage.setItem('walletBalance', data.user.wallet_balance)
          SocketService.connect(data.token)
          window.dispatchEvent(new Event('wallet-refresh'))

          // Auto-resume: if there's an active game in localStorage, go straight to game screen
          const activeGamePath = getActiveGamePath()
          if (activeGamePath) {
            navigate(activeGamePath, { replace: true })
            return
          }

          // No active game, default to card selection
          const stake = new URLSearchParams(window.location.search).get('stake') || '10'
          navigate(`/select-card?stake=${encodeURIComponent(stake)}`, { replace: true })
        }
      })
      .catch((err) => console.error('[ERROR] Telegram login failed:', err))
  }, [navigate])

  useEffect(() => {
    const socket = SocketService.get() || SocketService.connect()
    const clearActiveRoom = () => {
      const activeRoomData = localStorage.getItem('activeGameRoom')
      if (activeRoomData) {
        try {
          const { roomId } = JSON.parse(activeRoomData)
          if (roomId) localStorage.removeItem(`marked_${roomId}`)
        } catch (err) {
          console.error('[App] Failed to clear saved game marks', err)
        }
      }
      localStorage.removeItem('activeGameRoom')
    }
    socket.on('game_over', clearActiveRoom)
    socket.on('game_ended_for_spectators', clearActiveRoom)
    socket.on('room_reset', clearActiveRoom)
    socket.on('game_aborted', clearActiveRoom)

    return () => {
      socket.off('game_over', clearActiveRoom)
      socket.off('game_ended_for_spectators', clearActiveRoom)
      socket.off('room_reset', clearActiveRoom)
      socket.off('game_aborted', clearActiveRoom)
    }
  }, [])

  return (
    <LanguageProvider>
      <WalletProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/select-card?stake=10" replace />} />
          <Route path="/card-selection" element={<CardSelection />} />
          <Route path="/select-card" element={<CardSelection />} />
          <Route path="/select-cards" element={<CardSelection />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<GameHistory />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/agent" element={<AgentDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={localStorage.getItem('adminToken') ? <AdminLayout /> : <Navigate to="/admin/login" />}
          >
            <Route index element={<Navigate to="dashboard" />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="games" element={<AdminGames />} />
            <Route path="payments" element={<AdminPayments />} />
          </Route>
        </Routes>
      </WalletProvider>
    </LanguageProvider>
  )
}
