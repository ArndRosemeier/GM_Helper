import { documentPointFromClient, documentZoom } from "../lib/documentZoom";

/** Hit-test with client coords + layout rects (correct under html { zoom }). */
export function elementAtClientPoint(
  clientX: number,
  clientY: number,
  selector: string,
): Element | null {
  const nodes = document.querySelectorAll(selector);
  let hit: Element | null = null;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      hit = node;
    }
  }
  return hit;
}

export { documentPointFromClient, documentZoom };
