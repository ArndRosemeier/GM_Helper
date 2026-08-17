import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  TOKEN_SCALE_MIN,
  TOKEN_SIZE_DEFAULT,
  TOKEN_STAMP_COLORS,
  type BattlegroundToken,
  type Entity,
} from "../host/types";
import { useHost } from "../host/HostContext";
import type { EntityId, TokenId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { useBoardPanZoom } from "./useBoardPanZoom";

const DRAG_THRESHOLD_PX = 8;

export function TableSurface() {
  const { store, snap } = useHost();
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const camera = useBoardPanZoom(viewport);
  const [selectedTokenId, setSelectedTokenId] = useState<TokenId | null>(null);
  const [pickingCard, setPickingCard] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; tokenId: TokenId } | null>(null);
  const didDrag = useRef(false);

  const mapId = snap.encounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const tokens = (snap.encounter?.tokens ?? []).filter((token) => token.visible);
  const unitSize = snap.encounter?.tokenSize ?? TOKEN_SIZE_DEFAULT;
  const gridSize = snap.encounter?.gridSize ?? null;
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;

  const onTokenPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId): void => {
    event.stopPropagation();
    event.preventDefault();
    didDrag.current = false;
    dragOrigin.current = { x: event.clientX, y: event.clientY, tokenId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTokenPointerMove = (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const origin = dragOrigin.current;
    if (origin && origin.tokenId === tokenId) {
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        didDrag.current = true;
      }
    }
    if (!didDrag.current) {
      return;
    }
    const node = board.current;
    if (!node) {
      store.setError("Battleground board is not mounted");
      return;
    }
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    store.run(store.moveToken(tokenId, clamp01(x), clamp01(y)));
  };

  const onTokenPointerUp = (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    if (!didDrag.current) {
      setSelectedTokenId((current) => (current === tokenId ? null : tokenId));
    }
  };

  return (
    <div className="table-surface" data-player-safe="true">
      <div
        ref={viewport}
        className="board-viewport"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("board") || (event.target as HTMLElement).classList.contains("grid")) {
            setSelectedTokenId(null);
          }
          camera.onPointerDown(event);
        }}
        onPointerMove={camera.onPointerMove}
        onPointerUp={camera.onPointerUp}
        onPointerCancel={camera.onPointerUp}
      >
        <div
          ref={board}
          className={mapUrl ? "board" : "board is-bare"}
          style={{
            transform: `translate(${String(camera.view.x)}px, ${String(camera.view.y)}px) scale(${String(camera.view.scale)})`,
            backgroundImage: mapUrl ? `url(${mapUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {gridSize !== null ? (
            <div className="grid" style={{ backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }} />
          ) : null}
          {tokens.filter(isStampToken).map((token) => (
            <BoardToken
              key={token.id}
              token={token}
              unitSize={unitSize}
              selected={token.id === selectedTokenId}
              artUrl={tokenArtFor(token, snap.entities, snap.mediaUrls)}
              onPointerDown={onTokenPointerDown}
              onPointerMove={onTokenPointerMove}
              onPointerUp={onTokenPointerUp}
            />
          ))}
          {tokens.filter((token) => !isStampToken(token)).map((token) => (
            <BoardToken
              key={token.id}
              token={token}
              unitSize={unitSize}
              selected={token.id === selectedTokenId}
              artUrl={tokenArtFor(token, snap.entities, snap.mediaUrls)}
              onPointerDown={onTokenPointerDown}
              onPointerMove={onTokenPointerMove}
              onPointerUp={onTokenPointerUp}
            />
          ))}
          {selected ? (
            <TokenFloatControls
              token={selected}
              unitSize={unitSize}
              onGrow={() => store.run(store.adjustTokenScale(selected.id, 1))}
              onShrink={() => store.run(store.adjustTokenScale(selected.id, -1))}
              onRemove={() => {
                store.run(store.removeToken(selected.id));
                setSelectedTokenId(null);
              }}
            />
          ) : null}
          {tokens.length === 0 && !mapUrl ? (
            <p className="board-empty">No public map yet. Pick the pad up, or tap Lift.</p>
          ) : null}
        </div>
      </div>
      {snap.session ? (
        <BoardScaleControls compact onPickCard={() => setPickingCard(true)} />
      ) : null}
      <div className="table-corner-actions">
        <button
          type="button"
          className="board-zoom"
          aria-label="Zoom out"
          onClick={() => camera.zoomBy(1 / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className="board-zoom"
          aria-label="Zoom in"
          onClick={() => camera.zoomBy(1.25)}
        >
          +
        </button>
        <button
          type="button"
          className="board-reset"
          aria-label="Reset encounter board"
          title="Reset board"
          onClick={() => store.run(store.resetEncounterBoard())}
        >
          ↻
        </button>
        <button type="button" className="lift" aria-label="Lift" onClick={() => store.setSurface("gm")}>
          ×
        </button>
      </div>
      {pickingCard
        ? createPortal(
            <BattlegroundCardPicker
              onClose={() => setPickingCard(false)}
              onPick={(entityId) => {
                store.run(store.placeCardOnBattleground(entityId));
                setPickingCard(false);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function tokenArtFor(
  token: BattlegroundToken,
  entities: ReadonlyArray<Entity>,
  mediaUrls: Readonly<Record<string, string>>,
): string | null {
  if (token.shape !== "portrait" || token.entityId === null) {
    return null;
  }
  const owner = entities.find((item) => item.id === token.entityId);
  if (!owner) {
    return defaultTokenDataUrl(token.label, token.entityId);
  }
  return tokenArtUrl(owner, mediaUrls);
}

function BoardToken({
  token,
  unitSize,
  selected,
  artUrl,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  token: BattlegroundToken;
  unitSize: number;
  selected: boolean;
  artUrl: string | null;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId) => void;
}) {
  const sizePx = Math.max(unitSize * token.scale, 44);
  const stamp = isStampToken(token);
  const shapeClass =
    token.shape === "square" ? "token-shape is-square" : token.shape === "circle" ? "token-shape is-circle" : null;
  const tokenClass = [
    "token",
    selected ? "is-selected" : null,
    stamp ? "is-stamp" : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  return (
    <button
      type="button"
      className={tokenClass}
      style={{
        left: `${String(token.x * 100)}%`,
        top: `${String(token.y * 100)}%`,
        width: `${String(sizePx)}px`,
      }}
      onPointerDown={(event) => onPointerDown(event, token.id)}
      onPointerMove={(event) => onPointerMove(event, token.id)}
      onPointerUp={(event) => onTokenPointerUpSafe(event, token.id, onPointerUp)}
      onPointerCancel={(event) => onTokenPointerUpSafe(event, token.id, onPointerUp)}
    >
      {shapeClass && token.color ? (
        <span className={shapeClass} style={{ background: token.color }} />
      ) : (
        <img className="token-art" src={artUrl ?? defaultTokenDataUrl(token.label || "?", "stamp")} alt="" />
      )}
      {token.label.length > 0 ? <span className="token-name">{token.label}</span> : null}
    </button>
  );
}

function onTokenPointerUpSafe(
  event: ReactPointerEvent<HTMLButtonElement>,
  tokenId: TokenId,
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId) => void,
): void {
  onPointerUp(event, tokenId);
}

function TokenFloatControls({
  token,
  unitSize,
  onGrow,
  onShrink,
  onRemove,
}: {
  token: BattlegroundToken;
  unitSize: number;
  onGrow: () => void;
  onShrink: () => void;
  onRemove: () => void;
}) {
  const sizePx = unitSize * token.scale;
  return (
    <div
      className="token-float-controls"
      style={{
        left: `calc(${String(token.x * 100)}% + ${String(sizePx / 2 + 8)}px)`,
        top: `${String(token.y * 100)}%`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" aria-label="Increase token size" onClick={onGrow}>
        +
      </button>
      <button
        type="button"
        aria-label="Decrease token size"
        disabled={token.scale <= TOKEN_SCALE_MIN}
        onClick={onShrink}
      >
        −
      </button>
      <button type="button" aria-label="Remove token" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isStampToken(token: BattlegroundToken): boolean {
  return token.shape === "circle" || token.shape === "square";
}

function BoardScaleControls({
  compact = false,
  onPickCard,
}: {
  compact?: boolean;
  onPickCard?: () => void;
}) {
  const { store, snap } = useHost();
  const lastGrid = useRef(snap.encounter?.gridSize ?? GRID_SIZE_DEFAULT);
  if (!snap.session) {
    return null;
  }
  const encounter = snap.encounter;
  if (encounter?.gridSize !== null && encounter?.gridSize !== undefined) {
    lastGrid.current = encounter.gridSize;
  }
  const gridOn = encounter?.gridSize !== null && encounter?.gridSize !== undefined;
  const gridSize = encounter?.gridSize ?? lastGrid.current;
  const tokenSize = encounter?.tokenSize ?? TOKEN_SIZE_DEFAULT;
  return (
    <div className={compact ? "board-scales compact" : "board-scales"}>
      <label className="grid-scale">
        <span>Tokens</span>
        <input
          type="range"
          min={GRID_SIZE_MIN}
          max={GRID_SIZE_MAX}
          step={2}
          value={tokenSize}
          aria-label="Token scale"
          onChange={(event) => store.run(store.setTokenSize(Number(event.target.value)))}
        />
      </label>
      <label className="grid-scale">
        <span className="grid-scale-toggle">
          <input
            type="checkbox"
            checked={gridOn}
            onChange={(event) =>
              store.run(store.setGridSize(event.target.checked ? lastGrid.current : null))
            }
          />
          Grid
        </span>
        <input
          type="range"
          min={GRID_SIZE_MIN}
          max={GRID_SIZE_MAX}
          step={2}
          value={gridSize}
          disabled={!gridOn}
          aria-label="Grid scale"
          onChange={(event) => store.run(store.setGridSize(Number(event.target.value)))}
        />
      </label>
      <div className="board-stamps" role="toolbar" aria-label="Shape stamps">
        {TOKEN_STAMP_COLORS.map((color) => (
          <div key={color} className="board-stamp-column">
            <button
              type="button"
              className="board-stamp is-circle"
              style={{ background: color }}
              aria-label={`Add circle token ${color}`}
              onClick={() => store.run(store.addShapeToken("circle", color))}
            />
            <button
              type="button"
              className="board-stamp is-square"
              style={{ background: color }}
              aria-label={`Add square token ${color}`}
              onClick={() => store.run(store.addShapeToken("square", color))}
            />
          </div>
        ))}
        {onPickCard ? (
          <button type="button" className="board-stamp-add" aria-label="Add card to battleground" onClick={onPickCard}>
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BattlegroundCardPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (entityId: EntityId) => void;
}) {
  const { snap } = useHost();
  const cards = [...snap.entities].sort((a, b) =>
    a.runCard.title.localeCompare(b.runCard.title, undefined, { sensitivity: "base" }),
  );
  return (
    <div className="busy-modal" role="dialog" aria-modal="true" aria-labelledby="bg-card-picker-title" onClick={onClose}>
      <div className="busy-modal-card bg-card-picker" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">Battleground</p>
        <h2 id="bg-card-picker-title">Add a card</h2>
        <p className="muted">Battlemaps replace the map. Everything else becomes a token.</p>
        <ul className="bg-card-picker-list">
          {cards.length === 0 ? (
            <li className="muted">No cards in this campaign yet.</li>
          ) : (
            cards.map((entity) => (
              <li key={entity.id}>
                <button type="button" onClick={() => onPick(entity.id)}>
                  <span>{entity.runCard.title}</span>
                  <em>
                    {entity.runCard.category.length > 0 ? entity.runCard.category : "Uncategorized"}
                  </em>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="card-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

