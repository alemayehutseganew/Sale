function validateBingo(cardMatrix, markedNumbers) {
  // markedNumbers is an array of numbers the user tapped
  const calledSet = new Set(markedNumbers);

  // Helper to check if a cell is marked (FREE is always marked)
  const isMarked = (cell) => cell === 'FREE' || calledSet.has(cell);

  // 1. Check Rows
  for (let r = 0; r < 5; r++) {
    if (cardMatrix[r].every(isMarked)) {
      return { isValid: true, pattern: `Row ${r + 1}` };
    }
  }

  // 2. Check Columns
  for (let c = 0; c < 5; c++) {
    let colWin = true;
    for (let r = 0; r < 5; r++) {
      if (!isMarked(cardMatrix[r][c])) { colWin = false; break; }
    }
    if (colWin) return { isValid: true, pattern: `Column ${c + 1}` };
  }

  // 3. Check Diagonals
  const diag1 = [cardMatrix[0][0], cardMatrix[1][1], cardMatrix[2][2], cardMatrix[3][3], cardMatrix[4][4]];
  if (diag1.every(isMarked)) return { isValid: true, pattern: 'Main Diagonal' };

  const diag2 = [cardMatrix[0][4], cardMatrix[1][3], cardMatrix[2][2], cardMatrix[3][1], cardMatrix[4][0]];
  if (diag2.every(isMarked)) return { isValid: true, pattern: 'Anti Diagonal' };

  // 4. Check Four Corners
  const corners = [cardMatrix[0][0], cardMatrix[0][4], cardMatrix[4][0], cardMatrix[4][4]];
  if (corners.every(isMarked)) return { isValid: true, pattern: 'Four Corners' };

  return { isValid: false, pattern: null };
}

module.exports = { validateBingo }
