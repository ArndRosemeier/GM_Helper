import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { applyBoardCamera } from "./applyBoardCamera";
import { applyScreenTokenOverlays } from "./applyScreenTokenOverlays";
import type { BoardLayout, BoardView } from "./applyBoardCamera";
import { focusBoardView } from "./tokenBoardMetrics";

export const BOARD_SCALE_MIN = 0.35;
/** Enough to show ~1024px portrait art on a ~48px board token (≈21×) with headroom on Retina. */
export const BOARD_SCALE_MAX = 80;

export type { BoardView };

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
const CAMERA_FOCUS_ANIM_MS = 380;

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
  boardRef: RefObject<HTMLElement | null>,
  tokenOverlayRef: RefObject<HTMLElement | null> | null = null,
  boardLayoutRef: RefObject<BoardLayout> | null = null,
): {
  view: BoardView;
  viewRef: RefObject<BoardView>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  zoomBy: (factor: number) => void;
  focusOnBoardPoint: (normalizedPoint: { x: number; y: number }, targetScale: number) => void;
  pointersDown: number;
} {
  const [view, setView] = useState<BoardView>(START_VIEW);
  const liveView = useRef<BoardView>(START_VIEW);
  const viewRef = liveView;
  const pointers = useRef(new Map<number, BoardPointer>());
  const [pointersDown, setPointersDown] = useState(0);
  const windowBound = useRef(false);
  const gesturing = useRef(false);
  const rafId = useRef<number | null>(null);
  const animId = useRef<number | null>(null);
  const moveRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const upRef = useRef<(event: PointerEvent) => void>(() => undefined);

  const syncPointerCount = (): void => {
    setPointersDown(pointers.current.size);
  };

  const applyDom = (): void => {
    applyBoardCamera(boardRef.current, viewportRef.current, liveView.current, layoutOriginRef.current);
    if (tokenOverlayRef !== null && boardLayoutRef !== null) {
      applyScreenTokenOverlays(tokenOverlayRef.current, liveView.current, boardLayoutRef.current);
    }
  };

  const scheduleApply = (): void => {
    if (rafId.current !== null) {
      return;
    }
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      applyDom();
    });
  };

  const setCameraActive = (active: boolean): void => {
    const board = boardRef.current;
    if (!board) {
      return;
    }
    if (active) {
      board.classList.add("is-camera-active");
    } else {
      board.classList.remove("is-camera-active");
    }
  };

  const commitView = (next: BoardView): void => {
    liveView.current = next;
    setView(next);
    applyDom();
    setCameraActive(false);
    gesturing.current = false;
  };

  const updateLive = (next: BoardView): void => {
    liveView.current = next;
    scheduleApply();
  };

  const cancelCameraAnimation = (): void => {
    if (animId.current !== null) {
      window.cancelAnimationFrame(animId.current);
      animId.current = null;
    }
  };

  const animateToView = (target: BoardView, durationMs = CAMERA_FOCUS_ANIM_MS): void => {
    cancelCameraAnimation();
    const start: BoardView = liveView.current;
    if (
      Math.hypot(target.x - start.x, target.y - start.y) < 0.5 &&
      Math.abs(target.scale - start.scale) < 0.001
    ) {
      commitView(target);
      return;
    }
    const startTime = performance.now();
    gesturing.current = true;
    setCameraActive(true);

    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - startTime) / durationMs);
      const eased = easeOutCubic(progress);
      const next: BoardView = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        scale: start.scale + (target.scale - start.scale) * eased,
      };
      if (progress >= 1) {
        animId.current = null;
        commitView(target);
        return;
      }
      updateLive(next);
      animId.current = window.requestAnimationFrame(tick);
    };
    animId.current = window.requestAnimationFrame(tick);
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
      const current = liveView.current;
      const zoomed =
        prevDist > 0 ? zoomBoardView(current, localPrev.x, localPrev.y, nextDist / prevDist, origin) : current;
      updateLive(panBoardView(zoomed, localNext.x - localPrev.x, localNext.y - localPrev.y));
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
    updateLive(panBoardView(liveView.current, delta.x, delta.y));
  };

  upRef.current = (event: PointerEvent): void => {
    if (!pointers.current.has(event.pointerId)) {
      return;
    }
    pointers.current.delete(event.pointerId);
    syncPointerCount();
    if (pointers.current.size === 0) {
      detachWindow();
      commitView(liveView.current);
    }
  };

  useEffect(() => {
    if (!gesturing.current) {
      liveView.current = view;
      applyDom();
    }
  }, [view]);

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
      const next = zoomBoardView(liveView.current, local.x, local.y, factor, origin);
      commitView(next);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    applyDom();
    return () => {
      node.removeEventListener("wheel", onWheel);
      detachWindow();
      pointers.current.clear();
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      cancelCameraAnimation();
    };
  }, [viewportRef, layoutOriginRef, boardRef, tokenOverlayRef, boardLayoutRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (pointers.current.size === 0) {
      cancelCameraAnimation();
      liveView.current = view;
      gesturing.current = true;
      setCameraActive(true);
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
    commitView(zoomBoardView(liveView.current, originX, originY, factor, origin));
  };

  const focusOnBoardPoint = (normalizedPoint: { x: number; y: number }, targetScale: number): void => {
    const viewport = viewportRef.current;
    const board = boardRef.current;
    if (!viewport || !board) {
      throw new Error("Board viewport is not mounted");
    }
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;
    if (!(boardWidth > 0) || !(boardHeight > 0)) {
      throw new Error("Battleground board has no size");
    }
    const scale = clamp(targetScale, BOARD_SCALE_MIN, BOARD_SCALE_MAX);
    const origin = layoutOriginRef.current;
    animateToView(
      focusBoardView(
        liveView.current,
        { width: viewport.clientWidth, height: viewport.clientHeight },
        { width: boardWidth, height: boardHeight },
        origin,
        normalizedPoint,
        scale,
      ),
    );
  };

  return { view, viewRef, onPointerDown, onPointerUp, zoomBy, focusOnBoardPoint, pointersDown };
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

function easeOutCubic(t: number): number {
  const x = 1 - t;
  return 1 - x * x * x;
}
