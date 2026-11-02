function validateBingo(card, calledNumbers) {
  if (!card || !Array.isArray(card) || card.length !== 5) {
    return { isValid: false }
  }

  const called = new Set(calledNumbers || [])
  const isMarked = (value) => value === 'FREE' || called.has(value)

  // Horizontal lines
  for (let r = 0; r < 5; r++) {
    if (Array.isArray(card[r]) && card[r].every(isMarked)) {
      return { isValid: true, pattern: `ROW_${r + 1}` }
    }
  }

  // Vertical lines
  for (let c = 0; c < 5; c++) {
    if (card.every((row) => isMarked(row[c]))) {
      return { isValid: true, pattern: `COL_${c + 1}` }
    }
  }

  // Main diagonal
  if ([0, 1, 2, 3, 4].every((i) => isMarked(card[i][i]))) {
    return { isValid: true, pattern: 'DIAG_MAIN' }
  }

  // Anti diagonal
  if ([0, 1, 2, 3, 4].every((i) => isMarked(card[i][4 - i]))) {
    return { isValid: true, pattern: 'DIAG_ANTI' }
  }

  // Four corners
  if (
    isMarked(card[0][0]) &&
    isMarked(card[0][4]) &&
    isMarked(card[4][0]) &&
    isMarked(card[4][4])
  ) {
    return { isValid: true, pattern: 'FOUR_CORNERS' }
  }

  return { isValid: false }
}

module.exports = { validateBingo }
