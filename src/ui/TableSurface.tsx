import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  TOKEN_SCALE_MIN,
  TOKEN_SIZE_DEFAULT,
  TOKEN_SIZE_MIN,
  TOKEN_STAMP_COLORS,
  STAGING_GROUND_CELLS,
  VEIL_DEFAULT_CELLS,
  tokenSizeFittingGrid,
  type BattlegroundToken,
  type BattlegroundVeil,
  type Entity,
  type StagingGround,
  type VeilKind,
} from "../host/types";
import { combatHpForToken, isNpcCard } from "../host/encounter";
import { activeInitiativeTokenId } from "../host/initiative";
import { snapBoxToGrid, snapPointToGrid, tokenSpanCells } from "../host/gridSnap";
import { useHost } from "../host/HostContext";
import type { EntityId, TokenId, VeilId } from "../host/ids";
import { defaultTokenDataUrl, tokenArtUrl } from "../lib/defaultToken";
import { EntityCard } from "./EntityCard";
import {
  boardPointFromViewport,
  clientPointInViewport,
  clientPointOnBoard,
  useBoardPanZoom,
  type BoardView,
} from "./useBoardPanZoom";
import {
  portraitCoveredByVeils,
  resizeVeilFromEdge,
  veilCellPx,
  type VeilEdge,
} from "../host/veil";
import { useEncounterDice } from "./DiceRoller";
import { InitiativeSidebar, InitiativeTurnMarker } from "./InitiativeSidebar";

const DRAG_THRESHOLD_PX = 8;
const DOUBLE_TAP_MS = 500;
const DOUBLE_TAP_PX = 32;
/** Extra cells of floor and grid beyond the battlemap, in each direction. */
const WORLD_PAD_CELLS = 256;

