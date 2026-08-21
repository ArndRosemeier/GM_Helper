/** Suppress initiative reconcile while a reorder gesture is in flight. */
let dragDepth = 0;
let dragEpoch = 0;
const epochListeners = new Set<() => void>();

export function beginInitiativeDrag(): void {
  dragDepth += 1;
}

export function endInitiativeDrag(): void {
  if (dragDepth <= 0) {
    throw new Error("Initiative drag ended without a matching begin");
  }
  dragDepth -= 1;
  if (dragDepth === 0) {
    dragEpoch += 1;
    for (const listener of epochListeners) {
      listener();
    }
  }
}

export function isInitiativeDragging(): boolean {
  return dragDepth > 0;
}

export function subscribeInitiativeDragEpoch(listener: () => void): () => void {
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
}

export function initiativeDragEpoch(): number {
  return dragEpoch;
}
