import {

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



const DRAG_THRESHOLD_PX = 8;



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
    .map((tokenId) => {

      const token = board.tokens.find((item) => item.id === tokenId);

      if (token === undefined || token.initiativeRoll === null) {

        return null;

      }

      const entity = token.entityId === null

        ? undefined

        : snap.entities.find((item) => item.id === token.entityId);

      const artUrl =
        entity !== undefined
          ? tokenArtUrl(entity, snap.mediaUrls) ?? defaultTokenDataUrl(token.label, token.entityId ?? token.id)
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

    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);



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

              entries.map((entry, index) => (

                <InitiativeRow

                  key={entry.tokenId}

                  entry={entry}

                  index={index}

                  onReorder={(fromIndex, toIndex) => {

                    store.run(store.reorderInitiative(fromIndex, toIndex));

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

  index,

  onReorder,

}: {

  entry: {

    tokenId: TokenId;

    label: string;

    total: number;

    bonus: number;

    roll: number;

    artUrl: string;

    active: boolean;

  };

  index: number;

  onReorder: (fromIndex: number, toIndex: number) => void;

}) {

  const [dragging, setDragging] = useState(false);

  const start = useRef<{ x: number; y: number; index: number } | null>(null);

  const rowRef = useRef<HTMLLIElement>(null);



  const onPointerDown = (event: ReactPointerEvent<HTMLLIElement>): void => {

    if (event.button !== 0) {

      return;

    }

    event.currentTarget.setPointerCapture(event.pointerId);

    start.current = { x: event.clientX, y: event.clientY, index };

    setDragging(false);

  };



  const onPointerMove = (event: ReactPointerEvent<HTMLLIElement>): void => {

    if (start.current === null) {

      return;

    }

    const dx = event.clientX - start.current.x;

    const dy = event.clientY - start.current.y;

    if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {

      setDragging(true);

    }

  };



  const finishDrag = (event: ReactPointerEvent<HTMLLIElement>): void => {

    if (start.current === null) {

      return;

    }

    const origin = start.current;

    start.current = null;

    setDragging(false);

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragging) {

      return;

    }

    const target = document.elementFromPoint(event.clientX, event.clientY);

    const row = target instanceof HTMLElement ? target.closest("[data-initiative-index]") : null;

    if (!(row instanceof HTMLElement)) {

      return;

    }

    const toIndex = Number(row.dataset.initiativeIndex);

    if (!Number.isInteger(toIndex) || toIndex === origin.index) {

      return;

    }

    onReorder(origin.index, toIndex);

  };



  return (

    <li

      ref={rowRef}

      className={[

        "initiative-row",

        entry.active ? "is-active" : null,

        dragging ? "is-dragging" : null,

      ]

        .filter((part): part is string => part !== null)

        .join(" ")}

      data-initiative-index={index}

      onPointerDown={onPointerDown}

      onPointerMove={onPointerMove}

      onPointerUp={finishDrag}

      onPointerCancel={finishDrag}

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

