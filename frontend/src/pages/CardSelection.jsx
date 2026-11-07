import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApi } from '../services/api';
import { unlockAudio } from '../utils/bingoSounds';
import { useTranslation } from 'react-i18next';

const generateCardPreview = (cardNumber) => {
  let seed = ((cardNumber || 1) * 16807 + 12345) % 2147483647;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const columns = ranges.map(([min, max]) => {
    const numbers = new Set();
    while (numbers.size < 5) {
      numbers.add(Math.floor(rng() * (max - min + 1)) + min);
    }
    return [...numbers];
  });

  return Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) =>
      row === 2 && column === 2 ? 'FREE' : columns[column][row],
    ),
  );
};

export default function CardSelection() {
  const [searchParams] = useSearchParams();
  const stake = searchParams.get('stake') || '10';
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [takenCards, setTakenCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
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

  const handleCardSelect = async () => {
    unlockAudio();
    if (!selectedCard || takenCards.includes(selectedCard)) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          stake: Number(stake),
          card_number: selectedCard,
          userId: localStorage.getItem('dbUserId'),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('failedToJoinRoom'));
      }

      if (data.status === 'spectator') {
        navigate(`/game?roomId=${data.roomId}&stake=${stake}&spectator=true`);
        return;
      }

      navigate(`/game?roomId=${data.roomId}&stake=${stake}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      if (err.message.includes('taken')) {
        setTakenCards((prev) => [...prev, selectedCard]);
      }
    }
  };

  const previewMatrix = selectedCard ? generateCardPreview(selectedCard) : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0f172a] text-white">
      <div className="flex-1 overflow-y-auto p-4 pb-32">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              onClick={() => navigate('/')}
              className="shrink-0 font-bold text-yellow-500 hover:text-yellow-400"
            >
              ← {t('back')}
            </button>
            <h1 className="text-center text-xl font-bold sm:text-2xl">{t('selectCard', { stake })}</h1>
            <span className="w-10 shrink-0" />
          </div>

          {error && (
            <div className="mb-3 rounded bg-red-600 p-3 text-center text-white">
              {error}
            </div>
          )}

          <div className="grid grid-cols-6 gap-2 pb-4 sm:grid-cols-8 md:grid-cols-10">
            {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
              const isTaken = takenCards.includes(cardNumber);
              const isSelected = selectedCard === cardNumber;
              return (
                <button
                  key={cardNumber}
                  type="button"
                  disabled={isTaken || loading}
                  aria-pressed={isSelected}
                  onClick={() => {
                    unlockAudio();
                    setSelectedCard(cardNumber);
                    setError('');
                  }}
                  className={`flex min-h-10 items-center justify-center rounded-lg border-b-4 py-2 text-sm font-bold transition-all ${
                    isSelected
                      ? 'border-blue-300 bg-blue-600 text-white ring-2 ring-blue-300'
                      : isTaken
                        ? 'cursor-not-allowed border-gray-900 bg-gray-800 text-gray-600 opacity-60'
                        : 'border-gray-300 bg-white text-black shadow-md hover:-translate-y-0.5 hover:shadow-lg active:translate-y-1'
                  }`}
                >
                  {cardNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex h-28 gap-2 border-t border-gray-700 bg-[#0f172a] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3">
        <div className="flex min-h-0 flex-1 flex-col justify-center rounded-xl bg-white p-1.5 text-gray-900">
          <div className="mb-0.5 text-center text-[10px] font-bold">
            {selectedCard ? `Card ${selectedCard}` : 'Card preview'}
          </div>
          {previewMatrix ? (
            <div className="grid grid-cols-5 gap-px">
              {previewMatrix.flat().map((number, index) => (
                <span
                  key={index}
                  className={`flex h-3.5 items-center justify-center rounded text-[8px] font-bold sm:h-4 sm:text-[10px] ${
                    index === 12 ? 'bg-blue-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  {index === 12 ? 'F' : number}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-gray-500">Choose a card</p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-blue-900/50 p-1.5 text-center">
          <p className="mb-1 text-[10px] text-blue-100">Confirm your card</p>
          <button
            type="button"
            disabled={!selectedCard || takenCards.includes(selectedCard) || loading}
            onClick={handleCardSelect}
            className="w-full rounded-lg bg-blue-500 px-2 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {loading ? t('loadingCard') : 'Join game'}
          </button>
        </div>
      </div>
    </div>
  );
}
