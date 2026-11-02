function getUniqueNumbers(min, max, count) {
  const nums = new Set()
  while (nums.size < count) {
    nums.add(Math.floor(Math.random() * (max - min + 1)) + min)
  }
  return Array.from(nums)
}

function generateCardMatrix(cardNumber) {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ]

  // Generate unique numbers for each column
  const cols = ranges.map((range) => getUniqueNumbers(range[0], range[1], 5))

  const matrix = []
  for (let i = 0; i < 5; i += 1) {
    const row = []
    for (let j = 0; j < 5; j += 1) {
      if (i === 2 && j === 2) {
        row.push('FREE') // FREE
      } else {
        row.push(cols[j][i])
      }
    }
    matrix.push(row)
  }
  return matrix
}

module.exports = { generateCardMatrix, getUniqueNumbers }

