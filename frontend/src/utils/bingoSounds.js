const letters = {
  B: 'ቢ',
  I: 'አይ',
  N: 'ኤን',
  G: 'ጂ',
  O: 'ኦ',
};

function getAmharicNumber(num) {
  const ones = ['', 'አንድ', 'ሁለት', 'ሶስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ'];
  const tens = ['', 'አስር', 'ሃያ', 'ሰላሳ', 'አርባ', 'ሃምሳ', 'ስልሳ', 'ሰባ', 'ሰማንያ', 'ዘጠና'];

  if (num < 10) return ones[num];
  if (num === 10) return 'አስር';
  if (num < 20) return `አስራ ${ones[num - 10]}`;
  if (num % 10 === 0) return tens[Math.floor(num / 10)];
  return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`;
}

export const playBallCall = (ballString) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const [letter, numberString] = ballString.split('-');
  const number = Number.parseInt(numberString, 10);
  if (!letters[letter] || !Number.isInteger(number) || number < 1 || number > 75) return;

  const utterance = new SpeechSynthesisUtterance(
    `${letters[letter]} ${getAmharicNumber(number)}`
  );
  utterance.rate = 0.9;

  const amharicVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith('am'));
  if (amharicVoice) utterance.voice = amharicVoice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

export const unlockAudio = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
  window.speechSynthesis.resume();
};
