import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  activeInitiativeTokenId,
  initiativeTotal,
  visibleFighterTokenIds,
} from "../host/initiative";
import { useHost } from "../host/HostContext";
import type { TokenId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { elementAtClientPoint } from "./domPoint";
import { beginInitiativeDrag, endInitiativeDrag } from "../host/initiativeDragGate";

const DRAG_THRESHOLD_PX = 8;
const ROW_SELECTOR = "[data-initiative-token]";

type InitiativeEntry = {
  tokenId: TokenId;
  label: string;
  total: number;
  bonus: number;
  roll: number;
  artUrl: string;
  active: boolean;
};

export function InitiativeSidebar({
  coveredTokenIds,
}: {
  coveredTokenIds: ReadonlySet<TokenId>;
}) {
  const { store, snap } = useHost();
  const board = snap.tableEncounter;
  if (board === null) {
    return null;
  }

  const enabled = board.initiativeEnabled;
  const activeId = activeInitiativeTokenId(board);
  const visibleIds = new Set(visibleFighterTokenIds(board, snap.entities, coveredTokenIds));
  const entries = board.initiativeOrder
    .filter((tokenId) => visibleIds.has(tokenId))
    .map((tokenId): InitiativeEntry | null => {
      const token = board.tokens.find((item) => item.id === tokenId);
      if (token === undefined || token.initiativeRoll === null) {
        return null;
      }
      const entity =
        token.entityId === null
          ? undefined
          : snap.entities.find((item) => item.id === token.entityId);
      const artUrl =
        entity !== undefined
          ? (tokenArtUrl(entity, snap.mediaUrls) ??
            defaultTokenDataUrl(token.label, token.entityId ?? token.id))
          : defaultTokenDataUrl(token.label, token.entityId ?? token.id);
      const total = initiativeTotal(token);
      if (total === null) {
        return null;
      }
      return {
        tokenId,
        label: token.label,
        total,
        bonus: token.initiativeBonus ?? 0,
        roll: token.initiativeRoll,
        artUrl,
        active: tokenId === activeId,
      };
    })
    .filter((entry): entry is InitiativeEntry => entry !== null);

  const onToggle = (): void => {
    if (enabled) {
      store.run(store.setInitiativeEnabled(false, []));
      return;
    }
    store.run(store.setInitiativeEnabled(true, [...coveredTokenIds]));
  };

  return (
    <aside className="initiative-sidebar" aria-label="Initiative">
      <label className="initiative-toggle">
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <span>Initiative</span>
      </label>
      {enabled ? (
        <>
          <ol className="initiative-list">
            {entries.length === 0 ? (
              <li className="initiative-empty muted">No visible fighters yet.</li>
            ) : (
              entries.map((entry) => (
                <InitiativeRow
                  key={entry.tokenId}
                  entry={entry}
                  onReorder={(fromTokenId, toTokenId) => {
                    store.run(store.reorderInitiativeTokens(fromTokenId, toTokenId));
                  }}
                />
              ))
            )}
          </ol>
          <button
            type="button"
            className="initiative-next"
            aria-label="Next in initiative"
            disabled={entries.length === 0}
            onClick={() => store.run(store.nextTurn())}
          >
            &gt;&gt;&gt;
          </button>
        </>
      ) : null}
    </aside>
  );
}

function InitiativeRow({
  entry,
  onReorder,
}: {
  entry: InitiativeEntry;
  onReorder: (fromTokenId: TokenId, toTokenId: TokenId) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number; tokenId: TokenId; pointerId: number } | null>(
    null,
  );
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const entryTokenIdRef = useRef(entry.tokenId);
  entryTokenIdRef.current = entry.tokenId;

  const endGestureRef = useRef<(clientX: number, clientY: number) => void>(() => undefined);

  const onWindowMove = useRef((event: PointerEvent): void => {
    const origin = startRef.current;
    if (origin === null || event.pointerId !== origin.pointerId) {
      return;
    }
    if (draggingRef.current) {
      event.preventDefault();
      return;
    }
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
      return;
    }
    draggingRef.current = true;
    setDragging(true);
    beginInitiativeDrag();
    event.preventDefault();
  }).current;

  const onWindowUp = useRef((event: PointerEvent): void => {
    const origin = startRef.current;
    if (origin === null || event.pointerId !== origin.pointerId) {
      return;
    }
    endGestureRef.current(event.clientX, event.clientY);
  }).current;

  endGestureRef.current = (clientX: number, clientY: number): void => {
    const origin = startRef.current;
    startRef.current = null;
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", onWindowUp, true);
    window.removeEventListener("pointercancel", onWindowUp, true);
    if (origin === null) {
      return;
    }
    const wasDragging = draggingRef.current;
    if (!wasDragging) {
      return;
    }
    draggingRef.current = false;
    setDragging(false);
    endInitiativeDrag();
    const target = elementAtClientPoint(clientX, clientY, ROW_SELECTOR);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const toTokenId = target.dataset.initiativeToken as TokenId | undefined;
    if (toTokenId === undefined || toTokenId === origin.tokenId) {
      return;
    }
    onReorderRef.current(origin.tokenId, toTokenId);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onWindowMove, true);
      window.removeEventListener("pointerup", onWindowUp, true);
      window.removeEventListener("pointercancel", onWindowUp, true);
      startRef.current = null;
      if (draggingRef.current) {
        endInitiativeDrag();
        draggingRef.current = false;
      }
    };
  }, [onWindowMove, onWindowUp]);

  const onPointerDown = (event: ReactPointerEvent<HTMLLIElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (startRef.current !== null) {
      endGestureRef.current(event.clientX, event.clientY);
    }
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      tokenId: entryTokenIdRef.current,
      pointerId: event.pointerId,
    };
    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", onWindowUp, true);
    window.addEventListener("pointercancel", onWindowUp, true);
  };

  return (
    <li
      className={[
        "initiative-row",
        entry.active ? "is-active" : null,
        dragging ? "is-dragging" : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" ")}
      data-initiative-token={entry.tokenId}
      onPointerDown={onPointerDown}
    >
      <img className="initiative-row-art" src={entry.artUrl} alt="" />
      <span className="initiative-row-label">{entry.label}</span>
      <span className="initiative-row-total" title={`${String(entry.roll)} + ${String(entry.bonus)}`}>
        {entry.total}
      </span>
    </li>
  );
}

export function InitiativeTurnMarker({
  tokenX,
  tokenY,
  unitSize,
  tokenScale,
}: {
  tokenX: number;
  tokenY: number;
  unitSize: number;
  tokenScale: number;
}) {
  const sizePx = unitSize * tokenScale;
  const style: CSSProperties & { "--token-art-size": string } = {
    left: `${String(tokenX * 100)}%`,
    top: `${String(tokenY * 100)}%`,
    "--token-art-size": `${String(sizePx)}px`,
  };
  return (
    <div className="initiative-turn-marker" style={style} aria-hidden="true">
      <span className="initiative-turn-arrow">▼</span>
    </div>
  );
}
