export type BoardView = {
  x: number;
  y: number;
  scale: number;
};

export type BoardLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Fixed tile size — do not scale with zoom (avoids Safari repainting filtered SVG tiles). */
export const BOARD_STONE_TILE_PX = 256;

export function applyBoardCamera(
  board: HTMLElement | null,
  viewport: HTMLElement | null,
  view: BoardView,
  layoutOrigin: { x: number; y: number },
): void {
  if (board) {
    board.style.transform = `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`;
    board.style.setProperty("--board-zoom", String(view.scale));
  }
  if (viewport) {
    viewport.style.backgroundPosition = `${String(view.x + layoutOrigin.x)}px ${String(view.y + layoutOrigin.y)}px`;
  }
}
