import type { EntityId } from "../host/ids";
import { documentPointFromClient, elementAtClientPoint } from "./domPoint";

const DRAG_THRESHOLD_PX = 10;
const DROP_SELECTOR = "[data-encounter-drop]";

export type CardDragGhost = {
  title: string;
  x: number;
  y: number;
};

type DragSession = {
  entityId: EntityId;
  title: string;
  pointerId: number;
  originX: number;
  originY: number;
  dragging: boolean;
  setGhost: (ghost: CardDragGhost | null) => void;
  onDrop: (entityId: EntityId) => void;
};

let session: DragSession | null = null;

function clearDropHot(): void {
  for (const node of document.querySelectorAll(DROP_SELECTOR)) {
    node.classList.remove("is-hot");
  }
}

function setDropHot(clientX: number, clientY: number): void {
  const zone = elementAtClientPoint(clientX, clientY, DROP_SELECTOR);
  for (const node of document.querySelectorAll(DROP_SELECTOR)) {
    node.classList.toggle("is-hot", node === zone);
  }
}

function finishSession(clientX: number, clientY: number): void {
  const active = session;
  session = null;
  window.removeEventListener("pointermove", onPointerMove, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("pointercancel", onPointerUp, true);
  document.body.classList.remove("is-card-dragging");
  clearDropHot();
  if (active === null) {
    return;
  }
  active.setGhost(null);
  if (!active.dragging) {
    return;
  }
  const zone = elementAtClientPoint(clientX, clientY, DROP_SELECTOR);
  if (zone !== null) {
    active.onDrop(active.entityId);
  }
}

function onPointerMove(event: PointerEvent): void {
  const active = session;
  if (active === null || event.pointerId !== active.pointerId) {
    return;
  }
  const dx = event.clientX - active.originX;
  const dy = event.clientY - active.originY;
  if (!active.dragging) {
    if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      return;
    }
    active.dragging = true;
    document.body.classList.add("is-card-dragging");
  }
  event.preventDefault();
  const point = documentPointFromClient(event.clientX, event.clientY);
  active.setGhost({ title: active.title, x: point.x, y: point.y });
  setDropHot(event.clientX, event.clientY);
}

function onPointerUp(event: PointerEvent): void {
  const active = session;
  if (active === null || event.pointerId !== active.pointerId) {
    return;
  }
  finishSession(event.clientX, event.clientY);
}

export function startCardEncounterDrag(args: {
  entityId: EntityId;
  title: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  setGhost: (ghost: CardDragGhost | null) => void;
  onDrop: (entityId: EntityId) => void;
}): void {
  if (session !== null) {
    finishSession(session.originX, session.originY);
  }
  session = {
    entityId: args.entityId,
    title: args.title,
    pointerId: args.pointerId,
    originX: args.clientX,
    originY: args.clientY,
    dragging: false,
    setGhost: args.setGhost,
    onDrop: args.onDrop,
  };
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
}

export function cardEncounterDragActive(): boolean {
  return session !== null && session.dragging;
}
