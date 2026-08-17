import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useHost } from "../host/HostContext";
import type { EntityId } from "../host/ids";

const DRAG_THRESHOLD_PX = 10;

export type CardDragGhost = {
  title: string;
  x: number;
  y: number;
};

export function useCardEncounterDrag(
  entityId: EntityId,
  title: string,
): {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  consumeClick: () => boolean;
  ghost: CardDragGhost | null;
} {
  const { store } = useHost();
  const [ghost, setGhost] = useState<CardDragGhost | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const didDrag = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }
    origin.current = { x: event.clientX, y: event.clientY };
    dragging.current = false;
    didDrag.current = false;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent): void => {
      const start = origin.current;
      if (!start) {
        return;
      }
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!dragging.current) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        dragging.current = true;
        didDrag.current = true;
        document.body.classList.add("is-card-dragging");
      }
      moveEvent.preventDefault();
      const point = documentPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setGhost({ title, x: point.x, y: point.y });
      setEncounterDropHot(point.x, point.y);
    };

    const finish = (upEvent: PointerEvent): void => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      const point = documentPointFromClient(upEvent.clientX, upEvent.clientY);
      const dropped = dragging.current && encounterDropFromPoint(point.x, point.y);
      dragging.current = false;
      origin.current = null;
      setGhost(null);
      document.body.classList.remove("is-card-dragging");
      clearEncounterDropHot();
      if (dropped) {
        store.run(store.dropOnEncounter(entityId));
      }
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  const consumeClick = (): boolean => {
    if (!didDrag.current) {
      return false;
    }
    didDrag.current = false;
    return true;
  };

  return { onPointerDown, consumeClick, ghost };
}

/** CSS zoom on <html> maps visual client coords into document layout coords. */
function documentZoom(): number {
  const raw = getComputedStyle(document.documentElement).zoom;
  if (!raw || raw === "normal") {
    return 1;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function documentPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
  const zoom = documentZoom();
  return { x: clientX / zoom, y: clientY / zoom };
}

function encounterDropFromPoint(x: number, y: number): boolean {
  const node = document.elementFromPoint(x, y);
  return node instanceof Element && node.closest("[data-encounter-drop]") !== null;
}

function setEncounterDropHot(x: number, y: number): void {
  const hot = document.elementFromPoint(x, y);
  const zone = hot instanceof Element ? hot.closest("[data-encounter-drop]") : null;
  for (const node of document.querySelectorAll("[data-encounter-drop]")) {
    node.classList.toggle("is-hot", node === zone);
  }
}

function clearEncounterDropHot(): void {
  for (const node of document.querySelectorAll("[data-encounter-drop]")) {
    node.classList.remove("is-hot");
  }
}
