import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  TOKEN_SCALE_MIN,
  TOKEN_SIZE_DEFAULT,
  TOKEN_SIZE_MIN,
  TOKEN_STAMP_COLORS,
  tokenSizeFittingGrid,
  type BattlegroundToken,
  type EncounterParticipant,
  type Entity,
} from "../host/types";
import { combatHpForParticipant } from "../host/encounter";
import { snapPointToGrid, tokenSpanCells } from "../host/gridSnap";
import { useHost } from "../host/HostContext";
import type { EntityId, TokenId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { EntityCard } from "./EntityCard";
import { useBoardPanZoom } from "./useBoardPanZoom";

const DRAG_THRESHOLD_PX = 8;
/** Extra cells of floor and grid beyond the battlemap, in each direction. */
const WORLD_PAD_CELLS = 256;

export function TableSurface() {
  const { store, snap } = useHost();
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const camera = useBoardPanZoom(viewport, boardOriginRef);
  const [selectedTokenId, setSelectedTokenId] = useState<TokenId | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [pickingCard, setPickingCard] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; tokenId: TokenId } | null>(null);
  const didDrag = useRef(false);
  const [mapNatural, setMapNatural] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [viewportPx, setViewportPx] = useState<{ width: number; height: number } | null>(null);

  const mapId = snap.tableEncounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const tokens = (snap.tableEncounter?.tokens ?? []).filter((token) => token.visible);
  const gridSize = snap.tableEncounter?.gridSize ?? null;
  const unitSize =
    gridSize !== null
      ? tokenSizeFittingGrid(gridSize)
      : (snap.tableEncounter?.tokenSize ?? TOKEN_SIZE_DEFAULT);
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedHp =
    selected === null ? null : tokenCombatHp(selected, snap.tableEncounter?.participants ?? [], snap.entities);
  const inspectEntityId = inspecting && selected !== null ? selected.entityId : null;
  const inspectEntity =
    inspectEntityId === null
      ? null
      : (snap.entities.find((item) => item.id === inspectEntityId) ?? null);
  const tokenScaleKey = tokens.map((token) => token.scale).join(",");
  const worldPadPx = (gridSize ?? GRID_SIZE_DEFAULT) * WORLD_PAD_CELLS;
  const worldLayerStyle: CSSProperties = {
    left: `-${String(worldPadPx)}px`,
    top: `-${String(worldPadPx)}px`,
    width: `calc(100% + ${String(worldPadPx * 2)}px)`,
    height: `calc(100% + ${String(worldPadPx * 2)}px)`,
  };
  const boardLayout =
    mapUrl && mapNatural !== null && mapNatural.url === mapUrl
      ? battlemapBoardLayout(viewportPx, mapNatural)
      : null;
  const boardLeft = boardLayout === null ? 0 : boardLayout.left;
  const boardTop = boardLayout === null ? 0 : boardLayout.top;
  boardOriginRef.current = { x: boardLeft, y: boardTop };
  const boardStyle: CSSProperties & { "--board-zoom": string } = {
    width: boardLayout === null ? undefined : `${String(boardLayout.width)}px`,
    height: boardLayout === null ? undefined : `${String(boardLayout.height)}px`,
    left: `${String(boardLeft)}px`,
    top: `${String(boardTop)}px`,
    transform: `translate(${String(camera.view.x)}px, ${String(camera.view.y)}px) scale(${String(camera.view.scale)})`,
    "--board-zoom": String(camera.view.scale),
  };

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) {
      return;
    }
    const apply = (): void => {
      setViewportPx({ width: node.clientWidth, height: node.clientHeight });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const node = board.current;
    const gridSize = snap.tableEncounter?.gridSize ?? null;
    if (!node || gridSize === null) {
      return;
    }
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    store.run(store.snapEncounterTokens(width, height));
  }, [
    store,
    snap.tableEncounter?.gridSize,
    snap.tableEncounter?.tokens.length,
    snap.openedEncounterEntityId,
    tokenScaleKey,
    boardLayout?.width,
    boardLayout?.height,
  ]);

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
    const raw = clientPointOnBoard(node, event.clientX, event.clientY);
    const gridSize = snap.tableEncounter?.gridSize ?? null;
    if (gridSize === null) {
      store.run(store.moveToken(tokenId, raw.x, raw.y));
      return;
    }
    const token = tokens.find((item) => item.id === tokenId);
    if (!token) {
      store.setError(`Encounter has no token ${tokenId}`);
      return;
    }
    const snapped = snapPointToGrid(
      raw.x,
      raw.y,
      node.offsetWidth,
      node.offsetHeight,
      gridSize,
      tokenSpanCells(token.scale),
    );
    store.run(store.moveToken(tokenId, snapped.x, snapped.y));
  };

  const onTokenPointerUp = (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    if (!didDrag.current) {
      setSelectedTokenId((current) => (current === tokenId ? null : tokenId));
      setInspecting(false);
    }
  };

  return (
    <div className="table-surface" data-player-safe="true">
      <div
        ref={viewport}
        className="board-viewport"
        style={{
          backgroundSize: `${String(256 * camera.view.scale)}px ${String(256 * camera.view.scale)}px`,
          backgroundPosition: `${String(camera.view.x + boardLeft)}px ${String(camera.view.y + boardTop)}px`,
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            event.target === event.currentTarget ||
            target.classList.contains("board") ||
            target.classList.contains("board-map") ||
            target.classList.contains("grid")
          ) {
            setSelectedTokenId(null);
            setInspecting(false);
          }
          camera.onPointerDown(event);
        }}
        onPointerMove={camera.onPointerMove}
        onPointerUp={camera.onPointerUp}
        onPointerCancel={camera.onPointerUp}
      >
        <div
          ref={board}
          className="board"
          style={boardStyle}
        >
          {mapUrl ? (
            <img
              className="board-map"
              src={mapUrl}
              alt=""
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth < 1 || image.naturalHeight < 1) {
                  store.setError("Battlemap image has no size");
                  return;
                }
                setMapNatural({
                  url: mapUrl,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                });
              }}
              onError={() => store.setError("Battlemap image failed to load")}
            />
          ) : null}
          {gridSize !== null ? (
            <div
              className="grid"
              style={{
                ...worldLayerStyle,
                backgroundSize: `${String(gridSize)}px ${String(gridSize)}px`,
              }}
            />
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
              hp={selectedHp}
              canInspect={
                selected.entityId !== null &&
                snap.entities.some((item) => item.id === selected.entityId)
              }
              onGrow={() => store.run(store.adjustTokenScale(selected.id, 1))}
              onShrink={() => store.run(store.adjustTokenScale(selected.id, -1))}
              onInspect={() => setInspecting(true)}
              onRemove={() => {
                store.run(store.removeToken(selected.id));
                setSelectedTokenId(null);
                setInspecting(false);
              }}
            />
          ) : null}
          {tokens.length === 0 && !mapUrl ? (
            <p className="board-empty">No public map yet. Pick the pad up, or tap Lift.</p>
          ) : null}
        </div>
      </div>
      {snap.session ? (
        <BoardScaleControls
          compact
          onPickCard={() => setPickingCard(true)}
          onAddShape={(shape, color) => {
            const viewportNode = viewport.current;
            const boardNode = board.current;
            if (!viewportNode || !boardNode) {
              store.setError("Battleground board is not mounted");
              return;
            }
            const at = viewportCenterOnBoard(viewportNode, boardNode);
            store.run(store.addShapeToken(shape, color, at.x, at.y));
          }}
        />
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
      {inspectEntity !== null && selected !== null
        ? createPortal(
            <div
              className="battlefield-card-modal"
              role="dialog"
              aria-modal="true"
              aria-label={inspectEntity.runCard.title}
              onClick={() => setInspecting(false)}
            >
              <div
                className="battlefield-card-modal-card"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="battlefield-card-modal-close"
                  aria-label="Close card"
                  onClick={() => setInspecting(false)}
                >
                  ×
                </button>
                <EntityCard
                  entity={inspectEntity}
                  revealSecrets
                  expanded
                  onToggleExpand={() => undefined}
                  inspectParticipantId={selected.participantId ?? undefined}
                />
              </div>
            </div>,
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

function tokenCombatHp(
  token: BattlegroundToken,
  participants: ReadonlyArray<EncounterParticipant>,
  entities: ReadonlyArray<Entity>,
): { currentHp: number; maxHp: number } | null {
  if (token.participantId === null) {
    return null;
  }
  const participant = participants.find((item) => item.id === token.participantId);
  if (!participant) {
    return null;
  }
  const owner = entities.find((item) => item.id === participant.entityId);
  return combatHpForParticipant(participant, owner);
}

function hpFillRatio(currentHp: number, maxHp: number): number {
  if (maxHp <= 0) {
    return currentHp > 0 ? 1 : 0;
  }
  if (currentHp <= 0) {
    return 0;
  }
  return Math.min(1, currentHp / maxHp);
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
  const sizePx = unitSize * token.scale;
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
  const tokenStyle: CSSProperties & { "--token-art-size": string } = {
    left: `${String(token.x * 100)}%`,
    top: `${String(token.y * 100)}%`,
    "--token-art-size": `${String(sizePx)}px`,
  };
  return (
    <button
      type="button"
      className={tokenClass}
      style={tokenStyle}
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

function TokenHpMeter({
  currentHp,
  maxHp,
  name,
}: {
  currentHp: number;
  maxHp: number;
  name: string;
}) {
  const ratio = hpFillRatio(currentHp, maxHp);
  return (
    <div
      className="token-hp-meter"
      role="meter"
      aria-label={`Hit points for ${name}`}
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-valuenow={currentHp}
    >
      <div className="token-hp-meter-fill" style={{ height: `${String(ratio * 100)}%` }} />
    </div>
  );
}

function TokenFloatControls({
  token,
  unitSize,
  hp,
  canInspect,
  onGrow,
  onShrink,
  onInspect,
  onRemove,
}: {
  token: BattlegroundToken;
  unitSize: number;
  hp: { currentHp: number; maxHp: number } | null;
  canInspect: boolean;
  onGrow: () => void;
  onShrink: () => void;
  onInspect: () => void;
  onRemove: () => void;
}) {
  const sizePx = unitSize * token.scale;
  const controlStyle: CSSProperties & { "--token-ctrl-size": string } = {
    left: `calc(${String(token.x * 100)}% + ${String(sizePx / 2 + 8)}px)`,
    top: `${String(token.y * 100)}%`,
    "--token-ctrl-size": `${String(sizePx * 0.8)}px`,
  };
  return (
    <div
      className="token-float-controls"
      style={controlStyle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {hp !== null ? (
        <TokenHpMeter currentHp={hp.currentHp} maxHp={hp.maxHp} name={token.label} />
      ) : null}
      <div className="token-float-buttons">
        {canInspect ? (
          <button type="button" aria-label={`Open card for ${token.label}`} onClick={onInspect}>
            i
          </button>
        ) : null}
        <button type="button" aria-label="Increase token size" onClick={onGrow}>
          +
        </button>
        <button type="button" aria-label="Remove token" onClick={onRemove}>
          ×
        </button>
        <button
          type="button"
          aria-label="Decrease token size"
          disabled={token.scale <= TOKEN_SCALE_MIN}
          onClick={onShrink}
        >
          −
        </button>
      </div>
    </div>
  );
}

function isStampToken(token: BattlegroundToken): boolean {
  return token.shape === "circle" || token.shape === "square";
}

function clientPointOnBoard(
  board: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Battleground board has no size");
  }
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function viewportCenterOnBoard(viewport: HTMLElement, board: HTMLElement): { x: number; y: number } {
  const viewRect = viewport.getBoundingClientRect();
  if (!(viewRect.width > 0) || !(viewRect.height > 0)) {
    throw new Error("Battleground viewport has no size");
  }
  return clientPointOnBoard(board, viewRect.left + viewRect.width / 2, viewRect.top + viewRect.height / 2);
}

function battlemapBoardLayout(
  viewport: { width: number; height: number } | null,
  map: { width: number; height: number } | null,
): { width: number; height: number; left: number; top: number } | null {
  if (viewport === null || map === null) {
    return null;
  }
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    return null;
  }
  const size = containInBox(viewport.width, viewport.height, map.width, map.height);
  return {
    width: size.width,
    height: size.height,
    left: (viewport.width - size.width) / 2,
    top: (viewport.height - size.height) / 2,
  };
}

function containInBox(
  boxWidth: number,
  boxHeight: number,
  contentWidth: number,
  contentHeight: number,
): { width: number; height: number } {
  if (!(contentWidth > 0) || !(contentHeight > 0)) {
    throw new Error("Battlemap image has no size");
  }
  const scale = Math.min(boxWidth / contentWidth, boxHeight / contentHeight);
  return { width: contentWidth * scale, height: contentHeight * scale };
}

function BoardScaleControls({
  compact = false,
  onPickCard,
  onAddShape,
}: {
  compact?: boolean;
  onPickCard?: () => void;
  onAddShape: (shape: "circle" | "square", color: string) => void;
}) {
  const { store, snap } = useHost();
  const lastGrid = useRef(snap.tableEncounter?.gridSize ?? GRID_SIZE_DEFAULT);
  if (!snap.session) {
    return null;
  }
  const encounter = snap.tableEncounter;
  if (encounter?.gridSize !== null && encounter?.gridSize !== undefined) {
    lastGrid.current = encounter.gridSize;
  }
  const gridOn = encounter?.gridSize !== null && encounter?.gridSize !== undefined;
  const gridSize = encounter?.gridSize ?? lastGrid.current;
  const tokenSize = encounter?.tokenSize ?? TOKEN_SIZE_DEFAULT;
  return (
    <div className={compact ? "board-scales compact" : "board-scales"}>
      {gridOn ? null : (
        <label className="grid-scale">
          <span>Tokens</span>
          <input
            type="range"
            min={TOKEN_SIZE_MIN}
            max={GRID_SIZE_MAX}
            step={2}
            value={tokenSize}
            aria-label="Token scale"
            onChange={(event) => store.run(store.setTokenSize(Number(event.target.value)))}
          />
        </label>
      )}
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
              onClick={() => onAddShape("circle", color)}
            />
            <button
              type="button"
              className="board-stamp is-square"
              style={{ background: color }}
              aria-label={`Add square token ${color}`}
              onClick={() => onAddShape("square", color)}
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

