/** Skip layout snaps and similar while a board pointer gesture is in flight. */
let gestureDepth = 0;

export function beginBoardGesture(): void {
  gestureDepth += 1;
}

export function endBoardGesture(): void {
  if (gestureDepth <= 0) {
    throw new Error("Board gesture ended without a matching begin");
  }
  gestureDepth -= 1;
}

export function isBoardGestureActive(): boolean {
  return gestureDepth > 0;
}
