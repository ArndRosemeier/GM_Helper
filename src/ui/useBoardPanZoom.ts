import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export const BOARD_SCALE_MIN = 0.35;
export const BOARD_SCALE_MAX = 5;

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

export function useBoardPanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  layoutOriginRef: RefObject<{ x: number; y: number }>,
): {
  view: BoardView;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  zoomBy: (factor: number) => void;
} {
  const [view, setView] = useState<BoardView>(START_VIEW);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const local = pointIn(node, event.clientX, event.clientY);
      const factor = event.ctrlKey ? Math.exp(-event.deltaY * 0.01) : event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const origin = layoutOriginRef.current;
      setView((current) => zoomBoardView(current, local.x, local.y, factor, origin));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
    };
  }, [viewportRef, layoutOriginRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      return;
    }
    const next = { x: event.clientX, y: event.clientY };
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, next);
    const after = [...pointers.current.values()];
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    if (before.length >= 2 && after.length >= 2) {
      const first = before[0];
      const second = before[1];
      const firstAfter = after[0];
      const secondAfter = after[1];
      if (!first || !second || !firstAfter || !secondAfter) {
        return;
      }
      const prevDist = distance(first, second);
      const nextDist = distance(firstAfter, secondAfter);
      const prevMid = midpoint(first, second);
      const nextMid = midpoint(firstAfter, secondAfter);
      const localPrev = pointIn(node, prevMid.x, prevMid.y);
      const localNext = pointIn(node, nextMid.x, nextMid.y);
      const origin = layoutOriginRef.current;
      setView((current) => {
        const zoomed =
          prevDist > 0 ? zoomBoardView(current, localPrev.x, localPrev.y, nextDist / prevDist, origin) : current;
        return panBoardView(zoomed, localNext.x - localPrev.x, localNext.y - localPrev.y);
      });
      return;
    }
    const delta = clientDeltaToLocal(node, next.x - previous.x, next.y - previous.y);
    setView((current) => panBoardView(current, delta.x, delta.y));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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

  return { view, onPointerDown, onPointerMove, onPointerUp, zoomBy };
}

function pointIn(node: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = node.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Board viewport has no size");
  }
  return {
    x: ((clientX - rect.left) / rect.width) * node.clientWidth,
    y: ((clientY - rect.top) / rect.height) * node.clientHeight,
  };
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
