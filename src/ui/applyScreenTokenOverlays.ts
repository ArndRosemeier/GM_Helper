import type { BoardLayout, BoardView } from "./applyBoardCamera";
import { screenTokenLayout } from "./tokenBoardMetrics";

export type ScreenTokenLayoutKind = "token" | "controls" | "glow" | "initiative";

/** Imperatively position screen-space token UI (viewport px, no board transform). */
export function applyScreenTokenOverlays(
  overlay: HTMLElement | null,
  view: BoardView,
  boardLayout: BoardLayout,
): void {
  if (overlay === null || !(boardLayout.width > 0) || !(boardLayout.height > 0)) {
    return;
  }
  const nodes = overlay.querySelectorAll<HTMLElement>("[data-screen-token-layout]");
  for (const node of nodes) {
    const tokenX = Number(node.dataset.tokenX);
    const tokenY = Number(node.dataset.tokenY);
    const artPx = Number(node.dataset.artPx);
    if (!Number.isFinite(tokenX) || !Number.isFinite(tokenY) || !Number.isFinite(artPx)) {
      continue;
    }
    const layout = screenTokenLayout(tokenX, tokenY, artPx, view, boardLayout);
    const kind = (node.dataset.screenTokenLayout ?? "token") as ScreenTokenLayoutKind;
    node.style.setProperty("--token-screen-px", `${String(layout.screenPx)}px`);
    if (kind === "token") {
      node.style.left = `${String(layout.centerX)}px`;
      node.style.top = `${String(layout.centerY)}px`;
      node.style.width = `${String(layout.hitPx)}px`;
      node.style.height = `${String(layout.hitPx)}px`;
      continue;
    }
    if (kind === "controls") {
      node.style.left = `${String(layout.centerX + layout.screenPx / 2 + 8)}px`;
      node.style.top = `${String(layout.centerY)}px`;
      node.style.width = "";
      node.style.height = "";
      continue;
    }
    node.style.left = `${String(layout.centerX)}px`;
    node.style.top = `${String(layout.centerY)}px`;
    node.style.width = `${String(layout.screenPx)}px`;
    node.style.height = kind === "initiative" ? "0" : `${String(layout.screenPx)}px`;
  }
}
