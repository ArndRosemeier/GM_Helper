import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useHost } from "../host/HostContext";
import type { EntityId } from "../host/ids";
import {
  cardEncounterDragActive,
  startCardEncounterDrag,
  type CardDragGhost,
} from "./cardEncounterDragController";

export type { CardDragGhost };

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
  const didDrag = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    didDrag.current = false;
    startCardEncounterDrag({
      entityId,
      title,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      setGhost: (next) => {
        if (next !== null) {
          didDrag.current = true;
        }
        setGhost(next);
      },
      onDrop: (id) => {
        storeRef.current.run(storeRef.current.dropOnEncounter(id));
      },
    });
  };

  const consumeClick = (): boolean => {
    if (!didDrag.current && !cardEncounterDragActive()) {
      return false;
    }
    didDrag.current = false;
    return true;
  };

  return { onPointerDown, consumeClick, ghost };
}
