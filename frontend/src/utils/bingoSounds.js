let isVoiceEnabled = false;
let isAudioUnlocked = false;
const audioCache = {};

export const unlockAudio = () => {
  if (isAudioUnlocked) return;

  const silentAudio = new Audio('/audio/B1.mp3');
  silentAudio.volume = 0;
  silentAudio.play().then(() => {
    silentAudio.pause();
    isAudioUnlocked = true;
    console.log('[Audio] HTML5 Audio unlocked.');
  }).catch((error) => console.log('[Audio] Unlock failed:', error));
};

export const toggleVoice = (enabled) => {
  isVoiceEnabled = enabled;
  if (!enabled) {
    Object.values(audioCache).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
};

export const preloadAudio = () => {
  const letters = ['B', 'I', 'N', 'G', 'O'];
  const ranges = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75]
  };

  letters.forEach((letter) => {
    const [start, end] = ranges[letter];
    for (let number = start; number <= end; number += 1) {
      const fileName = `${letter}${number}.m4a`;
      if (!audioCache[fileName]) {
        const audio = new Audio(`/audio/${fileName}`);
        audio.preload = 'auto';
        audio.load();
        audioCache[fileName] = audio;
      }
    }
  });
  console.log('[Audio] All 75 audio files preloaded into cache.');
};

export const playNumberAudio = (letter, number) => {
  if (!isVoiceEnabled || !['B', 'I', 'N', 'G', 'O'].includes(letter)) return;

  const numericNumber = Number(number);
  if (!Number.isInteger(numericNumber) || numericNumber < 1 || numericNumber > 75) return;

  const fileName = `${letter}${numericNumber}.m4a`;

  Object.values(audioCache).forEach((audio) => {
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  });

  if (!audioCache[fileName]) audioCache[fileName] = new Audio(`/audio/${fileName}`);

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  audio.play().catch((error) => {
    console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, error);
  });
};
