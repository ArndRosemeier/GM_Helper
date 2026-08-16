import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { GRID_SIZE_DEFAULT, GRID_SIZE_MAX, GRID_SIZE_MIN } from "../host/types";
import { useHost } from "../host/HostContext";
import type { TokenId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { useBoardPanZoom } from "./useBoardPanZoom";

export function TableSurface() {
  const { store, snap } = useHost();
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const camera = useBoardPanZoom(viewport);
  const scene = snap.scene;
  const mapId = scene?.battleground.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const tokens = (scene?.battleground.tokens ?? []).filter((token) => token.visible);
  const gridSize = scene?.battleground.gridSize ?? GRID_SIZE_DEFAULT;

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
          className="board"
          style={{
            transform: `translate(${String(camera.view.x)}px, ${String(camera.view.y)}px) scale(${String(camera.view.scale)})`,
            backgroundImage: mapUrl ? `url(${mapUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "#2a241c",
          }}
        >
          <div className="grid" style={{ backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }} />
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
                  width: `${String(gridSize)}px`,
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
      <label className="grid-scale">
        <input
          type="range"
          min={GRID_SIZE_MIN}
          max={GRID_SIZE_MAX}
          step={2}
          value={gridSize}
          aria-label="Grid scale"
          onChange={(event) => store.run(store.setGridSize(Number(event.target.value)))}
        />
      </label>
      <button type="button" className="lift" onClick={() => store.setSurface("gm")}>
        Lift
      </button>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
      <ul className="token-list">
        {scene.battleground.tokens.map((token) => {
          const owner = snap.entities.find((item) => item.id === token.entityId);
          const art = owner
            ? tokenArtUrl(owner, snap.mediaUrls)
            : defaultTokenDataUrl(token.label, token.entityId);
          return (
            <li key={token.id}>
              <img className="token-art-mini" src={art} alt="" />
              <span>{token.label}</span>
              <button type="button" onClick={() => store.run(store.setTokenVisible(token.id, !token.visible))}>
                {token.visible ? "Hide from table" : "Show on table"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
