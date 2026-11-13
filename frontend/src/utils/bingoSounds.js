let isVoiceEnabled = true;
let isAudioUnlocked = false;
const audioCache = {};

export const unlockAudio = () => {
  if (isAudioUnlocked) return;

  try {
    const unlockAudioObj = new Audio('/audio/B1.m4a');
    unlockAudioObj.volume = 0;
    unlockAudioObj.play()
      .then(() => {
        unlockAudioObj.pause();
        isAudioUnlocked = true;
        console.log('[Audio] Mobile audio context unlocked.');
      })
      .catch((err) => console.warn('[Audio] Unlock failed:', err));
  } catch (error) {
    console.error('[Audio] Error during unlock:', error);
  }
};

export const toggleVoice = (enabled) => {
  isVoiceEnabled = enabled;
  if (!enabled) {
    Object.values(audioCache).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
};

export const preloadAudio = async () => {
  const letters = ['B', 'I', 'N', 'G', 'O'];
  const ranges = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
  const missingFiles = [];

  for (const letter of letters) {
    const [start, end] = ranges[letter];
    for (let number = start; number <= end; number += 1) {
      const fileName = `${letter}${number}.m4a`;
      try {
        const response = await fetch(`/audio/${fileName}`, { method: 'HEAD' });
        if (!response.ok) missingFiles.push(fileName);
      } catch {
        missingFiles.push(fileName);
      }
    }
  }

  if (missingFiles.length > 0) {
    console.error('[Audio] ❌ MISSING OR UNREACHABLE FILES:', missingFiles.join(', '));
  } else {
    console.log('[Audio] ✅ All 75 audio files verified and cached in HTTP layer.');
  }
};

export const playNumberAudio = (letter, number) => {
  if (!isVoiceEnabled || !isAudioUnlocked || !['B', 'I', 'N', 'G', 'O'].includes(letter)) return;

  const numericNumber = Number(number);
  if (!Number.isInteger(numericNumber) || numericNumber < 1 || numericNumber > 75) return;

  const fileName = `${letter}${numericNumber}.m4a`;
  const filePath = `/audio/${fileName}`;

  Object.values(audioCache).forEach((audio) => {
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  });
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  if (!audioCache[fileName]) audioCache[fileName] = new Audio(filePath);

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  audio.play().catch((err) => {
    console.warn(`[Audio] ❌ Failed to play ${fileName}. File might be missing or corrupt. Falling back to Web Speech API.`, err);
    fallbackToSpeech(letter, numericNumber);
  });
};

const fallbackToSpeech = (letter, number) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(`${letter} ${number}`);
  const amharicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('am'));
  if (amharicVoice) {
    utterance.voice = amharicVoice;
    utterance.lang = 'am-ET';
  } else {
    utterance.lang = 'en-US';
  }
  window.speechSynthesis.speak(utterance);
};
