function getUniqueNumbers(min, max, count) {
  const nums = new Set();
  while (nums.size < count) {
    nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
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

module.exports = { generateSingleCard }
