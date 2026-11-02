import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function GameHistory() {
  const navigate = useNavigate()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userId = localStorage.getItem('dbUserId') || localStorage.getItem('telegram_id') || 1
    fetch(`${API_BASE}/api/users/history?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((data) => setHistory(data.history || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white p-4">
      <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">← Back</button>
      <h1 className="text-2xl font-bold mb-4">Game History</h1>
      {loading ? (
        <p>Loading...</p>
      ) : history.length === 0 ? (
        <p>No history yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((h, i) => (
            <div
              key={i}
              className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 ${
                h.is_winner ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-red-500 bg-red-500/10 text-red-400'
              }`}
            >
              <div className="flex justify-between items-start">
                <span>Stake: {h.stake_amount}</span>
                <span className="text-sm status-badge">${
                  h.is_winner ? 'Won' : 'Lost'
                }</span>
              </div>
              <span>Date: {new Date(h.joined_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
