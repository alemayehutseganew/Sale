import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../services/api'

export default function CardSelection() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const stake = searchParams.get('stake') || '10'

  const [takenCards, setTakenCards] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetchApi(`/rooms/active-cards?stake=${encodeURIComponent(stake)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load taken cards')
        if (!cancelled) {
          setTakenCards(new Set(data.takenCards || []))
          setLoading(false)
        }
      } catch (e) {
        console.error('Failed to load taken cards', e)
        if (!cancelled) setError(e.message || 'Network error. Please try again.')
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [stake])

  const handleCardSelect = async (cardNumber) => {
    if (takenCards.has(cardNumber)) return
    setSelectedCard(cardNumber)
    const userId = localStorage.getItem('dbUserId')
    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake, userId, card_number: cardNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join room')
      localStorage.setItem('stake', stake)
      navigate(`/game?roomId=${data.roomId}&stake=${data.stake}`)
    } catch (e) {
      console.error('Failed to join room:', e)
      setError(e.message || 'Network error. Please try again.')
      setSelectedCard(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#112A46] text-white flex items-center justify-center">
        Loading available cards...

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



      <div className="grid grid-cols-20 gap-1 max-w-4xl mx-auto mb-8">
        {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
          const isTaken = takenCards.has(cardNumber)
          const isSelected = selectedCard === cardNumber
          return (
            <button
              key={cardNumber}
              onClick={() => handleCardSelect(cardNumber)}
              disabled={isTaken}
              className={`aspect-square flex items-center justify-center text-xs font-bold rounded transition-colors ${
                isTaken
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : isSelected
                    ? 'bg-yellow-400 text-[#112A46] shadow-lg'
                    : 'bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:text-yellow-400'
              }`}
            >
              {cardNumber}
            </button>
          )
        })}




   )</div>
}
