function getUniqueNumbers(min, max, count, rng) {
  const nums = new Set();
  while (nums.size < count) {
    const n = rng ? Math.floor(rng() * (max - min + 1)) + min : Math.floor(Math.random() * (max - min + 1)) + min;
    nums.add(n);
  }
  return Array.from(nums);
}

function generateSingleCard() {
  const card = [];
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  // Generate 5 unique numbers for each column
  const cols = ranges.map((range) => getUniqueNumbers(range[0], range[1], 5));

  // Build the 5x5 matrix row by row
  for (let i = 0; i < 5; i += 1) {
    const row = [];
    for (let j = 0; j < 5; j += 1) {
      row.push(cols[j][i]);
    }
    card.push(row);
  }

  // Set the center FREE space
  card[2][2] = 'FREE';

  return card;
}

// Seeded card generator: Card #N always produces the same matrix
function generateCardFromNumber(cardNumber) {
  // Simple LCG seeded random
  let seed = ((cardNumber || 1) * 16807 + 12345) % 2147483647;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646; // 0 to 1 (exclusive)
  };

  const card = [];
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  // Generate 5 unique numbers for each column using the seeded RNG
  const cols = ranges.map((range) => getUniqueNumbers(range[0], range[1], 5, rng));

  // Build the 5x5 matrix row by row
  for (let i = 0; i < 5; i += 1) {
    const row = [];
    for (let j = 0; j < 5; j += 1) {
      row.push(cols[j][i]);
    }
    card.push(row);
  }

  // Set the center FREE space
  card[2][2] = 'FREE';

  return card;
}

module.exports = { generateSingleCard, generateCardFromNumber }
