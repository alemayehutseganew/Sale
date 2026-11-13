import { useEffect, useRef, useState, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../LanguageContext';
import SocketService from '../services/socket';
import { fetchApi } from '../services/api';
import { toggleVoice, playNumberAudio, unlockAudio } from '../utils/bingoSounds';
import { useWallet } from '../WalletContext';

const serverMessageKeys = {
  'You do not have enough balance. Please deposit funds.': 'insufficientFunds',
  'Server error. Game cancelled.': 'gameCancelled',
  'Your card was not assigned. Please select a card for the next round.': 'cardNotAssigned',
  'This game has ended. Please wait for the next round.': 'gameEndedWait',
  'A game is in progress. Please wait for the next round.': 'gameInProgressWait',
  'Join the room before playing.': 'joinBeforePlaying',
  'Server error': 'serverError',
  'The game is not currently active.': 'gameNotActive',
  'You have already claimed Bingo!': 'bingoAlreadyClaimed',
  'Only players in this game can claim Bingo.': 'bingoOnlyPlayers',
  'Card not found.': 'cardNotFound',
  'Not a valid Bingo. Keep playing!': 'bingoInvalid',
  'Server error during validation.': 'bingoValidationError'
};

const getBallColor = (letter) => {
  switch(letter) {
    case 'B': return 'bg-blue-700 border-blue-900';
    case 'I': return 'bg-red-600 border-red-800';
    case 'N': return 'bg-purple-600 border-purple-800';
    case 'G': return 'bg-green-600 border-green-800';
    case 'O': return 'bg-yellow-500 border-yellow-700';
    default: return 'bg-gray-500 border-gray-700';
  }
};

const getBallGradient = (letter) => {
  switch (letter) {
    case 'B': return 'from-blue-400 to-blue-800';
    case 'I': return 'from-red-400 to-red-800';
    case 'N': return 'from-purple-400 to-purple-800';
    case 'G': return 'from-green-400 to-green-800';
    case 'O': return 'from-yellow-400 to-orange-600';
    default: return 'from-gray-400 to-gray-700';
  }
};

const getLetterGradient = (letter) => {
  switch (letter) {
    case 'B': return 'from-blue-600 to-blue-800';
    case 'I': return 'from-red-600 to-red-800';
    case 'N': return 'from-purple-600 to-purple-800';
    case 'G': return 'from-green-600 to-green-800';
    case 'O': return 'from-yellow-500 to-yellow-700';
    default: return 'from-slate-600 to-slate-800';
  }
};

const getLetterForNumber = (number) => {
  if (number <= 15) return 'B';
  if (number <= 30) return 'I';
  if (number <= 45) return 'N';
  if (number <= 60) return 'G';
  return 'O';
};

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const GameScreen = () => {
  const socket = SocketService.get() || SocketService.connect()
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('roomId') || 'room_10';
  const stake = parseInt(searchParams.get('stake')) || 10;
  const spectatorFromUrl = searchParams.get('spectator') === 'true';
  const userId = localStorage.getItem('dbUserId');
  const { t, i18n } = useTranslation();
  const { changeLanguage } = useLanguage();
  const { balance } = useWallet();
  const translationRef = useRef(t);
  const noWinnerRoundRef = useRef(false);
  useEffect(() => {
    translationRef.current = t;
  }, [t]);
  const translate = (key, options) => translationRef.current(key, options);
  const translateServerMessage = (message) => {
    const key = serverMessageKeys[message];
    return key ? translate(key) : message;
  };

  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentBall, setCurrentBall] = useState(null);
  const [calledHistory, setCalledHistory] = useState([]);
  const [markedNumbers, setMarkedNumbers] = useState([]);
  const [cardsData, setCardsData] = useState([]);
  const [takenCards, setTakenCards] = useState([]);
  const [cardChangeLoading, setCardChangeLoading] = useState(false);
  const [cardSelectionError, setCardSelectionError] = useState('');
  const [playerCount, setPlayerCount] = useState(0);
  const playersCount = playerCount;
  const [readyPlayers, setReadyPlayers] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const isSpectator = spectatorFromUrl;
  const [spectatorNumbers, setSpectatorNumbers] = useState([]);
  const [spectatorBall, setSpectatorBall] = useState(null);
  const [bingoMessage, setBingoMessage] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const handleFirstTap = () => {
      unlockAudio();
      document.removeEventListener('touchstart', handleFirstTap);
      document.removeEventListener('click', handleFirstTap);
    };
    document.addEventListener('touchstart', handleFirstTap, { once: true });
    document.addEventListener('click', handleFirstTap, { once: true });
    return () => {
      document.removeEventListener('touchstart', handleFirstTap);
      document.removeEventListener('click', handleFirstTap);
    };
  }, []);

  useEffect(() => {
    toggleVoice(true);
    return () => toggleVoice(false);
  }, []);

  const handleToggleVoice = () => {
    const enabled = isMuted;
    toggleVoice(enabled);
    setIsMuted(!enabled);
  };

  useEffect(() => {
    if (!userId) return;

    const handleJoin = () => {
      socket.emit('join_room', { roomId, userId, stake, spectator: isSpectator });
    };

    socket.on('room_update', (data) => {
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
      if (Number.isFinite(Number(data.readyPlayers))) setReadyPlayers(Number(data.readyPlayers));
    });
    socket.on('players_updated', (data) => {
      if (Number.isFinite(Number(data.count))) setPlayerCount(Number(data.count));
    });
    socket.on('game_in_progress', (data) => {
      setCardsData([]);
      setMarkedNumbers([]);
      setGameStarted(false);
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
      if (!isSpectator) {
        navigate(`/game?roomId=${encodeURIComponent(roomId)}&stake=${stake}&spectator=true`, { replace: true });
        return;
      }
    });
    socket.on('spectator_sync', (data) => {
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayerCount(Number(data.players));
    });
    socket.on('insufficient_funds', (data) => {
      alert(`💰 ${translateServerMessage(data.message)}`);
      window.location.href = '/wallet';
    });
    socket.on('game_aborted', (data) => {
      alert(`⚠️ ${translateServerMessage(data.message)}`);
      window.location.href = '/';
    });
    socket.on('countdown_tick', (data) => {
      const timeLeft = data.timeLeft ?? data.seconds ?? null;
      const parsedTimeLeft = timeLeft === null ? null : Number(timeLeft);
      setCountdown(Number.isFinite(parsedTimeLeft) ? parsedTimeLeft : null);
    });
    socket.on('my_cards', (data) => {
      if (!isSpectator && data.cards && data.cards.length > 0) setCardsData(data.cards);
    });
    socket.on('game_started', () => {
      setCountdown(null);
      setGameStarted(true);
    });
    socket.on('new_number_called', (data) => {
      const ball = data.ball || `${data.letter}-${data.number}`;
      const [ballLetter, ballNumber] = ball.split('-');
      const number = Number(data.number ?? ballNumber);
      const letter = data.letter || ballLetter;
      if (!Number.isFinite(number) || !letter) return;
      playNumberAudio(letter, number);

      setCurrentBall({ number, letter });
      setCalledNumbers(data.calledNumbers || (prev => (
        prev.includes(number) ? prev : [...prev, number]
      )));
      if (isSpectator) {
        setSpectatorBall({ number, letter });
        setSpectatorNumbers(data.calledNumbers || (prev => (
          prev.includes(number) ? prev : [...prev, number]
        )));
      } else {
        setCalledHistory(prev => [...prev.slice(-4), { number, letter }]);
      }
    });
    socket.on('game_over', (data) => {
      const myId = String(userId);
      const isWinner = data.winnerIds?.some(id => String(id) === myId);
      if (isSpectator) {
        setGameResult({
          type: 'loss',
          title: translate('gameOver'),
          message: translate('winnerIs', { name: data.winnerName || translate('player') }),
        });
        return;
      }

      if (isWinner) {
        setGameResult({ type: 'win', title: translate('congratulations'), message: translate('youWon', { amount: Number(data.payout).toFixed(2) }) });
      } else {
        setGameResult({ type: 'loss', title: translate('gameOver'), message: translate('winnerIs', { name: data.winnerName || translate('player') }) });
      }
      setTimeout(() => { setGameResult(null); navigate('/'); }, 5000);
    });
    socket.on('game_ended_for_spectators', (data) => {
      if (data?.noWinner) {
        noWinnerRoundRef.current = true;
        setGameResult({
          type: 'loss',
          title: translate('gameOver'),
          message: translate('noWinner'),
        });
        return;
      }

      if (!isSpectator) return

      setGameResult((current) => current || {
        type: 'loss',
        title: translate('gameOver'),
        message: translate('roundEnded'),
      });
    });
    socket.on('next_game_ready', (data) => {
      if (!isSpectator) return
      setGameResult(null);
      setSpectatorNumbers([]);
      setSpectatorBall(null);
      navigate(`/select-card?stake=${data.stake || stake}`);
    });
    socket.on('room_reset', (data) => {
      if (!isSpectator && !noWinnerRoundRef.current) return
      setGameResult(null);
      setSpectatorNumbers([]);
      setSpectatorBall(null);
      navigate(`/select-card?stake=${data.stake || stake}`);
    });
    socket.on('bingo_result', (data) => {
      setBingoMessage({ ...data, message: translateServerMessage(data.message) });
      setTimeout(() => setBingoMessage(null), 4000);
    });
    socket.on('bingo_invalid', (data) => {
      setBingoMessage({ success: false, message: data.message });
      setTimeout(() => setBingoMessage(null), 4000);
    });

    if (socket.connected) handleJoin();
    else socket.on('connect', handleJoin);

    return () => {
      socket.off('connect', handleJoin);
      socket.off('room_update');
      socket.off('players_updated');
      socket.off('game_in_progress');
      socket.off('spectator_sync');
      socket.off('insufficient_funds');
      socket.off('game_aborted');
      socket.off('countdown_tick');
      socket.off('my_cards');
      socket.off('game_started');
      socket.off('new_number_called');
      socket.off('game_over');
      socket.off('game_ended_for_spectators');
      socket.off('next_game_ready');
      socket.off('room_reset');
      socket.off('bingo_result');
      socket.off('bingo_invalid');
    };
  }, [socket, roomId, userId, stake, isSpectator, navigate]);

  useEffect(() => {
    if (isSpectator || gameStarted) return;

    const fetchTakenCards = async () => {
      try {
        const res = await fetchApi(`/rooms/active-cards?stake=${stake}`);
        if (!res.ok) throw new Error('Failed to fetch active cards');
        const data = await res.json();
        setTakenCards(data.takenCards || []);
      } catch (err) {
        console.error('Failed to fetch active cards', err);
        setCardSelectionError(err.message);
      }
    };

    fetchTakenCards();
  }, [stake, isSpectator, gameStarted]);

  const handleCardChange = async (cardNumber) => {
    const currentCardId = Number(cardsData[0]?.id || cardsData[0]?.cardId);
    if (gameStarted || countdown === 0 || cardChangeLoading || cardNumber === currentCardId) return;

    setCardChangeLoading(true);
    setCardSelectionError('');
    try {
      const res = await fetchApi('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          stake,
          roomId,
          card_number: cardNumber,
          userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change card');

      setCardsData([data.card]);
      setTakenCards((prev) => [...prev.filter((id) => id !== currentCardId), cardNumber]);
    } catch (err) {
      setCardSelectionError(err.message);
      if (err.message.toLowerCase().includes('taken')) {
        setTakenCards((prev) => [...new Set([...prev, cardNumber])]);
      }
    } finally {
      setCardChangeLoading(false);
    }
  };

  const handleDaub = (num) => {
    if (!calledNumbers.map(Number).includes(Number(num))) return;
    if (markedNumbers.map(Number).includes(Number(num))) return;
    setMarkedNumbers(prev => [...prev, Number(num)]);
  };

  const handleBingoClick = () => {
    if (!gameStarted || isSpectator) return;
    const cardId = cardsData[0]?.id || cardsData[0]?.cardId;
    if (!cardId) return;
    socket.emit('claim_bingo', { roomId, userId: localStorage.getItem('dbUserId'), cardId, markedNumbers });
  };

  const spectatorHistory = [...spectatorNumbers];
  if (
    spectatorBall &&
    Number(spectatorHistory[spectatorHistory.length - 1]) === Number(spectatorBall.number)
  ) {
    spectatorHistory.pop();
  }

  if (isSpectator) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-3 font-sans text-white">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-2.5 shadow-2xl backdrop-blur-lg">
            <div className="flex flex-wrap gap-2 text-xs font-bold sm:text-sm">
              <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
                <span className="text-slate-400">{t('win')}:</span><span className="text-emerald-400">--</span>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
                <span className="text-slate-400">{t('stake')}:</span><span className="text-blue-400">{stake || '--'}</span>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
                <span className="text-slate-400">{t('call')}:</span>
                <span className="text-amber-300">{spectatorBall ? `${spectatorBall.letter}-${spectatorBall.number}` : '--'}</span>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
                <span className="text-slate-400">{t('players')}:</span><span className="text-violet-300">{playersCount}</span>
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-700 px-3 text-xs font-bold text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all active:translate-y-1 active:shadow-none">
                {i18n.language === 'en' ? 'AM' : 'EN'}
              </button>
              <button
                type="button"
                aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
                onClick={handleToggleVoice}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
              >
                {isMuted ? '\u{1F507}' : '\u{1F50A}'}
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-blue-500 bg-blue-900/90 p-4 text-center shadow-lg">
            <p className="mb-1 text-lg font-bold">{t('pleaseWait')}</p>
            <p className="text-sm text-blue-200">{t('gameInProgress')}</p>
            <p className="mt-2 text-xs text-gray-400">({t('nextRoundHint')})</p>
          </div>

          <div className="rounded-2xl border border-slate-600/50 bg-slate-800/80 p-4 shadow-2xl sm:p-6">
            <div className="mb-5 flex flex-col items-center">
              {spectatorBall ? (
                <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.4)] sm:h-48 sm:w-48 ${getBallGradient(spectatorBall.letter)}`}>
                  <div className="pointer-events-none absolute left-4 top-2 h-1/4 w-2/3 -rotate-12 rounded-full bg-white/30 blur-md" />
                  <span className="z-10 text-5xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.6)] sm:text-6xl">{spectatorBall.letter}-{spectatorBall.number}</span>
                </div>
              ) : (
                <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.4)] sm:h-48 sm:w-48">
                  <span className="text-4xl font-black text-white">-</span>
                </div>
              )}
              <p className="mt-2 text-sm text-gray-300">{t('ballsCalled', { count: spectatorNumbers.length })}</p>
            </div>

            <div className="mb-4 flex min-h-11 flex-wrap justify-center gap-2">
              {spectatorHistory.slice(-5).reverse().map((num) => {
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-sm font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.6)] ${getBallColor(letter).split(' ')[0]}`}>
                    {num}
                  </div>
                );
              })}
            </div>

            <div className="grid max-h-80 grid-cols-5 gap-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/80 p-2 sm:grid-cols-10">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
                const isCalled = spectatorNumbers.includes(num);
                let letter = 'B';
                if (num > 15) letter = 'I';
                if (num > 30) letter = 'N';
                if (num > 45) letter = 'G';
                if (num > 60) letter = 'O';
                return (
                  <div key={num} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border-b-4 border-black/30 text-xs ${isCalled ? `${getBallColor(letter).split(' ')[0]} font-bold text-white shadow-md` : 'bg-slate-800 text-slate-500'}`}>
                    {num}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {gameResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-slate-600/50 bg-slate-800/90 p-7 text-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
              <div aria-hidden="true" className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-4xl shadow-inner">
                👏
              </div>
              <h2 className="mb-2 text-3xl font-black text-slate-100">{t('wellPlayed')}</h2>
              <p className="text-sm text-slate-300">{gameResult.message}</p>
              <p className="mt-3 text-sm text-slate-400">{t('resultEncouragement')}</p>
              <p className="mt-4 text-xs text-blue-200">{t('returningNextRound')}</p>
              <button
                type="button"
                onClick={() => { setGameResult(null); navigate('/'); }}
                className="mt-5 min-h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none"
              >
                {t('backToLobby')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!gameStarted) {
    const selectedCard = cardsData[0];
    const cardChangeLocked = gameStarted || countdown === 0;

    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0f172a] text-white">
        <div className="flex-1 overflow-y-auto p-4 pb-32">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold sm:text-2xl">{t('selectCard', { stake })}</h1>
              <span className="rounded bg-[#2A4B6E] px-3 py-1 text-xs font-bold">
                {t('players')}: {playersCount}
              </span>
            </div>
            {cardSelectionError && (
              <div className="mb-3 rounded bg-red-600 p-3 text-center text-sm text-white">
                {cardSelectionError}
              </div>
            )}
            <div className="grid grid-cols-5 gap-2 pb-4 sm:grid-cols-8 md:grid-cols-10">
              {Array.from({ length: 400 }, (_, i) => i + 1).map((cardNumber) => {
                const isSelected = Number(selectedCard?.id || selectedCard?.cardId) === cardNumber;
                const isTaken = takenCards.includes(cardNumber) && !isSelected;
                return (
                  <button
                    key={cardNumber}
                    type="button"
                    disabled={isTaken || cardChangeLoading || cardChangeLocked}
                    aria-pressed={isSelected}
                    onClick={() => handleCardChange(cardNumber)}
                    className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border-b-4 py-2 text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-blue-300 bg-blue-600 text-white ring-2 ring-blue-300'
                        : isTaken || cardChangeLocked
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
              {selectedCard ? `Card ${selectedCard.id || selectedCard.cardId}` : t('loadingCard')}
            </div>
            {selectedCard?.matrix ? (
              <div className="grid grid-cols-5 gap-px">
                {selectedCard.matrix.flat().map((number, index) => (
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
              <p className="text-center text-xs text-gray-500">{t('loadingCard')}</p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-blue-900/50 p-1.5 text-center">
            {playersCount < 2 ? (
              <>
                <p className="text-xs font-semibold text-blue-100">{t('waitingForPlayers')}</p>
                <span aria-hidden="true" className="mt-1 animate-pulse text-xs text-blue-200">•••</span>
              </>
            ) : countdown !== null ? (
              <>
                <p className="mb-0.5 text-[10px] text-blue-100">{t('gameStartsIn')}</p>
                <span className="font-mono text-2xl font-black text-white sm:text-3xl">{formatTime(countdown)}</span>
                <p className="mt-0.5 text-[10px] text-blue-100">
                  {cardChangeLocked ? t('waitingForGame') : t('getReady')}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold text-blue-100">{t('getReady')}</p>
            )}
            {cardChangeLoading && <span className="mt-0.5 text-[10px] text-blue-100">{t('loadingCard')}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-3 font-sans text-white">
      <div className="relative z-[60] mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-2.5 shadow-2xl backdrop-blur-lg">
        <div className="flex flex-wrap gap-2 text-xs font-bold sm:text-sm">
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
            <span className="text-slate-400">Win:</span><span className="text-emerald-400">{gameStarted ? '0' : '--'}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
            <span className="text-slate-400">Stake:</span><span className="text-blue-400">{stake || '--'}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
            <span className="text-slate-400">Call:</span><span className="text-amber-300">{gameStarted ? calledNumbers.length : '--'}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-inner">
            <span className="text-slate-400">Players:</span><span className="text-violet-300">{playersCount}</span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 shadow-inner">
            <span aria-hidden="true" className="text-sm text-yellow-400">💰</span>
            <span className="tabular-nums text-sm font-black text-white sm:text-base">
              {Number(balance || 0).toFixed(2)} <span className="text-[10px] font-bold text-slate-400">ETB</span>
            </span>
          </div>
          <button type="button" onClick={() => changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-700 px-3 text-xs font-bold text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none">
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button
            type="button"
            aria-label={isMuted ? t('unmuteSound') : t('muteSound')}
            onClick={handleToggleVoice}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-white shadow-[0_4px_0_rgb(51,65,85)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
          >
            {isMuted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        </div>
      </div>
      {playersCount >= 2 && countdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md animate-pulse rounded-3xl border border-white/15 bg-gradient-to-br from-indigo-900 to-blue-900 px-6 py-10 text-center shadow-2xl sm:px-12">
            <p className="mb-4 text-lg font-semibold text-blue-100 sm:text-xl">{t('gameStartsIn')}</p>
            <div className="font-mono text-6xl font-black text-white drop-shadow-lg sm:text-7xl">
              {formatTime(countdown)}
            </div>
            <p className="mt-4 text-base font-medium text-indigo-100 sm:text-lg">{t('getReady')}</p>
          </div>
        </div>
      )}
      {!gameStarted && countdown === null ? (
        <div className="flex-1 flex justify-center items-center text-gray-400">
          {t('pleaseWait')}
          <br />
          {t('waitingForPlayers')}
        </div>
      ) : (
        <>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex h-40 w-full shrink-0 items-center justify-center sm:h-48">
          {countdown !== null ? (
            <span className="text-7xl font-bold text-white">{formatTime(countdown)}</span>
          ) : currentBall ? (
            <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br shadow-[0_20px_40px_rgba(0,0,0,0.6),inset_0_-10px_20px_rgba(0,0,0,0.6),inset_0_10px_20px_rgba(255,255,255,0.4)] sm:h-48 sm:w-48 ${getBallGradient(currentBall.letter)}`}>
              <div className="pointer-events-none absolute left-4 top-2 h-1/4 w-2/3 -rotate-12 rounded-full bg-white/30 blur-md" />
              <span className="z-10 text-5xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.6)] sm:text-6xl">{currentBall.letter}-{currentBall.number}</span>
            </div>
          ) : (
            <span className="font-bold text-gray-400">{t('waitingForGame')}</span>
          )}
        </div>
        <div className="flex min-h-11 shrink-0 flex-wrap justify-center gap-2">
          {calledNumbers.slice(-10).map((num) => {
            const number = Number(num);
            const letter = calledHistory.find((ball) => Number(ball.number) === number)?.letter || getLetterForNumber(number);
            return (
              <div key={num} className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-sm font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.6)] ${getBallColor(letter).split(' ')[0]}`}>
                {num}
              </div>
            );
          })}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-2 min-[520px]:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-slate-600/50 bg-slate-800/80 p-1.5 shadow-xl">
            <div className="grid grid-cols-5 gap-1">
              {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                <div key={letter} className={`flex min-h-8 items-center justify-center rounded-md border-b-2 border-black/30 bg-gradient-to-b text-xs font-black text-white shadow-md ${getLetterGradient(letter)}`}>{letter}</div>
              ))}
            </div>
            <div className="grid max-h-[55vh] grid-cols-5 gap-1 overflow-y-auto pt-1">
              {Array.from({ length: 15 }, (_, rowIndex) => (
                <Fragment key={rowIndex}>
                  {[0, 1, 2, 3, 4].map((colIndex) => {
                    const num = rowIndex + 1 + (colIndex * 15);
                    const isCalled = calledNumbers.includes(num);
                    return (
                      <div key={num} className={`flex min-h-7 items-center justify-center rounded border-b-2 border-black/30 text-xs shadow-[0_3px_0_rgba(0,0,0,0.4)] ${isCalled ? 'bg-yellow-400 font-bold text-black' : 'bg-slate-700 text-white'}`}>{num}</div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-2 py-1">
            {cardsData && cardsData.length > 0 ? (
              <div className="w-full max-w-md rounded-xl border border-slate-600/50 bg-slate-800/80 p-1.5 shadow-xl">
                <div className="mb-1 text-center text-xs font-bold text-slate-300">{t('cardNo', { number: cardsData[0]?.id || '?' })}</div>
                <div className="mb-1 grid grid-cols-5 gap-1">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div key={letter} className={`flex min-h-8 items-center justify-center rounded-md border-b-2 border-black/30 bg-gradient-to-b text-xs font-black text-white shadow-md ${getLetterGradient(letter)}`}>{letter}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {cardsData[0]?.matrix?.flat().map((num, index) => {
                    const isFree = index === 12 || num === 'FREE';
                    const isMarked = isFree || markedNumbers.includes(num);
                    return (
                      <button key={index} type="button" onClick={() => !isFree && handleDaub(num)} className={`flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-lg text-xs font-bold transition-all duration-150 sm:text-sm ${isMarked ? 'scale-[0.98] border border-slate-700 bg-slate-900 text-blue-300 shadow-[inset_0_4px_8px_rgba(0,0,0,0.9)]' : 'border border-slate-300 bg-slate-100 text-slate-900 shadow-[0_3px_0_rgb(148,163,184)] active:translate-y-0.5 active:shadow-none'}`}>
                        {isFree ? 'F' : num}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-white text-center mt-10">{t('loadingCard')}</div>
            )}
            <button type="button" onClick={handleBingoClick} className="min-h-11 w-full max-w-sm rounded-lg border-b-4 border-amber-800 bg-gradient-to-b from-yellow-300 to-amber-500 py-2 text-lg font-extrabold text-[#112A46] shadow-[0_4px_0_rgba(120,53,15,0.8)] transition-all active:translate-y-1 active:shadow-none">{t('bingo')}</button>
          </div>
        </div>
      </div>
        </>
      )}

      {bingoMessage && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-xl shadow-2xl font-bold text-center z-50 ${bingoMessage.success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {bingoMessage.message}
        </div>
      )}

      {gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-slate-600/50 bg-slate-800/90 p-7 text-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            <div aria-hidden="true" className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full text-4xl ${gameResult.type === 'win' ? 'animate-bounce bg-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.6)]' : 'bg-slate-700 opacity-90 shadow-inner'}`}>
              {gameResult.type === 'win' ? '🏆' : '👏'}
            </div>
            <h2 className={`mb-2 text-3xl font-black ${gameResult.type === 'win' ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent' : 'text-slate-100'}`}>
              {gameResult.type === 'win' ? gameResult.title : t('wellPlayed')}
            </h2>
            <p className="mb-3 text-sm text-slate-300">{gameResult.message}</p>
            {gameResult.type !== 'win' && (
              <p className="mb-6 text-sm text-slate-400">{t('resultEncouragement')}</p>
            )}
            <button
              type="button"
              onClick={() => { setGameResult(null); navigate('/'); }}
              className="min-h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none"
            >
              {t('backToLobby')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
