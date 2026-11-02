import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Lobby from './pages/Lobby'
import CardSelection from './pages/CardSelection'
import GameScreen from './pages/GameScreen'
import Wallet from './pages/Wallet'
import Settings from './pages/Settings'
import GameHistory from './pages/GameHistory'
import Leaderboard from './pages/Leaderboard'
import { LanguageProvider } from './LanguageContext'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminUsers from './admin/AdminUsers'
import AdminGames from './admin/AdminGames'
import AdminPayments from './admin/AdminPayments'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
console.log("🚀 API URL:", import.meta.env.VITE_API_URL)

export default function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready()
    tg?.expand()

    const initData = tg?.initData || ''
    if (!initData) return

    fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem('token', data.token)
          localStorage.setItem('dbUserId', data.user.id)
          localStorage.setItem('walletBalance', data.user.wallet_balance)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/card-selection" element={<CardSelection />} />
          <Route path="/select-cards" element={<CardSelection />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<GameHistory />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
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
      </BrowserRouter>
    </LanguageProvider>
  )
}

