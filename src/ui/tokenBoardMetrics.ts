import type { BoardLayout, BoardView } from "./applyBoardCamera";
import { clientPointInViewport } from "./useBoardPanZoom";
import type { BattlegroundToken } from "../host/types";
import type { CSSProperties } from "react";

/** Minimum on-screen token diameter for comfortable tap targets (matches --tap). */
export const TOKEN_MIN_SCREEN_PX = 44;

export type ScreenTokenLayout = {
  centerX: number;
  centerY: number;
  screenPx: number;
  hitPx: number;
};

export function screenTokenLayout(
  tokenX: number,
  tokenY: number,
  artBoardPx: number,
  view: BoardView,
  boardLayout: BoardLayout,
): ScreenTokenLayout {
  const screenPx = artBoardPx * view.scale;
  const hitPx = Math.max(screenPx, TOKEN_MIN_SCREEN_PX);
  return {
    centerX: boardLayout.left + view.x + tokenX * boardLayout.width * view.scale,
    centerY: boardLayout.top + view.y + tokenY * boardLayout.height * view.scale,
    screenPx,
    hitPx,
  };
}

export function screenTokenButtonStyle(
  tokenX: number,
  tokenY: number,
  artBoardPx: number,
  view: BoardView,
  boardLayout: BoardLayout,
): CSSProperties {
  const layout = screenTokenLayout(tokenX, tokenY, artBoardPx, view, boardLayout);
  return {
    left: `${String(layout.centerX)}px`,
    top: `${String(layout.centerY)}px`,
    width: `${String(layout.hitPx)}px`,
    height: `${String(layout.hitPx)}px`,
    "--token-screen-px": `${String(layout.screenPx)}px`,
  } as CSSProperties;
}

export function screenTokenAnchorProps(
  tokenX: number,
  tokenY: number,
  artBoardPx: number,
  kind: "token" | "controls" | "glow" | "initiative",
): {
  "data-screen-token-layout": string;
  "data-token-x": string;
  "data-token-y": string;
  "data-art-px": string;
} {
  return {
    "data-screen-token-layout": kind,
    "data-token-x": String(tokenX),
    "data-token-y": String(tokenY),
    "data-art-px": String(artBoardPx),
  };
}

export function tokenArtSizePx(unitSize: number, tokenScale: number): number {
  return unitSize * tokenScale;
}

export function tokenScreenDiameterPx(artSizePx: number, viewScale: number): number {
  return artSizePx * viewScale;
}

export function tokenHitSizeBoardPx(
  artSizePx: number,
  viewScale: number,
  minScreenPx: number = TOKEN_MIN_SCREEN_PX,
): number {
  return Math.max(artSizePx, minScreenPx / viewScale);
}

export function zoomScaleForTokenScreenSize(
  artSizePx: number,
  minScreenPx: number = TOKEN_MIN_SCREEN_PX,
): number {
  return minScreenPx / artSizePx;
}

export function focusBoardView(
  _view: BoardView,
  viewport: { width: number; height: number },
  board: { width: number; height: number },
  layoutOrigin: { x: number; y: number },
  normalizedPoint: { x: number; y: number },
  targetScale: number,
): BoardView {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  return {
    x: centerX - layoutOrigin.x - normalizedPoint.x * board.width * targetScale,
    y: centerY - layoutOrigin.y - normalizedPoint.y * board.height * targetScale,
    scale: targetScale,
  };
}

export function findPortraitTokenAtClientPoint(options: {
  clientX: number;
  clientY: number;
  tokens: ReadonlyArray<BattlegroundToken>;
  unitSize: number;
  view: BoardView;
  viewport: HTMLElement;
  board: HTMLElement;
  layoutOrigin: { x: number; y: number };
  isStamp: (token: BattlegroundToken) => boolean;
  minScreenPx?: number;
}): BattlegroundToken | null {
  const {
    clientX,
    clientY,
    tokens,
    unitSize,
    view,
    viewport,
    board,
    layoutOrigin,
    isStamp,
    minScreenPx = TOKEN_MIN_SCREEN_PX,
  } = options;
  const boardWidth = board.offsetWidth;
  const boardHeight = board.offsetHeight;
  if (!(boardWidth > 0) || !(boardHeight > 0)) {
    return null;
  }
  const local = clientPointInViewport(viewport, clientX, clientY);
  let nearest: { token: BattlegroundToken; distance: number } | null = null;

  for (const token of tokens) {
    if (!token.visible || isStamp(token)) {
      continue;
    }
    const artPx = tokenArtSizePx(unitSize, token.scale);
    const captureRadius = Math.max(artPx * view.scale / 2, minScreenPx / 2);
    const centerX = layoutOrigin.x + view.x + token.x * boardWidth * view.scale;
    const centerY = layoutOrigin.y + view.y + token.y * boardHeight * view.scale;
    const distance = Math.hypot(local.x - centerX, local.y - centerY);
    if (distance > captureRadius) {
      continue;
    }
    if (nearest === null || distance < nearest.distance) {
      nearest = { token, distance };
    }
  }

  return nearest?.token ?? null;
}
