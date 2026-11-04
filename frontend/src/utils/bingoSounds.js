const letters = { B: 'ቢ', I: 'አይ', N: 'ኤን', G: 'ጂ', O: 'ኦ' };

function getAmharicNumber(num) {
  const ones = ['', 'አንድ', 'ሁለት', 'ሶስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ'];
  const tens = ['', 'አስር', 'ሃያ', 'ሰላሳ', 'አርባ', 'ሃምሳ', 'ስልሳ', 'ሰባ', 'ሰማንያ', 'ዘጠና'];
  if (num < 10) return ones[num];
  if (num === 10) return 'አስር';
  if (num < 20) return `አስራ ${ones[num - 10]}`;
  if (num % 10 === 0) return tens[Math.floor(num / 10)];
  return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`;
}

let isMuted = false;
let voicesLoaded = false;
let amharicVoice = null;

const loadVoices = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    voicesLoaded = true;
    amharicVoice = voices.find((voice) => /am/i.test(voice.lang)) || voices[0];
  }
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

export const toggleMute = () => {
  isMuted = !isMuted;
  if (isMuted && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  return isMuted;
};

export const getMuteState = () => isMuted;

export const playBallCall = (ballString) => {
  if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;

  const [letter, numberString] = ballString.split('-');
  const number = Number.parseInt(numberString, 10);
  if (!letters[letter] || !Number.isInteger(number) || number < 1 || number > 75) return;

  const textToSpeak = `${letters[letter]} ${getAmharicNumber(number)}`;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.rate = 0.9;

  if (!voicesLoaded) loadVoices();
  if (amharicVoice) utterance.voice = amharicVoice;

  window.speechSynthesis.speak(utterance);
};

export const unlockAudio = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
};
