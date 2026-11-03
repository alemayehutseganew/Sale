import { useEffect, useState, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SocketService from '../services/socket';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

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

const GameScreen = () => {
  const socket = SocketService.get() || SocketService.connect()
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('roomId') || 'room_10';
  const stake = parseInt(searchParams.get('stake')) || 10;
  const userId = localStorage.getItem('dbUserId');
  const { i18n } = useTranslation();

  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentBall, setCurrentBall] = useState(null);
  const [calledHistory, setCalledHistory] = useState([]);
  const [markedNumbers, setMarkedNumbers] = useState([]);
  const [cardsData, setCardsData] = useState([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [readyPlayers, setReadyPlayers] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [spectatorNumbers, setSpectatorNumbers] = useState([]);
  const [spectatorBall, setSpectatorBall] = useState(null);
  const [bingoMessage, setBingoMessage] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const numberCallSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2181/2181-preview.mp3');
  const winSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
  const loseSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2016/2016-preview.mp3');

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/rooms/${roomId}/my-cards?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCardsData(data.map(c => ({ id: c.id, matrix: c.matrix })));
        }
      })
      .catch(err => console.error("Failed to fetch cards:", err));
  }, [roomId, userId]);
  useEffect(() => {
    if (!userId) return;

    const handleJoin = () => {
      socket.emit('join_room', { roomId, userId, stake });
      socket.emit('get_my_cards', { roomId, userId });
    };

    socket.on('room_update', (data) => {
      if (Number.isFinite(Number(data.players))) setPlayersCount(Number(data.players));
      if (Number.isFinite(Number(data.readyPlayers))) setReadyPlayers(Number(data.readyPlayers));
    });
    socket.on('game_in_progress', (data) => {
      setIsSpectator(true);
      setCardsData([]);
      setMarkedNumbers([]);
      setGameStarted(false);
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayersCount(Number(data.players));
      socket.emit('join_as_spectator', { roomId, userId });
    });
    socket.on('spectator_sync', (data) => {
      setSpectatorNumbers(data.calledNumbers || []);
      setSpectatorBall(data.currentBall || null);
      if (Number.isFinite(Number(data.players))) setPlayersCount(Number(data.players));
    });
    socket.on('insufficient_funds', (data) => {
      alert(`💰 ${data.message}`);
      window.location.href = '/wallet';
    });
    socket.on('game_aborted', (data) => {
      alert(`⚠️ ${data.message}`);
      window.location.href = '/';
    });
    socket.on('countdown_tick', (data) => setCountdown(data.timeLeft));
    socket.on('my_cards', (data) => {
      if (!isSpectator && data.cards && data.cards.length > 0) setCardsData(data.cards);
    });
    socket.on('game_started', () => {
      setCountdown(null);
      setGameStarted(true);
    });
    socket.on('new_number_called', ({ number, letter }) => {
      if (isSpectator) {
        setSpectatorBall({ number, letter });
        setSpectatorNumbers(prev => [...prev, number]);
      } else {
        setCurrentBall({ number, letter });
        setCalledNumbers(prev => [...prev, number]);
        setCalledHistory(prev => [...prev.slice(-4), { number, letter }]);
        if (soundEnabled) {
          numberCallSound.currentTime = 0;
          numberCallSound.play().catch(() => {});
          speakNumber(number, letter);
        }
      }
    });
    socket.on('game_over', (data) => {
      if (isSpectator) return

      const myId = String(userId);
      const isWinner = data.winnerIds?.some(id => String(id) === myId);
      if (isWinner) {
        setGameResult({ type: 'win', title: '🎉 Congratulations!', message: `You won ETB ${Number(data.payout).toFixed(2)}!` });
        if (soundEnabled && winSound) winSound.play().catch(() => {});
      } else {
        setGameResult({ type: 'loss', title: '🎲 Game Over', message: `The winner is ${data.winnerName || 'a player'}. Better luck next time!` });
        if (soundEnabled && loseSound) loseSound.play().catch(() => {});
      }
      setTimeout(() => { setGameResult(null); navigate('/'); }, 5000);
    });
    socket.on('game_ended_for_spectators', () => {
      if (!isSpectator) return

      setIsSpectator(false);
      setSpectatorNumbers([]);
      setSpectatorBall(null);
      sessionStorage.removeItem('activeRoomId');
      navigate('/');
    });
    socket.on('bingo_result', (data) => {
      setBingoMessage(data);
      setTimeout(() => setBingoMessage(null), 4000);
    });

    if (socket.connected) handleJoin();
    else socket.on('connect', handleJoin);

    return () => {
      socket.off('connect', handleJoin);
      socket.off('room_update');
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
      socket.off('bingo_result');
    };
  }, [socket, roomId, userId, stake, soundEnabled, isSpectator, navigate]);

  const speakNumber = (number, letter) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const text = `${letter} ${number}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'am-ET';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
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
      <div className="min-h-screen bg-[#1e3a5f] text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-md bg-yellow-500 text-[#112A46] font-bold text-center py-2 rounded-t-xl flex justify-center items-center gap-2 shadow-lg">
          <span className="animate-pulse">👀</span> GAME IN PROGRESS
        </div>
        <div className="w-full max-w-md bg-[#112A46] p-6 rounded-b-xl shadow-2xl flex flex-col items-center border border-blue-900">
          <div className="w-full flex justify-between items-center text-sm font-bold text-gray-300 mb-4 border-b border-gray-700 pb-3">
            <span>Players: <span className="text-yellow-400">{playersCount}</span></span>
            <span>Balls: <span className="text-yellow-400">{spectatorNumbers.length}/75</span></span>
          </div>

          <div className="mb-6">
            {spectatorBall ? (
              <div className={`w-32 h-32 rounded-full border-8 flex flex-col items-center justify-center shadow-xl ${getBallColor(spectatorBall.letter)}`}>
                <span className="text-2xl font-bold text-white mt-1">{spectatorBall.letter}</span>
                <span className="text-6xl font-bold text-white">{spectatorBall.number}</span>
              </div>
            ) : (
              <div className="w-32 h-32 rounded-full bg-gray-600 flex items-center justify-center animate-pulse">
                <span className="text-4xl text-white">-</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {spectatorHistory.slice(-5).reverse().map((num) => {
              let letter = 'B';
              if (num > 15) letter = 'I';
              if (num > 30) letter = 'N';
              if (num > 45) letter = 'G';
              if (num > 60) letter = 'O';
              return (
                <div key={num} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm ${getBallColor(letter)}`}>
                  {num}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-5 gap-1 w-full mb-6 max-h-48 overflow-y-auto p-2 bg-[#0d1f33] rounded-lg">
            {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
              const isCalled = spectatorNumbers.includes(num);
              let letter = 'B';
              if (num > 15) letter = 'I';
              if (num > 30) letter = 'N';
              if (num > 45) letter = 'G';
              if (num > 60) letter = 'O';
              return (
                <div key={num} className={`text-center text-xs py-1 rounded ${isCalled ? getBallColor(letter).split(' ')[0] + ' text-white font-bold' : 'bg-[#1e3a5f] text-gray-500'}`}>
                  {num}
                </div>
              );
            })}
          </div>
          <div className="text-center mt-2">
            <p className="text-yellow-400 text-lg font-bold mb-2">🎮 ጨዋታው በመካሄድ ላይ ነው!</p>
            <p className="text-gray-300 text-sm leading-relaxed">
              እባክዎ ይጠብቁ። አሁን በሚካሄደው ጨዋታ ተጠናቅቆ አዲሱ ጨዋታ ሲጀመር በራስ-ሰር ወደ ጨዋታው ይገባሉ።
              <br /><br />
              መልካም ጨዋታ!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e3a5f] text-white p-2 font-sans flex flex-col">
      {countdown !== null && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
           <div className="text-8xl font-black text-green-500 font-mono animate-pulse">{countdown}</div>
        </div>
      )}
      {!gameStarted && countdown === null ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="bg-[#112A46] p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full border border-blue-800">
            <h2 className="text-3xl font-bold mb-6">Waiting Room</h2>
            <p className="text-xl mb-2">Players: <span className="font-bold text-yellow-400">{playersCount} / 10</span></p>
            <p className="text-xl mb-6">Ready Players: <span className="font-bold text-green-400">{readyPlayers || 0}</span></p>
            <p className="text-gray-400">Waiting for game to start...</p>
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-1 mb-4 bg-[#112A46] p-2 rounded-md shadow-md">
        <div className="flex gap-2 text-xs font-bold">
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">Win: 0</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">Stake: {stake}</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">Call: {calledNumbers.length}</div>
          <div className="bg-[#2A4B6E] px-3 py-1 rounded">Players: {playersCount}</div>
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')} className="bg-[#2A4B6E] px-3 py-1 rounded hover:bg-[#3A5B7E]">
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button onClick={() => { if (soundEnabled) window.speechSynthesis?.cancel(); setSoundEnabled(!soundEnabled); }} className={`px-3 py-1 rounded ${soundEnabled ? 'bg-green-600' : 'bg-[#2A4B6E]'}`}>
            {soundEnabled ? 'SND' : 'MUTE'}
          </button>
        </div>
      </div>

      <div className="flex flex-row gap-2 flex-1">
        <div className="w-1/2 flex flex-col gap-4">
          <div className="w-full h-40 flex items-center justify-center mb-4">
            {countdown !== null ? (
              <span className="text-7xl font-bold text-white">{countdown}</span>
            ) : currentBall ? (
              <div className={`w-40 h-40 rounded-full border-8 flex items-center justify-center shadow-2xl ${getBallColor(currentBall.letter)}`}>
                <span className="text-5xl font-black text-white">{currentBall.letter}-{currentBall.number}</span>
              </div>
            ) : (
              <span className="text-gray-400 font-bold">Waiting for game...</span>
            )}
          </div>
          <div className="flex gap-2 justify-center h-10">
            {calledHistory.map((ball, i) => (
              <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm ${getBallColor(ball.letter)}`}>{ball.number}</div>
            ))}
          </div>
          <div className="bg-[#4a5568] p-2 rounded-lg shadow-md">
            <div className="grid grid-cols-5 gap-1">
              {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                <div key={letter} className={`text-center text-xl py-1 rounded text-white ibm-plex-mono-bold-italic ${getBallColor(letter).split(' ')[0]}`}>{letter}</div>
              ))}
              {Array.from({ length: 15 }, (_, rowIndex) => (
                <Fragment key={rowIndex}>
                  {[0, 1, 2, 3, 4].map((colIndex) => {
                    const num = rowIndex + 1 + (colIndex * 15);
                    const isCalled = calledNumbers.includes(num);
                    return (
                      <div key={num} className={`text-center text-sm py-1.5 rounded ${isCalled ? 'bg-yellow-400 text-black font-bold' : 'bg-[#1e3a5f] text-white'}`}>{num}</div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="w-1/2 flex flex-col justify-center items-center gap-4 py-10">
          <div className="w-full flex flex-col items-center gap-4">
            {cardsData && cardsData.length > 0 ? (
              <div className="bg-[#4a5568] p-3 rounded-xl shadow-lg">
                <div className="text-center font-bold text-lg mb-2 text-gray-200">Card No. {cardsData[0]?.id || '?'}</div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div key={letter} className={`text-center text-xl py-1 rounded text-white ibm-plex-mono-bold-italic ${getBallColor(letter).split(' ')[0]}`}>{letter}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {cardsData[0]?.matrix?.flat().map((num, index) => {
                    const isFree = index === 12 || num === 'FREE';
                    const isMarked = isFree || markedNumbers.includes(num);
                    return (
                      <button key={index} onClick={() => !isFree && handleDaub(num)} className={`aspect-square flex items-center justify-center font-bold text-lg rounded-md shadow-sm transition-transform ${isFree ? 'bg-blue-600 text-white border-b-0 transform translate-y-1' : isMarked ? 'bg-green-500 text-white border-b-0 transform translate-y-1' : 'bg-white text-black border-b-4 border-gray-300 hover:bg-gray-100'}`}>
                        {isFree ? 'F' : num}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-white text-center mt-10">Loading Card...</div>
            )}
            <button onClick={handleBingoClick} className="w-full max-w-sm bg-yellow-500 text-[#112A46] font-extrabold text-2xl py-4 rounded-xl shadow-lg">BINGO</button>
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className={`bg-[#112A46] rounded-2xl p-8 max-w-sm w-full text-center border-4 ${gameResult.type === 'win' ? 'border-yellow-500' : 'border-red-500'}`}>
            <h2 className={`text-4xl font-bold mb-4 ${gameResult.type === 'win' ? 'text-yellow-400' : 'text-red-400'}`}>
              {gameResult.title}
            </h2>
            <p className="text-white text-xl mb-8">{gameResult.message}</p>
            <button onClick={() => { setGameResult(null); navigate('/'); }} className="w-full bg-white text-[#112A46] font-bold py-3 rounded-xl">Back to Lobby</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
