import { useEffect } from "react";

const VIEWPORT_META = "width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover";

/**
 * Keeps the document box matched to the visible viewport.
 * Tablet Safari can leave 100dvh taller than the screen after chrome or a
 * leaked page-pinch; the dice HUD then sits below the fold until reload.
 */
export function useViewportFit(): void {
  useEffect(() => {
    lockPageScale();
    applyViewportBox();
    const viewport = liveViewport();
    const onChange = (): void => {
      lockPageScale();
      applyViewportBox();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    viewport?.addEventListener("resize", onChange);
    viewport?.addEventListener("scroll", onChange);
    document.addEventListener("gesturestart", preventPageGesture, { passive: false });
    document.addEventListener("gesturechange", preventPageGesture, { passive: false });
    document.addEventListener("gestureend", preventPageGesture, { passive: false });
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      viewport?.removeEventListener("resize", onChange);
      viewport?.removeEventListener("scroll", onChange);
      document.removeEventListener("gesturestart", preventPageGesture);
      document.removeEventListener("gesturechange", preventPageGesture);
      document.removeEventListener("gestureend", preventPageGesture);
    };
  }, []);
}

function liveViewport(): VisualViewport | null {
  return window.visualViewport ?? null;
}

function viewportBox(): { width: number; height: number } {
  const viewport = liveViewport();
  if (viewport !== null) {
    return { width: viewport.width, height: viewport.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function applyViewportBox(): void {
  const box = viewportBox();
  if (!(box.width > 0) || !(box.height > 0)) {
    throw new Error(`Visual viewport has no size: ${String(box.width)}×${String(box.height)}`);
  }
  const root = document.documentElement;
  root.style.setProperty("--viewport-width", `${String(box.width)}px`);
  root.style.setProperty("--viewport-height", `${String(box.height)}px`);
}

function lockPageScale(): void {
  const meta = document.querySelector("meta[name='viewport']");
  if (!(meta instanceof HTMLMetaElement)) {
    throw new Error("Document is missing the viewport meta tag");
  }
  if (meta.content !== VIEWPORT_META) {
    meta.content = VIEWPORT_META;
  }
  const viewport = liveViewport();
  if (viewport !== null && viewport.scale !== 1) {
    window.scrollTo(0, 0);
  }
}

function preventPageGesture(event: Event): void {
  event.preventDefault();
}
