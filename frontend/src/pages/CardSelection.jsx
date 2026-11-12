import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApi } from '../services/api';
import SocketService from '../services/socket';
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
  const [, setPlayersCount] = useState(0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const roomId = searchParams.get('roomId');

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

  useEffect(() => {
    const userId = localStorage.getItem('dbUserId');
    if (!userId) return undefined;

    const socket = SocketService.get() || SocketService.connect();
    if (!socket.connected) socket.connect();
    const redirectToGame = () => {
      const gameParams = new URLSearchParams({ roomId, stake });
      navigate(`/game?${gameParams.toString()}`);
    };
    const handleRoomUpdate = (data) => {
      const status = String(data?.status || '').toUpperCase();
      if (['COUNTDOWN', 'PLAYING', 'CLAIMING', 'COMPLETED', 'ENDED'].includes(status)) {
        redirectToGame();
      }
    };
    const handleCountdown = (data) => {
      const timeLeft = Number(data?.timeLeft ?? data?.seconds);
      if (Number.isFinite(timeLeft)) redirectToGame();
    };
    const handleJoin = () => {
      if (roomId) socket.emit('join_room', { roomId, userId, stake });
    };
    const handlePlayersUpdated = (data) => {
      if (Number.isFinite(Number(data?.count))) setPlayersCount(Number(data.count));
    };

    socket.on('players_updated', handlePlayersUpdated);
    socket.on('room_update', handleRoomUpdate);
    socket.on('room_updated', handleRoomUpdate);
    socket.on('game_starting_countdown', redirectToGame);
    socket.on('countdown_tick', handleCountdown);
    socket.on('game_started', redirectToGame);
    socket.on('game_in_progress', redirectToGame);

    if (socket.connected) handleJoin();
    else socket.on('connect', handleJoin);

    return () => {
      socket.off('connect', handleJoin);
      socket.off('players_updated', handlePlayersUpdated);
      socket.off('room_update', handleRoomUpdate);
      socket.off('room_updated', handleRoomUpdate);
      socket.off('game_starting_countdown', redirectToGame);
      socket.off('countdown_tick', handleCountdown);
      socket.off('game_started', redirectToGame);
      socket.off('game_in_progress', redirectToGame);
    };
  }, [navigate, roomId, stake]);

  const handleCardSelect = async () => {
    unlockAudio();
    if (!selectedCard || takenCards.includes(selectedCard)) return;

    setLoading(true);
    setError('');
    let responseRoomId = roomId;

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
      responseRoomId = responseRoomId || data.roomId;

      if (!res.ok) {
        throw new Error(data.error || t('failedToJoinRoom'));
      }

      if (data.status === 'spectator') {
        navigate(`/game?roomId=${data.roomId}&stake=${stake}&spectator=true`);
        return;
      }

      const socket = SocketService.get() || SocketService.connect();
      socket.emit('join_room', {
        roomId: data.roomId,
        userId: localStorage.getItem('dbUserId'),
        stake: Number(stake),
      });

      localStorage.setItem('activeGameRoom', JSON.stringify({
        roomId: data.roomId,
        stake: Number(stake),
        cardNumber: data.card?.id || selectedCard,
      }));
      navigate(`/game?roomId=${data.roomId}&stake=${stake}`);
    } catch (err) {
      if (/started|in progress|already playing|cannot join/i.test(err.message)) {
        const gameParams = new URLSearchParams({ stake });
        if (responseRoomId) gameParams.set('roomId', responseRoomId);
        navigate(`/game?${gameParams.toString()}`);
        return;
      }

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

          <div className="mx-auto grid max-w-lg grid-cols-6 gap-1 p-2 pb-4">
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
                  className={`relative flex h-7 min-w-0 touch-manipulation select-none items-center justify-center rounded-lg border px-1 text-[11px] font-bold transition-all duration-100 sm:h-8 ${
                    isSelected
                      ? 'scale-[0.96] border-blue-900 bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-[inset_0_4px_8px_rgba(0,0,0,0.4)]'
                      : isTaken
                        ? 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600 opacity-60 shadow-[inset_0_3px_6px_rgba(0,0,0,0.65)]'
                        : 'border-slate-300 bg-white text-slate-800 shadow-[0_4px_0_rgb(148,163,184)] hover:-translate-y-0.5 hover:shadow-[0_5px_0_rgb(148,163,184)] active:translate-y-1 active:shadow-none'
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
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-600/50 bg-slate-800/80 p-2 text-slate-100 shadow-xl backdrop-blur-md">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-red-500" />
          <div className="mb-1.5 mt-0.5 text-center text-[10px] font-bold text-slate-300 sm:text-xs">
            {selectedCard ? `Card No. ${selectedCard}` : 'Select Card'}
          </div>
          {previewMatrix ? (
            <div className="grid flex-1 content-start grid-cols-5 gap-0.5">
              {['B', 'I', 'N', 'G', 'O'].map((letter, index) => {
                const gradients = [
                  'from-blue-500 to-blue-700',
                  'from-red-500 to-red-700',
                  'from-purple-500 to-purple-700',
                  'from-green-500 to-green-700',
                  'from-yellow-400 to-yellow-600',
                ];
                return (
                  <div key={letter} className={`rounded-t-sm bg-gradient-to-b ${gradients[index]} py-0.5 text-center text-[9px] font-black text-white shadow-sm`}>
                    {letter}
                  </div>
                );
              })}
              {previewMatrix.flat().map((number, index) => (
                <div key={index} className={`flex items-center justify-center rounded-sm text-[9px] font-bold ${
                  index === 12 || number === 'FREE'
                    ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]'
                    : 'bg-slate-100 text-slate-800 shadow-[0_2px_0_rgb(148,163,184)]'
                }`}>
                  {index === 12 ? 'F' : number}
                </div>
              ))}
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center text-center text-[10px] text-slate-500">
              Select a number from the grid
            </p>
          )}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-3 text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
          <div className="mb-1 flex items-center gap-2">
            <span className="relative flex h-5 w-5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200 sm:text-xs">
              Confirm your card
            </p>
          </div>
          <p className="mb-1 text-[9px] text-slate-400">
            {selectedCard ? `Card No. ${selectedCard} selected` : 'Choose a card to join'}
          </p>
          <button
            type="button"
            disabled={!selectedCard || takenCards.includes(selectedCard) || loading}
            onClick={handleCardSelect}
            className="min-h-11 w-full rounded-lg border border-blue-400/40 border-b-4 border-b-blue-800 bg-gradient-to-b from-blue-500 to-blue-700 px-2 py-1 text-xs font-bold text-white shadow-[0_3px_0_rgb(30,64,175)] transition-all active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {loading ? t('loadingCard') : 'Join game'}
          </button>
          {loading && (
            <span className="absolute bottom-1 text-[9px] text-blue-300 animate-pulse">
              Processing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
