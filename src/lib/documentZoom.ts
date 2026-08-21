/** CSS zoom on <html> maps visual client coords into document layout coords. */
export function documentZoom(): number {
  const raw = getComputedStyle(document.documentElement).zoom;
  if (!raw || raw === "normal") {
    return 1;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function documentPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
  const zoom = documentZoom();
  return { x: clientX / zoom, y: clientY / zoom };
}
