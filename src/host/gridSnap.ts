/** Cell span a token occupies on the encounter grid. Half-size tokens still use one cell. */
export function tokenSpanCells(scale: number): number {
  if (scale < 1) {
    return 1;
  }
  return Math.round(scale);
}

/**
 * Snap a board coordinate (1 = map width/height; may be outside 0–1) to the
 * center of a grid block `spanCells` wide.
 */
export function snapAxisToGrid(
  norm: number,
  boardPx: number,
  gridSize: number,
  spanCells: number,
): number {
  if (!Number.isInteger(gridSize) || gridSize <= 0) {
    throw new Error(`Grid cell size must be a positive whole number, got ${String(gridSize)}`);
  }
  if (!Number.isInteger(spanCells) || spanCells <= 0) {
    throw new Error(`Token span must be a positive whole number of cells, got ${String(spanCells)}`);
  }
  if (!(boardPx > 0)) {
    throw new Error(`Board size must be positive, got ${String(boardPx)}`);
  }
  const half = spanCells / 2;
  const origin = Math.round((norm * boardPx) / gridSize - half);
  return ((origin + half) * gridSize) / boardPx;
}

export function snapPointToGrid(
  x: number,
  y: number,
  boardWidth: number,
  boardHeight: number,
  gridSize: number,
  spanCells: number,
): { x: number; y: number } {
  return {
    x: snapAxisToGrid(x, boardWidth, gridSize, spanCells),
    y: snapAxisToGrid(y, boardHeight, gridSize, spanCells),
  };
}
