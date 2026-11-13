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

export const playNumberAudio = (letter, number) => {
  if (!isVoiceEnabled || !['B', 'I', 'N', 'G', 'O'].includes(letter)) return;

  const numericNumber = Number(number);
  if (!Number.isInteger(numericNumber) || numericNumber < 1 || numericNumber > 75) return;

  const fileName = `${letter}${numericNumber}.mp3`;
  const filePath = `/audio/${fileName}`;

  if (!audioCache[fileName]) {
    audioCache[fileName] = new Audio(filePath);
  }

  const audio = audioCache[fileName];
  audio.currentTime = 0;
  audio.play().catch((error) => {
    if (error.name !== 'NotSupportedError') {
      console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, error);
      return;
    }

    audio.src = `/audio/${letter}${numericNumber}.m4a`;
    audio.load();
    audio.play().catch((fallbackError) => {
      console.warn(`[Audio] Failed to play ${fileName}. Ensure the file exists in public/audio/.`, fallbackError);
    });
  });
};
