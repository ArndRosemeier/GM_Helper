import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { GRID_SIZE_DEFAULT, GRID_SIZE_MAX, GRID_SIZE_MIN } from "../host/types";
import { useHost } from "../host/HostContext";
import type { EntityId, TokenId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { useBoardPanZoom } from "./useBoardPanZoom";
import { useCardEncounterDrag } from "./useCardEncounterDrag";
import { createPortal } from "react-dom";

export function TableSurface() {
  const { store, snap } = useHost();
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const camera = useBoardPanZoom(viewport);
  const scene = snap.scene;
  const mapId =
    snap.encounter?.live === true
      ? snap.encounter.mapMediaId
      : (scene?.battleground.mapMediaId ?? null);
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const tokens = (
    snap.encounter?.live === true ? snap.encounter.tokens : (scene?.battleground.tokens ?? [])
  ).filter((token) => token.visible);
  const gridSize = scene?.battleground.gridSize ?? null;
  const tokenSize = scene?.battleground.tokenSize ?? GRID_SIZE_DEFAULT;

  const onTokenPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTokenPointerMove = (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
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

  const onTokenPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="table-surface" data-player-safe="true">
      <div
        ref={viewport}
        className="board-viewport"
        onPointerDown={camera.onPointerDown}
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
          {tokens.map((token) => {
            const owner = snap.entities.find((item) => item.id === token.entityId);
            const art = owner
              ? tokenArtUrl(owner, snap.mediaUrls)
              : defaultTokenDataUrl(token.label, token.entityId);
            return (
              <button
                key={token.id}
                type="button"
                className="token"
                style={{
                  left: `${String(token.x * 100)}%`,
                  top: `${String(token.y * 100)}%`,
                  width: `${String(tokenSize)}px`,
                }}
                onPointerDown={onTokenPointerDown}
                onPointerMove={(event) => onTokenPointerMove(event, token.id)}
                onPointerUp={onTokenPointerUp}
                onPointerCancel={onTokenPointerUp}
              >
                <img className="token-art" src={art} alt="" />
                <span className="token-name">{token.label}</span>
              </button>
            );
          })}
          {tokens.length === 0 && !mapUrl ? (
            <p className="board-empty">No public map yet. Pick the pad up, or tap Lift.</p>
          ) : null}
        </div>
      </div>
      {scene ? <BoardScaleControls compact /> : null}
      <button type="button" className="lift" onClick={() => store.setSurface("gm")}>
        Lift
      </button>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function BoardScaleControls({ compact = false }: { compact?: boolean }) {
  const { store, snap } = useHost();
  const scene = snap.scene;
  if (!scene) {
    return null;
  }
  const lastGrid = useRef(scene.battleground.gridSize ?? GRID_SIZE_DEFAULT);
  if (scene.battleground.gridSize !== null) {
    lastGrid.current = scene.battleground.gridSize;
  }
  const gridOn = scene.battleground.gridSize !== null;
  const gridSize = scene.battleground.gridSize ?? lastGrid.current;
  return (
    <div className={compact ? "board-scales compact" : "board-scales"}>
      <label className="grid-scale">
        <span>Tokens</span>
        <input
          type="range"
          min={GRID_SIZE_MIN}
          max={GRID_SIZE_MAX}
          step={2}
          value={scene.battleground.tokenSize}
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
    </div>
  );
}

function BattlegroundTokenRow({
  entityId,
  label,
  visible,
  art,
  onToggleVisible,
}: {
  entityId: EntityId;
  label: string;
  visible: boolean;
  art: string;
  onToggleVisible: () => void;
}) {
  const drag = useCardEncounterDrag(entityId, label);
  return (
    <li>
      <button
        type="button"
        className="token-row-handle"
        onPointerDown={drag.onPointerDown}
        onClick={() => {
          if (drag.consumeClick()) {
            return;
          }
        }}
      >
        <img className="token-art-mini" src={art} alt="" />
        <span>{label}</span>
      </button>
      <button type="button" onClick={onToggleVisible}>
        {visible ? "Hide from table" : "Show on table"}
      </button>
      {drag.ghost
        ? createPortal(
            <div className="card-drag-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }}>
              {drag.ghost.title}
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}

export function BattlegroundPrep() {
  const { store, snap } = useHost();
  const scene = snap.scene;
  if (!scene) {
    return null;
  }
  return (
    <section className="bg-prep">
      <h3>Battleground</h3>
      <p className="muted">Lay the iPad flat to show only this map. Secrets never render on the table surface.</p>
      <div className="card-actions">
        <button
          type="button"
          onClick={() =>
            store.run(store.sketchBattleground())
          }
        >
          Sketch map
        </button>
        <button type="button" onClick={() => store.setSurface("table")}>
          Preview table
        </button>
      </div>
      <BoardScaleControls />
      <ul className="token-list">
        {scene.battleground.tokens.map((token) => {
          const owner = snap.entities.find((item) => item.id === token.entityId);
          return (
            <BattlegroundTokenRow
              key={token.id}
              entityId={token.entityId}
              label={token.label}
              visible={token.visible}
              art={
                owner
                  ? tokenArtUrl(owner, snap.mediaUrls)
                  : defaultTokenDataUrl(token.label, token.entityId)
              }
              onToggleVisible={() => store.run(store.setTokenVisible(token.id, !token.visible))}
            />
          );
        })}
      </ul>
    </section>
  );
}
