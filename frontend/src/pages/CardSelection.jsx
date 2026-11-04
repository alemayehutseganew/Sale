import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApi } from '../services/api';

export default function CardSelection() {
  const [searchParams] = useSearchParams();
  const stake = searchParams.get('stake') || '10';
  const navigate = useNavigate();

  const [takenCards, setTakenCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTakenCards = async () => {
      try {
        const res = await fetchApi(`/rooms/active-cards?stake=${stake}`);
        if (res.ok) {
          const data = await res.json();
          setTakenCards(data.takenCards || []);
        }
      } catch (err) {
        console.error('Failed to fetch taken cards', err);
      }
    };
    fetchTakenCards();
  }, [stake]);

  const handleCardSelect = async (cardNumber) => {
    if (takenCards.includes(cardNumber)) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          stake: Number(stake),
          card_number: cardNumber,
          userId: localStorage.getItem('dbUserId'),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to join room');
      }

      navigate(`/game?roomId=${data.roomId}&stake=${stake}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      if (err.message.includes('taken')) {
        setTakenCards((prev) => [...prev, cardNumber]);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-yellow-500 hover:text-yellow-400 font-bold"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold">Select Card ({stake} ETB)</h1>
          <div className="w-12"></div>
        </div>

        {error && (
          <div className="bg-red-600 text-white p-3 rounded mb-4 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
            const isTaken = takenCards.includes(cardNumber);
            return (
              <button
                key={cardNumber}
                disabled={isTaken || loading}
                onClick={() => handleCardSelect(cardNumber)}
                className={`
                  py-3 rounded font-bold text-sm transition-all
                  ${isTaken
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
                  }
                `}
              >
                {cardNumber}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
