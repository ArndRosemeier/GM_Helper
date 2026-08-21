import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export const BOARD_SCALE_MIN = 0.35;
export const BOARD_SCALE_MAX = 40;

export type BoardView = {
  x: number;
  y: number;
  scale: number;
};

const START_VIEW: BoardView = { x: 0, y: 0, scale: 1 };

export function zoomBoardView(
  view: BoardView,
  originX: number,
  originY: number,
  factor: number,
  layoutOrigin: { x: number; y: number } = { x: 0, y: 0 },
): BoardView {
  const scale = clamp(view.scale * factor, BOARD_SCALE_MIN, BOARD_SCALE_MAX);
  const worldX = (originX - view.x - layoutOrigin.x) / view.scale;
  const worldY = (originY - view.y - layoutOrigin.y) / view.scale;
  return {
    x: originX - layoutOrigin.x - worldX * scale,
    y: originY - layoutOrigin.y - worldY * scale,
    scale,
  };
}

export function panBoardView(view: BoardView, dx: number, dy: number): BoardView {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

const PAN_THRESHOLD_PX = 8;

type BoardPointer = {
  x: number;
  y: number;
  originX: number;
  originY: number;
  panning: boolean;
};

export function useBoardPanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  layoutOriginRef: RefObject<{ x: number; y: number }>,
): {
  view: BoardView;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  zoomBy: (factor: number) => void;
  pointersDown: number;
} {
  const [view, setView] = useState<BoardView>(START_VIEW);
  const pointers = useRef(new Map<number, BoardPointer>());
  const [pointersDown, setPointersDown] = useState(0);
  const windowBound = useRef(false);
  const moveRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const upRef = useRef<(event: PointerEvent) => void>(() => undefined);

  const syncPointerCount = (): void => {
    setPointersDown(pointers.current.size);
  };

  const detachWindow = (): void => {
    if (!windowBound.current) {
      return;
    }
    windowBound.current = false;
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", onWindowUp, true);
    window.removeEventListener("pointercancel", onWindowUp, true);
  };

  function onWindowMove(event: PointerEvent): void {
    moveRef.current(event);
  }

  function onWindowUp(event: PointerEvent): void {
    upRef.current(event);
  }

  moveRef.current = (event: PointerEvent): void => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      return;
    }
    const next: BoardPointer = {
      x: event.clientX,
      y: event.clientY,
      originX: previous.originX,
      originY: previous.originY,
      panning: previous.panning,
    };
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, next);
    const after = [...pointers.current.values()];
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    if (before.length >= 2 && after.length >= 2) {
      for (const pointer of after) {
        pointer.panning = true;
      }
      const first = before[0];
      const second = before[1];
      const firstAfter = after[0];
      const secondAfter = after[1];
      if (!first || !second || !firstAfter || !secondAfter) {
        return;
      }
      event.preventDefault();
      const prevDist = distance(first, second);
      const nextDist = distance(firstAfter, secondAfter);
      const prevMid = midpoint(first, second);
      const nextMid = midpoint(firstAfter, secondAfter);
      const localPrev = clientPointInViewport(node, prevMid.x, prevMid.y);
      const localNext = clientPointInViewport(node, nextMid.x, nextMid.y);
      const origin = layoutOriginRef.current;
      setView((current) => {
        const zoomed =
          prevDist > 0 ? zoomBoardView(current, localPrev.x, localPrev.y, nextDist / prevDist, origin) : current;
        return panBoardView(zoomed, localNext.x - localPrev.x, localNext.y - localPrev.y);
      });
      return;
    }
    if (!next.panning) {
      const travel = Math.hypot(next.x - next.originX, next.y - next.originY);
      if (travel < PAN_THRESHOLD_PX) {
        return;
      }
      next.panning = true;
    }
    event.preventDefault();
    const delta = clientDeltaToLocal(node, next.x - previous.x, next.y - previous.y);
    setView((current) => panBoardView(current, delta.x, delta.y));
  };

  upRef.current = (event: PointerEvent): void => {
    if (!pointers.current.has(event.pointerId)) {
      return;
    }
    pointers.current.delete(event.pointerId);
    syncPointerCount();
    if (pointers.current.size === 0) {
      detachWindow();
    }
  };

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const local = clientPointInViewport(node, event.clientX, event.clientY);
      const factor = event.ctrlKey ? Math.exp(-event.deltaY * 0.01) : event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const origin = layoutOriginRef.current;
      setView((current) => zoomBoardView(current, local.x, local.y, factor, origin));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      detachWindow();
      pointers.current.clear();
    };
  }, [viewportRef, layoutOriginRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      panning: false,
    });
    syncPointerCount();
    if (!windowBound.current) {
      windowBound.current = true;
      window.addEventListener("pointermove", onWindowMove, true);
      window.addEventListener("pointerup", onWindowUp, true);
      window.addEventListener("pointercancel", onWindowUp, true);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    upRef.current(event.nativeEvent);
  };

  const zoomBy = (factor: number): void => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    const originX = node.clientWidth / 2;
    const originY = node.clientHeight / 2;
    const origin = layoutOriginRef.current;
    setView((current) => zoomBoardView(current, originX, originY, factor, origin));
  };

  return { view, onPointerDown, onPointerUp, zoomBy, pointersDown };
}

export function clientPointInViewport(node: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = node.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Board viewport has no size");
  }
  return {
    x: ((clientX - rect.left) / rect.width) * node.clientWidth,
    y: ((clientY - rect.top) / rect.height) * node.clientHeight,
  };
}

export function boardPointFromViewport(
  board: HTMLElement,
  view: BoardView,
  layoutOrigin: { x: number; y: number },
  localX: number,
  localY: number,
): { x: number; y: number } {
  const width = board.offsetWidth;
  const height = board.offsetHeight;
  if (!(width > 0) || !(height > 0)) {
    throw new Error("Battleground board has no size");
  }
  if (!(view.scale > 0)) {
    throw new Error("Board zoom must be positive");
  }
  return {
    x: (localX - view.x - layoutOrigin.x) / (view.scale * width),
    y: (localY - view.y - layoutOrigin.y) / (view.scale * height),
  };
}

export function clientPointOnBoard(
  viewport: HTMLElement,
  board: HTMLElement,
  view: BoardView,
  layoutOrigin: { x: number; y: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const local = clientPointInViewport(viewport, clientX, clientY);
  return boardPointFromViewport(board, view, layoutOrigin, local.x, local.y);
}

function clientDeltaToLocal(node: HTMLElement, dx: number, dy: number): { x: number; y: number } {
  const rect = node.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Board viewport has no size");
  }
  return {
    x: (dx / rect.width) * node.clientWidth,
    y: (dy / rect.height) * node.clientHeight,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
