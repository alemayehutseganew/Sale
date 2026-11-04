import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../services/api'

export default function Leaderboard() {
  const navigate = useNavigate()
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchApi('/users/leaderboard')
      .then((r) => (r.ok ? r.json() : { leaders: [] }))
      .then((data) => setLeaders(data.leaders || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white p-4">
      <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">← Back</button>
      <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>
      {loading ? (
        <p>Loading...</p>
      ) : leaders.length === 0 ? (
        <p>No leaders yet.</p>
      ) : (
        <div className="space-y-4">
          {leaders.map((l, i) => (
            <div
              key={i}
              className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 ${
                i === 0 ? 'border-yellow-400 bg-yellow-400/10' : i === 1 ? 'border-gray-300 bg-gray-300/10' : i === 2 ? 'border-orange-400 bg-orange-400/10' : ''
              }`}
              style={{ position: 'relative' }}
            >
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-yellow-400 text-[#0f2027]' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : ''
                }`}
              >
                {i + 1}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : ''
                }">
                  {i + 1}. {l.first_name || 'Player'}
                </span>
                <span className="text-lg ${
                  i === 0 ? 'text-yellow-300' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-300' : ''
                }">
                  {l.wallet_balance} ETB
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
