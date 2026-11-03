import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function CardSelection() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const roomId = searchParams.get('roomId')
  const stake = searchParams.get('stake') || '10'

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId) {
      navigate('/')
      return
    }
    let cancelled = false
    async function load() {
      try {
        const userId = localStorage.getItem('dbUserId')
        const res = await fetch(`${API_BASE}/api/rooms/${roomId}/cards?userId=${encodeURIComponent(userId || '')}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load cards')
        if (!cancelled) setCards(data || [])
      } catch (e) {
        console.error('Failed to load cards', e)
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [roomId, navigate])

  const handleCardSelect = async (cardId) => {
    const userId = Number(localStorage.getItem('dbUserId'))
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomId}/select-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cardIds: [cardId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save selected cards')
    } catch (e) {
      console.error('Failed to select card:', e)
      setError(e.message || 'Network error. Please try again.')
      return
    }
    localStorage.setItem('stake', stake)
    navigate(`/game?stake=${stake}&roomId=${roomId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#112A46] text-white flex items-center justify-center">
        Loading cards...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#112A46] text-white px-4 py-4 pb-24">
      {error && <p role="alert" className="mb-3 text-center text-red-300">{error}</p>}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">{stake} Birr Per Card</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="bg-white text-[#112A46] text-xs font-bold px-2 py-1 rounded">
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button className="text-yellow-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-2 mb-4">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => handleCardSelect(card.id)}
            className="bingo-3d-box aspect-square flex items-center justify-center text-sm font-bold transition-colors text-[#112A46]"
          >
            {card.card_number}
          </button>
        ))}
      </div>
    </div>
  )
}
