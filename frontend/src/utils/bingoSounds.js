let isVoiceEnabled = true;
let isAudioUnlocked = false;
const audioCache = {};
const MAX_CACHE_SIZE = 10;

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

  if (!audioCache[fileName]) {
    while (Object.keys(audioCache).length >= MAX_CACHE_SIZE) {
      const oldestKey = Object.keys(audioCache)[0];
      const oldestAudio = audioCache[oldestKey];
      oldestAudio.pause();
      oldestAudio.currentTime = 0;
      oldestAudio.removeAttribute('src');
      oldestAudio.load();
      delete audioCache[oldestKey];
    }
    audioCache[fileName] = new Audio(filePath);
  } else {
    const cachedAudio = audioCache[fileName];
    delete audioCache[fileName];
    audioCache[fileName] = cachedAudio;
  }

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