export function TableSurface() {
  const { store, snap } = useHost();
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const camera = useBoardPanZoom(viewport, boardOriginRef);
  const [selectedTokenId, setSelectedTokenId] = useState<TokenId | null>(null);
  const [selectedVeilId, setSelectedVeilId] = useState<VeilId | null>(null);
  const [selectedStagingGround, setSelectedStagingGround] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [pickingCard, setPickingCard] = useState(false);
  const placeCardAt = useRef<{ x: number; y: number } | null>(null);
  const addCardButton = useRef<HTMLButtonElement>(null);
  const cornerActions = useRef<HTMLDivElement>(null);
  const stampsArea = useRef<HTMLDivElement>(null);
  const boardPointerCount = useRef(0);
  const emptyTapStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const lastEmptyTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTokenTap = useRef<{ tokenId: TokenId; x: number; y: number; time: number } | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; tokenId: TokenId } | null>(null);
  const didDrag = useRef(false);
  const veilDragOrigin = useRef<{ x: number; y: number; veilId: VeilId } | null>(null);
  const didVeilDrag = useRef(false);
  const stagingDragOrigin = useRef<{ x: number; y: number } | null>(null);
  const didStagingDrag = useRef(false);
  const [mapNatural, setMapNatural] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [viewportPx, setViewportPx] = useState<{ width: number; height: number } | null>(null);
  const [stageSetFlash, setStageSetFlash] = useState(false);
  const [setStageConfirmOpen, setSetStageConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [restoreNpcHpConfirmOpen, setRestoreNpcHpConfirmOpen] = useState(false);
  const [combatGlows, setCombatGlows] = useState<
    ReadonlyArray<{ id: string; tokenId: TokenId; kind: "damage" | "heal" }>
  >([]);
  const stageFlashTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (stageFlashTimer.current !== null) {
        window.clearTimeout(stageFlashTimer.current);
      }
    };
  }, []);

  const triggerCombatGlow = (tokenId: TokenId, kind: "damage" | "heal"): void => {
    const id = crypto.randomUUID();
    setCombatGlows((current) => [...current, { id, tokenId, kind }]);
    window.setTimeout(() => {
      setCombatGlows((current) => current.filter((item) => item.id !== id));
    }, 1000);
  };

  const onSetStage = (): void => {
    void store
      .setEncounterStage()
      .then(() => {
        setStageSetFlash(true);
        if (stageFlashTimer.current !== null) {
          window.clearTimeout(stageFlashTimer.current);
        }
        stageFlashTimer.current = window.setTimeout(() => {
          setStageSetFlash(false);
          stageFlashTimer.current = null;
        }, 1400);
      })
      .catch((error: unknown) => {
        store.report(error);
      });
  };

  const onConfirmReset = (): void => {
    setResetConfirmOpen(false);
    store.run(store.resetEncounterBoard());
  };

  const onConfirmRestoreNpcHp = (): void => {
    setRestoreNpcHpConfirmOpen(false);
    store.run(store.restoreAllNpcHitPoints());
  };

  const onSetStagingGround = (): void => {
    const boardNode = board.current;
    const viewportNode = viewport.current;
    if (!boardNode || !viewportNode) {
      store.setError("Battleground board is not mounted");
      return;
    }
    if (stagingGround !== null) {
      setSelectedStagingGround(true);
      setSelectedTokenId(null);
      setSelectedVeilId(null);
      setInspecting(false);
      return;
    }
    const cellPx = veilCellPx(
      snap.tableEncounter?.gridSize ?? null,
      snap.tableEncounter?.tokenSize ?? TOKEN_SIZE_DEFAULT,
    );
    const stagingBoardPx = STAGING_GROUND_CELLS * cellPx;
    const at = pointLeftOfControl(
      cornerActions.current,
      viewportNode,
      boardNode,
      camera.view,
      boardOriginRef.current,
      stagingBoardPx,
    );
    const snapped = snapBoxToGrid(
      at.x,
      at.y,
      boardNode.offsetWidth,
      boardNode.offsetHeight,
      cellPx,
      STAGING_GROUND_CELLS,
      STAGING_GROUND_CELLS,
    );
    store.run(
      store.setStagingGround(snapped.x, snapped.y, boardNode.offsetWidth, boardNode.offsetHeight),
    );
    setSelectedStagingGround(true);
    setSelectedTokenId(null);
    setSelectedVeilId(null);
    setInspecting(false);
  };

  const hasNpcOnBoard = useMemo(
    () =>
      (snap.tableEncounter?.tokens ?? []).some((token) => {
        if (token.entityId === null) {
          return false;
        }
        const owner = snap.entities.find((item) => item.id === token.entityId);
        return owner !== undefined && isNpcCard(owner);
      }),
    [snap.tableEncounter?.tokens, snap.entities],
  );

  const mapId = snap.tableEncounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const tokens = (snap.tableEncounter?.tokens ?? []).filter((token) => token.visible);
  const veils = snap.tableEncounter?.veils ?? [];
  const stagingGround = snap.tableEncounter?.stagingGround ?? null;
  const gridSize = snap.tableEncounter?.gridSize ?? null;
  const unitSize =
    gridSize !== null
      ? tokenSizeFittingGrid(gridSize)
      : (snap.tableEncounter?.tokenSize ?? TOKEN_SIZE_DEFAULT);
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedVeil = veils.find((veil) => veil.id === selectedVeilId) ?? null;
  const selectedHp =
    selected === null
      ? null
      : (() => {
          const owner =
            selected.entityId === null
              ? undefined
              : snap.entities.find((item) => item.id === selected.entityId);
          const hp = combatHpForToken(selected, owner);
          return hp === null ? null : { currentHp: hp.currentHp, maxHp: hp.maxHp };
        })();
  const inspectEntityId = inspecting && selected !== null ? selected.entityId : null;
  const inspectEntity =
    inspectEntityId === null
      ? null
      : (snap.entities.find((item) => item.id === inspectEntityId) ?? null);
  const tokenScaleKey = tokens.map((token) => token.scale).join(",");
  const veilLayoutKey = veils.map((veil) => `${veil.id}:${String(veil.widthCells)}x${String(veil.heightCells)}`).join(",");
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
  const boardWidthPx = boardLayout !== null ? boardLayout.width : (viewportPx === null ? 0 : viewportPx.width);
  const boardHeightPx = boardLayout !== null ? boardLayout.height : (viewportPx === null ? 0 : viewportPx.height);
  const boardReady = boardWidthPx > 0 && boardHeightPx > 0;
  const cellPx = veilCellPx(gridSize, snap.tableEncounter?.tokenSize ?? TOKEN_SIZE_DEFAULT);
  const coveredCardIds = useMemo(
    () =>
      new Set(
        boardReady
          ? tokens
              .filter((token) =>
                portraitCoveredByVeils(token, veils, unitSize, cellPx, boardWidthPx, boardHeightPx),
              )
              .map((token) => token.id)
          : [],
      ),
    [boardReady, tokens, veils, unitSize, cellPx, boardWidthPx, boardHeightPx],
  );
  const coveredTokenKey = useMemo(() => [...coveredCardIds].sort().join(","), [coveredCardIds]);
  const initiativeSyncKey = useMemo(() => {
    const board = snap.tableEncounter;
    if (board === null) {
      return coveredTokenKey;
    }
    const visibility = board.tokens
      .map((token) => `${token.id}:${token.visible ? "1" : "0"}`)
      .join(",");
    return `${visibility}|${coveredTokenKey}`;
  }, [snap.tableEncounter, coveredTokenKey]);
  const dice = useEncounterDice();
  const activeInitiativeId =
    snap.tableEncounter !== null && snap.tableEncounter.initiativeEnabled
      ? activeInitiativeTokenId(snap.tableEncounter)
      : null;
  const activeInitiativeToken =
    activeInitiativeId === null || snap.tableEncounter === null
      ? null
      : (() => {
          const token = snap.tableEncounter.tokens.find((item) => item.id === activeInitiativeId);
          return token !== undefined && token.visible && !coveredCardIds.has(token.id) ? token : null;
        })();

  useEffect(() => {
    const board = snap.tableEncounter;
    if (board === null || !board.initiativeEnabled || !boardReady) {
      return;
    }
    store.run(store.syncInitiativeRolls([...coveredCardIds]));
  }, [
    store,
    snap.tableEncounter,
    snap.entities,
    boardReady,
    initiativeSyncKey,
  ]);

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
    const hasStaging = snap.tableEncounter?.stagingGround !== null;
    if (!node || (gridSize === null && !hasStaging)) {
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
    snap.tableEncounter?.tokenSize,
    snap.tableEncounter?.stagingGround,
    snap.tableEncounter?.tokens.length,
    snap.tableEncounter?.veils.length,
    snap.openedEncounterEntityId,
    tokenScaleKey,
    veilLayoutKey,
    boardLayout?.width,
    boardLayout?.height,
  ]);

  const requireBoardPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const viewportNode = viewport.current;
    const boardNode = board.current;
    if (!viewportNode || !boardNode) {
      store.setError("Battleground board is not mounted");
      return null;
    }
    return clientPointOnBoard(
      viewportNode,
      boardNode,
      camera.view,
      boardOriginRef.current,
      clientX,
      clientY,
    );
  };

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
    const raw = requireBoardPoint(event.clientX, event.clientY);
    if (raw === null) {
      return;
    }
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
      const now = performance.now();
      const previous = lastTokenTap.current;
      if (
        previous !== null &&
        previous.tokenId === tokenId &&
        now - previous.time <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_PX
      ) {
        lastTokenTap.current = null;
        setSelectedTokenId(tokenId);
        setSelectedVeilId(null);
        setSelectedStagingGround(false);
        const token = tokens.find((item) => item.id === tokenId);
        const canInspect =
          token !== undefined &&
          token.entityId !== null &&
          snap.entities.some((item) => item.id === token.entityId);
        if (canInspect) {
          setInspecting(true);
        }
        return;
      }
      lastTokenTap.current = { tokenId, x: event.clientX, y: event.clientY, time: now };
      setSelectedTokenId((current) => (current === tokenId ? null : tokenId));
      setSelectedVeilId(null);
      setSelectedStagingGround(false);
      setInspecting(false);
    }
  };

  const onVeilPointerDown = (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId): void => {
    event.stopPropagation();
    event.preventDefault();
    didVeilDrag.current = false;
    veilDragOrigin.current = { x: event.clientX, y: event.clientY, veilId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onVeilPointerMove = (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const origin = veilDragOrigin.current;
    if (origin !== null && origin.veilId === veilId) {
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        didVeilDrag.current = true;
      }
    }
    if (!didVeilDrag.current) {
      return;
    }
    const node = board.current;
    if (!node) {
      store.setError("Battleground board is not mounted");
      return;
    }
    const raw = requireBoardPoint(event.clientX, event.clientY);
    if (raw === null) {
      return;
    }
    const grid = snap.tableEncounter?.gridSize ?? null;
    if (grid === null) {
      store.run(store.moveVeil(veilId, raw.x, raw.y));
      return;
    }
    const veil = veils.find((item) => item.id === veilId);
    if (!veil) {
      store.setError(`Encounter has no veil ${veilId}`);
      return;
    }
    const snapped = snapBoxToGrid(
      raw.x,
      raw.y,
      node.offsetWidth,
      node.offsetHeight,
      grid,
      veil.widthCells,
      veil.heightCells,
    );
    store.run(store.moveVeil(veilId, snapped.x, snapped.y));
  };

  const onVeilPointerUp = (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    veilDragOrigin.current = null;
    if (!didVeilDrag.current) {
      setSelectedVeilId((current) => (current === veilId ? null : veilId));
      setSelectedTokenId(null);
      setSelectedStagingGround(false);
      setInspecting(false);
    }
  };

  const onVeilResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onVeilResizePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    veilId: VeilId,
    edge: VeilEdge,
  ): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const node = board.current;
    const raw = requireBoardPoint(event.clientX, event.clientY);
    if (!node || raw === null) {
      store.setError("Battleground board is not mounted");
      return;
    }
    const veil = veils.find((item) => item.id === veilId);
    if (!veil) {
      store.setError(`Encounter has no veil ${veilId}`);
      return;
    }
    const next = resizeVeilFromEdge(
      veil,
      edge,
      raw,
      node.offsetWidth,
      node.offsetHeight,
      cellPx,
    );
    store.run(store.resizeVeil(next.id, next.x, next.y, next.widthCells, next.heightCells));
  };

  const onVeilResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onStagingPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    event.preventDefault();
    didStagingDrag.current = false;
    stagingDragOrigin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onStagingPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const origin = stagingDragOrigin.current;
    if (origin !== null) {
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        didStagingDrag.current = true;
      }
    }
    if (!didStagingDrag.current) {
      return;
    }
    const node = board.current;
    if (!node) {
      store.setError("Battleground board is not mounted");
      return;
    }
    const raw = requireBoardPoint(event.clientX, event.clientY);
    if (raw === null) {
      return;
    }
    const cellPx = veilCellPx(
      snap.tableEncounter?.gridSize ?? null,
      snap.tableEncounter?.tokenSize ?? TOKEN_SIZE_DEFAULT,
    );
    const snapped = snapBoxToGrid(
      raw.x,
      raw.y,
      node.offsetWidth,
      node.offsetHeight,
      cellPx,
      STAGING_GROUND_CELLS,
      STAGING_GROUND_CELLS,
    );
    store.run(store.moveStagingGround(snapped.x, snapped.y, node.offsetWidth, node.offsetHeight));
  };

  const onStagingPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stagingDragOrigin.current = null;
    if (!didStagingDrag.current) {
      setSelectedStagingGround((current) => !current);
      setSelectedTokenId(null);
      setSelectedVeilId(null);
      setInspecting(false);
    }
  };

  const openCardPicker = (at: { x: number; y: number } | null): void => {
    placeCardAt.current = at;
    setPickingCard(true);
  };

  const closeCardPicker = (): void => {
    placeCardAt.current = null;
    setPickingCard(false);
  };

  const onBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (isEmptyBoardTarget(target, event.currentTarget)) {
      setSelectedTokenId(null);
      setSelectedVeilId(null);
      setSelectedStagingGround(false);
      setInspecting(false);
    }
    camera.onPointerDown(event);
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    boardPointerCount.current += 1;
    if (boardPointerCount.current > 1) {
      emptyTapStart.current = null;
      lastEmptyTap.current = null;
      return;
    }
    if (!snap.session || !isEmptyBoardTarget(target, event.currentTarget)) {
      emptyTapStart.current = null;
      return;
    }
    emptyTapStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onBoardPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    camera.onPointerMove(event);
    const start = emptyTapStart.current;
    if (start === null || start.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      emptyTapStart.current = null;
      lastEmptyTap.current = null;
    }
  };

  const onBoardPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    camera.onPointerUp(event);
    if (boardPointerCount.current > 0) {
      boardPointerCount.current -= 1;
    }
    const start = emptyTapStart.current;
    emptyTapStart.current = null;
    if (start === null || start.pointerId !== event.pointerId || !snap.session) {
      return;
    }
    const now = performance.now();
    const previous = lastEmptyTap.current;
    if (
      previous !== null &&
      now - previous.time <= DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_PX
    ) {
      lastEmptyTap.current = null;
      const at = requireBoardPoint(event.clientX, event.clientY);
      if (at === null) {
        return;
      }
      openCardPicker(at);
      return;
    }
    lastEmptyTap.current = { x: event.clientX, y: event.clientY, time: now };
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
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
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
          {boardReady && stagingGround !== null ? (
            <BoardStagingGround
              staging={stagingGround}
              cellPx={cellPx}
              selected={selectedStagingGround}
              onPointerDown={onStagingPointerDown}
              onPointerMove={onStagingPointerMove}
              onPointerUp={onStagingPointerUp}
            />
          ) : null}
          {tokens.filter(isStampToken).map((token) => (
            <BoardToken
              key={token.id}
              token={token}
              unitSize={unitSize}
              selected={token.id === selectedTokenId}
              downed={false}
              artUrl={tokenArtFor(token, snap.entities, snap.mediaUrls)}
              onPointerDown={onTokenPointerDown}
              onPointerMove={onTokenPointerMove}
              onPointerUp={onTokenPointerUp}
            />
          ))}
          {boardReady
            ? veils
                .filter((veil) => veil.kind === "veil")
                .map((veil) => (
                  <BoardVeil
                    key={veil.id}
                    veil={veil}
                    cellPx={cellPx}
                    selected={veil.id === selectedVeilId}
                    onPointerDown={onVeilPointerDown}
                    onPointerMove={onVeilPointerMove}
                    onPointerUp={onVeilPointerUp}
                    onResizePointerDown={onVeilResizePointerDown}
                    onResizePointerMove={onVeilResizePointerMove}
                    onResizePointerUp={onVeilResizePointerUp}
                  />
                ))
            : null}
          {tokens
            .filter((token) => !isStampToken(token) && !coveredCardIds.has(token.id))
            .map((token) => {
              const owner =
                token.entityId === null
                  ? undefined
                  : snap.entities.find((item) => item.id === token.entityId);
              const hp = combatHpForToken(token, owner);
              return (
                <BoardToken
                  key={token.id}
                  token={token}
                  unitSize={unitSize}
                  selected={token.id === selectedTokenId}
                  downed={hp !== null && hp.currentHp <= 0}
                  artUrl={tokenArtFor(token, snap.entities, snap.mediaUrls)}
                  onPointerDown={onTokenPointerDown}
                  onPointerMove={onTokenPointerMove}
                  onPointerUp={onTokenPointerUp}
                />
              );
            })}
          {selected !== null && !coveredCardIds.has(selected.id) ? (
            <TokenFloatControls
              token={selected}
              unitSize={unitSize}
              hp={selectedHp}
              canInspect={
                selected.entityId !== null &&
                snap.entities.some((item) => item.id === selected.entityId)
              }
              onDamage={
                selectedHp === null
                  ? undefined
                  : () => {
                      dice.openCombatRoll({
                        kind: "damage",
                        subject: selected.label,
                        onResult: (total) => {
                          triggerCombatGlow(selected.id, "damage");
                          store.run(store.adjustTokenCurrentHp(selected.id, -total));
                        },
                      });
                    }
              }
              onHeal={
                selectedHp === null
                  ? undefined
                  : () => {
                      dice.openCombatRoll({
                        kind: "heal",
                        subject: selected.label,
                        onResult: (total) => {
                          triggerCombatGlow(selected.id, "heal");
                          store.run(store.adjustTokenCurrentHp(selected.id, total));
                        },
                      });
                    }
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
          {boardReady
            ? veils
                .filter((veil) => veil.kind === "fog")
                .map((veil) => (
                  <BoardVeil
                    key={veil.id}
                    veil={veil}
                    cellPx={cellPx}
                    selected={veil.id === selectedVeilId}
                    onPointerDown={onVeilPointerDown}
                    onPointerMove={onVeilPointerMove}
                    onPointerUp={onVeilPointerUp}
                    onResizePointerDown={onVeilResizePointerDown}
                    onResizePointerMove={onVeilResizePointerMove}
                    onResizePointerUp={onVeilResizePointerUp}
                  />
                ))
            : null}
          {selectedVeil !== null ? (
            <VeilFloatControls
              veil={selectedVeil}
              cellPx={cellPx}
              onRemove={() => {
                store.run(store.removeVeil(selectedVeil.id));
                setSelectedVeilId(null);
              }}
            />
          ) : null}
          {activeInitiativeToken !== null ? (
            <InitiativeTurnMarker
              tokenX={activeInitiativeToken.x}
              tokenY={activeInitiativeToken.y}
              unitSize={unitSize}
              tokenScale={activeInitiativeToken.scale}
            />
          ) : null}
          {combatGlows.map((glow) => {
            const token = snap.tableEncounter?.tokens.find((item) => item.id === glow.tokenId);
            if (token === undefined) {
              return null;
            }
            return (
              <CombatTokenGlow
                key={glow.id}
                tokenX={token.x}
                tokenY={token.y}
                unitSize={unitSize}
                tokenScale={token.scale}
                kind={glow.kind}
              />
            );
          })}
          {tokens.length === 0 && !mapUrl ? (
            <p className="board-empty">No public map yet. Pick the pad up, or tap Lift.</p>
          ) : null}
        </div>
      </div>
      {dice.stage}
      {snap.session ? (
        <BoardScaleControls
          compact
          stampsAreaRef={stampsArea}
          onAddShape={(shape, color) => {
            const viewportNode = viewport.current;
            const boardNode = board.current;
            if (!viewportNode || !boardNode) {
              store.setError("Battleground board is not mounted");
              return;
            }
            const at = pointBesideControl(
              stampsArea.current,
              viewportNode,
              boardNode,
              camera.view,
              boardOriginRef.current,
              unitSize,
            );
            store.run(store.addShapeToken(shape, color, at.x, at.y));
          }}
          onAddCover={(kind) => {
            const viewportNode = viewport.current;
            const boardNode = board.current;
            if (!viewportNode || !boardNode) {
              store.setError("Battleground board is not mounted");
              return;
            }
            const at = pointBesideControl(
              stampsArea.current,
              viewportNode,
              boardNode,
              camera.view,
              boardOriginRef.current,
              VEIL_DEFAULT_CELLS * cellPx,
            );
            store.run(store.addVeil(kind, at.x, at.y));
          }}
        />
      ) : null}
      {dice.hud}
      <InitiativeSidebar coveredTokenIds={coveredCardIds} />
      <div ref={cornerActions} className="table-corner-actions">
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
          className="board-set-stage"
          aria-label="Set stage"
          title="Set stage"
          onClick={() => setSetStageConfirmOpen(true)}
        >
          ⚑
        </button>
        <button
          type="button"
          className="board-reset"
          aria-label="Reset encounter board"
          title="Reset board"
          disabled={snap.tableEncounter?.stage === null}
          onClick={() => setResetConfirmOpen(true)}
        >
          ↻
        </button>
        <button type="button" className="lift" aria-label="Lift" onClick={() => store.setSurface("gm")}>
          ×
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
          className="board-set-staging"
          aria-label="Set staging ground"
          title="Set staging ground"
          onClick={onSetStagingGround}
        >
          ▦
        </button>
        <button
          type="button"
          className="board-restore-npc-hp"
          aria-label="Restore NPC hit points"
          title="Restore NPC hit points"
          disabled={!hasNpcOnBoard}
          onClick={() => setRestoreNpcHpConfirmOpen(true)}
        >
          ♥
        </button>
        <button
          type="button"
          ref={addCardButton}
          className="board-add-card"
          aria-label="Add card to battleground"
          title="Add card"
          onClick={() => openCardPicker(null)}
        >
          <CardAddIcon />
        </button>
      </div>
      {pickingCard
        ? createPortal(
            <BattlegroundCardPicker
              onClose={closeCardPicker}
              onPick={(entityId) => {
                const viewportNode = viewport.current;
                const boardNode = board.current;
                const at =
                  placeCardAt.current ??
                  pointBesideControl(
                    addCardButton.current,
                    viewportNode,
                    boardNode,
                    camera.view,
                    boardOriginRef.current,
                    unitSize,
                  );
                store.run(store.placeCardOnBattleground(entityId, at));
                closeCardPicker();
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
                  inspectTokenId={selected.id}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {stageSetFlash
        ? createPortal(
            <div className="stage-set-toast" aria-live="polite" aria-atomic="true">
              <p>Stage set</p>
            </div>,
            document.body,
          )
        : null}
      {setStageConfirmOpen
        ? createPortal(
            <BoardConfirmModal
              titleId="set-stage-title"
              title="Set stage?"
              body={
                snap.tableEncounter?.stage === null
                  ? "Save the current board layout as the stage. Reset will restore this layout later."
                  : "Replace the saved stage with the current board layout. Reset will restore this layout later."
              }
              confirmLabel="Set stage"
              confirmClassName="board-set-stage-confirm"
              onCancel={() => setSetStageConfirmOpen(false)}
              onConfirm={() => {
                setSetStageConfirmOpen(false);
                onSetStage();
              }}
            />,
            document.body,
          )
        : null}
      {restoreNpcHpConfirmOpen
        ? createPortal(
            <BoardConfirmModal
              titleId="restore-npc-hp-title"
              title="Restore NPC hit points?"
              body="Set every NPC on this encounter back to full hit points. Player hit points are not changed."
              confirmLabel="Restore hit points"
              confirmClassName="board-restore-npc-hp-confirm"
              onCancel={() => setRestoreNpcHpConfirmOpen(false)}
              onConfirm={onConfirmRestoreNpcHp}
            />,
            document.body,
          )
        : null}
      {resetConfirmOpen
        ? createPortal(
            <BoardConfirmModal
              titleId="reset-board-title"
              title="Reset board?"
              body="Restore the saved stage, turn initiative off, and reset NPC hit points."
              confirmLabel="Reset"
              confirmClassName="board-reset-confirm"
              onCancel={() => setResetConfirmOpen(false)}
              onConfirm={onConfirmReset}
            />,
            document.body,
          )
        : null}
      {dice.overlays}
    </div>
  );
}

function CombatTokenGlow({
  tokenX,
  tokenY,
  unitSize,
  tokenScale,
  kind,
}: {
  tokenX: number;
  tokenY: number;
  unitSize: number;
  tokenScale: number;
  kind: "damage" | "heal";
}) {
  const sizePx = unitSize * tokenScale;
  const style: CSSProperties & { "--token-art-size": string } = {
    left: `${String(tokenX * 100)}%`,
    top: `${String(tokenY * 100)}%`,
    "--token-art-size": `${String(sizePx)}px`,
  };
  return (
    <div
      className={kind === "damage" ? "combat-token-glow is-damage" : "combat-token-glow is-heal"}
      style={style}
      aria-hidden="true"
    >
      <span className="combat-token-glow-ring" />
    </div>
  );
}

function BoardConfirmModal({
  titleId,
  title,
  body,
  confirmLabel,
  confirmClassName,
  onCancel,
  onConfirm,
}: {
  titleId: string;
  title: string;
  body: string;
  confirmLabel: string;
  confirmClassName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="busy-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
    >
      <div
        className="busy-modal-card"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Encounter</p>
        <h2 id={titleId}>{title}</h2>
        <p>{body}</p>
        <div className="card-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={confirmClassName} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
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
  downed,
  artUrl,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  token: BattlegroundToken;
  unitSize: number;
  selected: boolean;
  downed: boolean;
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
    downed ? "is-downed" : null,
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
        <span className="token-art-wrap">
          <img className="token-art" src={artUrl ?? defaultTokenDataUrl(token.label || "?", "stamp")} alt="" />
          {downed ? <span className="token-down-overlay" aria-hidden="true" /> : null}
        </span>
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
  onDamage,
  onHeal,
  onGrow,
  onShrink,
  onInspect,
  onRemove,
}: {
  token: BattlegroundToken;
  unitSize: number;
  hp: { currentHp: number; maxHp: number } | null;
  canInspect: boolean;
  onDamage?: () => void;
  onHeal?: () => void;
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
        {onDamage !== undefined ? (
          <button
            type="button"
            className="token-combat-btn is-damage"
            aria-label={`Damage ${token.label}`}
            onClick={onDamage}
          >
            <BloodDropIcon />
          </button>
        ) : null}
        {onHeal !== undefined ? (
          <button
            type="button"
            className="token-combat-btn is-heal"
            aria-label={`Heal ${token.label}`}
            onClick={onHeal}
          >
            <HealCrossIcon />
          </button>
        ) : null}
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

function BloodDropIcon() {
  return (
    <svg className="token-combat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2C9.2 7.6 6 10.8 6 14a6 6 0 1 0 12 0c0-3.2-3.2-6.4-6-12z" fill="currentColor" />
    </svg>
  );
}

function HealCrossIcon() {
  return (
    <svg className="token-combat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z" fill="currentColor" />
    </svg>
  );
}

function CardAddIcon() {
  return (
    <svg className="board-add-card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8h6M9 12h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function isStampToken(token: BattlegroundToken): boolean {
  return token.shape === "circle" || token.shape === "square";
}

const VEIL_EDGES: ReadonlyArray<VeilEdge> = ["n", "e", "s", "w"];

function veilResizeLabel(kind: VeilKind, edge: VeilEdge): string {
  const piece = kind === "fog" ? "fog" : "veil";
  if (edge === "n") {
    return `Resize ${piece} from top`;
  }
  if (edge === "e") {
    return `Resize ${piece} from right`;
  }
  if (edge === "s") {
    return `Resize ${piece} from bottom`;
  }
  return `Resize ${piece} from left`;
}

function BoardStagingGround({
  staging,
  cellPx,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  staging: StagingGround;
  cellPx: number;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const stagingStyle: CSSProperties = {
    left: `${String(staging.x * 100)}%`,
    top: `${String(staging.y * 100)}%`,
    width: `${String(STAGING_GROUND_CELLS * cellPx)}px`,
    height: `${String(STAGING_GROUND_CELLS * cellPx)}px`,
  };
  return (
    <div
      className={selected ? "staging-ground is-selected" : "staging-ground"}
      style={stagingStyle}
      role="img"
      aria-label="Player staging ground"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

function BoardVeil({
  veil,
  cellPx,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: {
  veil: BattlegroundVeil;
  cellPx: number;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizePointerMove: (event: ReactPointerEvent<HTMLButtonElement>, veilId: VeilId, edge: VeilEdge) => void;
  onResizePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const veilStyle: CSSProperties = {
    left: `${String(veil.x * 100)}%`,
    top: `${String(veil.y * 100)}%`,
    width: `${String(veil.widthCells * cellPx)}px`,
    height: `${String(veil.heightCells * cellPx)}px`,
  };
  const fog = veil.kind === "fog";
  const veilClass = [
    "veil",
    fog ? "is-fog" : null,
    selected ? "is-selected" : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  return (
    <div
      className={veilClass}
      style={veilStyle}
      role="img"
      aria-label={fog ? "Fog of war" : "Veil"}
      onPointerDown={(event) => onPointerDown(event, veil.id)}
      onPointerMove={(event) => onPointerMove(event, veil.id)}
      onPointerUp={(event) => onPointerUp(event, veil.id)}
      onPointerCancel={(event) => onPointerUp(event, veil.id)}
    >
      {fog ? (
        <span className="veil-fog-clip">
          <span className="veil-fog is-back" />
          <span className="veil-fog" />
        </span>
      ) : null}
      {selected
        ? VEIL_EDGES.map((edge) => (
            <button
              key={edge}
              type="button"
              className={`veil-handle is-${edge}`}
              aria-label={veilResizeLabel(veil.kind, edge)}
              onPointerDown={onResizePointerDown}
              onPointerMove={(event) => {
                event.stopPropagation();
                onResizePointerMove(event, veil.id, edge);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                onResizePointerUp(event);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                onResizePointerUp(event);
              }}
            />
          ))
        : null}
    </div>
  );
}

function VeilFloatControls({
  veil,
  cellPx,
  onRemove,
}: {
  veil: BattlegroundVeil;
  cellPx: number;
  onRemove: () => void;
}) {
  const controlStyle: CSSProperties & { "--token-ctrl-size": string } = {
    left: `calc(${String(veil.x * 100)}% + ${String((veil.widthCells * cellPx) / 2 + 8)}px)`,
    top: `${String(veil.y * 100)}%`,
    "--token-ctrl-size": `${String(cellPx * 0.8)}px`,
  };
  return (
    <div
      className="token-float-controls"
      style={controlStyle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="token-float-buttons">
        <button type="button" aria-label={veil.kind === "fog" ? "Remove fog" : "Remove veil"} onClick={onRemove}>
          ×
        </button>
      </div>
    </div>
  );
}

function pointLeftOfControl(
  control: HTMLElement | null,
  viewport: HTMLElement | null,
  board: HTMLDivElement | null,
  view: BoardView,
  layoutOrigin: { x: number; y: number },
  boxBoardPx: number,
): { x: number; y: number } {
  if (!control || !viewport || !board) {
    throw new Error("Battleground board is not mounted");
  }
  if (!(boxBoardPx > 0)) {
    throw new Error("Staging ground size must be positive");
  }
  const rect = control.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Board corner controls have no size");
  }
  const mid = clientPointInViewport(viewport, rect.left, rect.top + rect.height / 2);
  const gapPx = 8;
  const boxViewportHalfW = (boxBoardPx * view.scale) / 2;
  return boardPointFromViewport(
    board,
    view,
    layoutOrigin,
    mid.x - gapPx - boxViewportHalfW,
    mid.y,
  );
}

function pointBesideControl(
  control: HTMLElement | null,
  viewport: HTMLElement | null,
  board: HTMLDivElement | null,
  view: BoardView,
  layoutOrigin: { x: number; y: number },
  itemBoardPx: number,
): { x: number; y: number } {
  if (!control || !viewport || !board) {
    throw new Error("Battleground board is not mounted");
  }
  if (!(itemBoardPx > 0)) {
    throw new Error("Token size must be positive");
  }
  const rect = control.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error("Board stamp control has no size");
  }
  const mid = clientPointInViewport(viewport, rect.right, rect.top + rect.height / 2);
  const gapPx = 8;
  return boardPointFromViewport(
    board,
    view,
    layoutOrigin,
    mid.x + gapPx + (itemBoardPx * view.scale) / 2,
    mid.y,
  );
}

function isEmptyBoardTarget(target: EventTarget, viewport: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target === viewport ||
    target.classList.contains("board") ||
    target.classList.contains("board-map") ||
    target.classList.contains("grid") ||
    target.classList.contains("board-empty")
  );
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
  stampsAreaRef,
  onAddShape,
  onAddCover,
}: {
  compact?: boolean;
  stampsAreaRef?: RefObject<HTMLDivElement | null>;
  onAddShape: (shape: "circle" | "square", color: string) => void;
  onAddCover: (kind: VeilKind) => void;
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
      <div ref={stampsAreaRef} className="board-stamps" role="toolbar" aria-label="Shape stamps">
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
        <div className="board-stamp-column">
          <button
            type="button"
            className="board-stamp-veil"
            aria-label="Add veil"
            onClick={() => onAddCover("veil")}
          >
            <span className="board-stamp-veil-mark" />
          </button>
          <button
            type="button"
            className="board-stamp-fog"
            aria-label="Add fog of war"
            onClick={() => onAddCover("fog")}
          >
            <span className="board-stamp-fog-mark" />
          </button>
        </div>
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

