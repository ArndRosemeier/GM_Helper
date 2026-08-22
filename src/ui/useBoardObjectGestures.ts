import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { snapBoxToGrid, snapPointToGrid, tokenSpanCells } from "../host/gridSnap";
import type { TokenId, VeilId } from "../host/ids";
import type { BattlegroundToken, BattlegroundVeil } from "../host/types";
import { STAGING_GROUND_CELLS } from "../host/types";
import {
  beginBoardGesture,
  endBoardGesture,
} from "../host/boardGestureGate";
import { resizeVeilFromEdge, type VeilEdge } from "../host/veil";

const DRAG_THRESHOLD_PX = 8;

export type LiveTokenDrag = {
  kind: "token";
  tokenId: TokenId;
  x: number;
  y: number;
};

export type LiveVeilDrag = {
  kind: "veil";
  veilId: VeilId;
  x: number;
  y: number;
};

export type LiveVeilResize = {
  kind: "veil-resize";
  veilId: VeilId;
  x: number;
  y: number;
  widthCells: number;
  heightCells: number;
};

export type LiveStagingDrag = {
  kind: "staging";
  x: number;
  y: number;
};

export type LiveBoardDrag = LiveTokenDrag | LiveVeilDrag | LiveVeilResize | LiveStagingDrag;

type TokenSession = {
  kind: "token";
  pointerId: number;
  tokenId: TokenId;
  scale: number;
  originClientX: number;
  originClientY: number;
  dragging: boolean;
  x: number;
  y: number;
};

type VeilSession = {
  kind: "veil";
  pointerId: number;
  veilId: VeilId;
  widthCells: number;
  heightCells: number;
  originClientX: number;
  originClientY: number;
  dragging: boolean;
  x: number;
  y: number;
};

type VeilResizeSession = {
  kind: "veil-resize";
  pointerId: number;
  veil: BattlegroundVeil;
  edge: VeilEdge;
};

type StagingSession = {
  kind: "staging";
  pointerId: number;
  originClientX: number;
  originClientY: number;
  dragging: boolean;
  x: number;
  y: number;
};

type Session = TokenSession | VeilSession | VeilResizeSession | StagingSession;

export function useBoardObjectGestures(args: {
  requireBoardPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  boardSize: () => { width: number; height: number } | null;
  gridSize: () => number | null;
  cellPx: () => number;
  findToken: (tokenId: TokenId) => BattlegroundToken | undefined;
  findVeil: (veilId: VeilId) => BattlegroundVeil | undefined;
  getStaging: () => { x: number; y: number } | null;
  onCommitToken: (tokenId: TokenId, x: number, y: number) => void | Promise<void>;
  onCommitVeil: (veilId: VeilId, x: number, y: number) => void | Promise<void>;
  onCommitVeilResize: (
    veilId: VeilId,
    x: number,
    y: number,
    widthCells: number,
    heightCells: number,
  ) => void | Promise<void>;
  onCommitStaging: (
    x: number,
    y: number,
    boardWidth: number,
    boardHeight: number,
  ) => void | Promise<void>;
  onTokenTap: (tokenId: TokenId, clientX: number, clientY: number) => void;
  onVeilTap: (veilId: VeilId) => void;
  onStagingTap: () => void;
  onError: (message: string) => void;
}): {
  liveDrag: LiveBoardDrag | null;
  onTokenPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, tokenId: TokenId) => void;
  onVeilPointerDown: (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId) => void;
  onVeilResizePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    veilId: VeilId,
    edge: VeilEdge,
  ) => void;
  onStagingPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const [liveDrag, setLiveDrag] = useState<LiveBoardDrag | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const gestureHeld = useRef(false);
  const argsRef = useRef(args);
  argsRef.current = args;

  const holdGesture = (): void => {
    if (gestureHeld.current) {
      return;
    }
    gestureHeld.current = true;
    beginBoardGesture();
  };

  const releaseGesture = (): void => {
    if (!gestureHeld.current) {
      return;
    }
    gestureHeld.current = false;
    endBoardGesture();
  };

  const detachWindow = useRef((): void => undefined);

  const clearLiveDragAfterCommit = (work: void | Promise<void>): void => {
    void Promise.resolve(work).finally(() => {
      setLiveDrag(null);
    });
  };

  const endSession = useRef((clientX: number, clientY: number): void => {
    const session = sessionRef.current;
    sessionRef.current = null;
    detachWindow.current();
    releaseGesture();
    if (session === null) {
      setLiveDrag(null);
      return;
    }
    const api = argsRef.current;
    if (session.kind === "token") {
      if (!session.dragging) {
        setLiveDrag(null);
        api.onTokenTap(session.tokenId, clientX, clientY);
        return;
      }
      setLiveDrag({ kind: "token", tokenId: session.tokenId, x: session.x, y: session.y });
      clearLiveDragAfterCommit(api.onCommitToken(session.tokenId, session.x, session.y));
      return;
    }
    if (session.kind === "veil") {
      if (!session.dragging) {
        setLiveDrag(null);
        api.onVeilTap(session.veilId);
        return;
      }
      setLiveDrag({ kind: "veil", veilId: session.veilId, x: session.x, y: session.y });
      clearLiveDragAfterCommit(api.onCommitVeil(session.veilId, session.x, session.y));
      return;
    }
    if (session.kind === "veil-resize") {
      setLiveDrag({
        kind: "veil-resize",
        veilId: session.veil.id,
        x: session.veil.x,
        y: session.veil.y,
        widthCells: session.veil.widthCells,
        heightCells: session.veil.heightCells,
      });
      clearLiveDragAfterCommit(
        api.onCommitVeilResize(
          session.veil.id,
          session.veil.x,
          session.veil.y,
          session.veil.widthCells,
          session.veil.heightCells,
        ),
      );
      return;
    }
    if (!session.dragging) {
      setLiveDrag(null);
      api.onStagingTap();
      return;
    }
    setLiveDrag({ kind: "staging", x: session.x, y: session.y });
    const size = api.boardSize();
    if (size === null) {
      setLiveDrag(null);
      api.onError("Battleground board is not mounted");
      return;
    }
    clearLiveDragAfterCommit(
      api.onCommitStaging(session.x, session.y, size.width, size.height),
    );
  }).current;

  const onWindowMove = useRef((event: PointerEvent): void => {
    const session = sessionRef.current;
    if (session === null || event.pointerId !== session.pointerId) {
      return;
    }
    const api = argsRef.current;
    if (session.kind === "token" || session.kind === "veil" || session.kind === "staging") {
      if (!session.dragging) {
        const travel = Math.hypot(event.clientX - session.originClientX, event.clientY - session.originClientY);
        if (travel < DRAG_THRESHOLD_PX) {
          return;
        }
        session.dragging = true;
      }
    }
    event.preventDefault();
    const size = api.boardSize();
    const raw = api.requireBoardPoint(event.clientX, event.clientY);
    if (size === null || raw === null) {
      return;
    }
    if (session.kind === "token") {
      const gridSize = api.gridSize();
      const next =
        gridSize === null
          ? raw
          : snapPointToGrid(raw.x, raw.y, size.width, size.height, gridSize, tokenSpanCells(session.scale));
      session.x = next.x;
      session.y = next.y;
      setLiveDrag({ kind: "token", tokenId: session.tokenId, x: next.x, y: next.y });
      return;
    }
    if (session.kind === "veil") {
      const gridSize = api.gridSize();
      const next =
        gridSize === null
          ? raw
          : snapBoxToGrid(
              raw.x,
              raw.y,
              size.width,
              size.height,
              gridSize,
              session.widthCells,
              session.heightCells,
            );
      session.x = next.x;
      session.y = next.y;
      setLiveDrag({ kind: "veil", veilId: session.veilId, x: next.x, y: next.y });
      return;
    }
    if (session.kind === "veil-resize") {
      const next = resizeVeilFromEdge(
        session.veil,
        session.edge,
        raw,
        size.width,
        size.height,
        api.cellPx(),
      );
      session.veil = next;
      setLiveDrag({
        kind: "veil-resize",
        veilId: next.id,
        x: next.x,
        y: next.y,
        widthCells: next.widthCells,
        heightCells: next.heightCells,
      });
      return;
    }
    const cell = api.cellPx();
    const snapped = snapBoxToGrid(
      raw.x,
      raw.y,
      size.width,
      size.height,
      cell,
      STAGING_GROUND_CELLS,
      STAGING_GROUND_CELLS,
    );
    session.x = snapped.x;
    session.y = snapped.y;
    setLiveDrag({ kind: "staging", x: snapped.x, y: snapped.y });
  }).current;

  const onWindowUp = useRef((event: PointerEvent): void => {
    const session = sessionRef.current;
    if (session === null || event.pointerId !== session.pointerId) {
      return;
    }
    endSession(event.clientX, event.clientY);
  }).current;

  detachWindow.current = (): void => {
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", onWindowUp, true);
    window.removeEventListener("pointercancel", onWindowUp, true);
  };

  useEffect(() => {
    return () => {
      detachWindow.current();
      sessionRef.current = null;
      releaseGesture();
    };
  }, []);

  const attachWindow = (pointerId: number): void => {
    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", onWindowUp, true);
    window.addEventListener("pointercancel", onWindowUp, true);
    void pointerId;
  };

  const onTokenPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    tokenId: TokenId,
  ): void => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const token = argsRef.current.findToken(tokenId);
    if (token === undefined) {
      argsRef.current.onError(`Encounter has no token ${tokenId}`);
      return;
    }
    if (sessionRef.current !== null) {
      endSession(event.clientX, event.clientY);
    }
    holdGesture();
    sessionRef.current = {
      kind: "token",
      pointerId: event.pointerId,
      tokenId,
      scale: token.scale,
      originClientX: event.clientX,
      originClientY: event.clientY,
      dragging: false,
      x: token.x,
      y: token.y,
    };
    attachWindow(event.pointerId);
  };

  const onVeilPointerDown = (event: ReactPointerEvent<HTMLDivElement>, veilId: VeilId): void => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const veil = argsRef.current.findVeil(veilId);
    if (veil === undefined) {
      argsRef.current.onError(`Encounter has no veil ${veilId}`);
      return;
    }
    if (sessionRef.current !== null) {
      endSession(event.clientX, event.clientY);
    }
    holdGesture();
    sessionRef.current = {
      kind: "veil",
      pointerId: event.pointerId,
      veilId,
      widthCells: veil.widthCells,
      heightCells: veil.heightCells,
      originClientX: event.clientX,
      originClientY: event.clientY,
      dragging: false,
      x: veil.x,
      y: veil.y,
    };
    attachWindow(event.pointerId);
  };

  const onVeilResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    veilId: VeilId,
    edge: VeilEdge,
  ): void => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const veil = argsRef.current.findVeil(veilId);
    if (veil === undefined) {
      argsRef.current.onError(`Encounter has no veil ${veilId}`);
      return;
    }
    if (sessionRef.current !== null) {
      endSession(event.clientX, event.clientY);
    }
    holdGesture();
    sessionRef.current = {
      kind: "veil-resize",
      pointerId: event.pointerId,
      veil: { ...veil },
      edge,
    };
    setLiveDrag({
      kind: "veil-resize",
      veilId: veil.id,
      x: veil.x,
      y: veil.y,
      widthCells: veil.widthCells,
      heightCells: veil.heightCells,
    });
    attachWindow(event.pointerId);
  };

  const onStagingPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const staging = argsRef.current.getStaging();
    if (staging === null) {
      argsRef.current.onError("Encounter has no staging ground");
      return;
    }
    if (sessionRef.current !== null) {
      endSession(event.clientX, event.clientY);
    }
    holdGesture();
    sessionRef.current = {
      kind: "staging",
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      dragging: false,
      x: staging.x,
      y: staging.y,
    };
    attachWindow(event.pointerId);
  };

  return {
    liveDrag,
    onTokenPointerDown,
    onVeilPointerDown,
    onVeilResizePointerDown,
    onStagingPointerDown,
  };
}

export function applyLiveToken(
  token: BattlegroundToken,
  liveDrag: LiveBoardDrag | null,
): BattlegroundToken {
  if (liveDrag?.kind === "token" && liveDrag.tokenId === token.id) {
    return { ...token, x: liveDrag.x, y: liveDrag.y };
  }
  return token;
}

export function applyLiveVeil(
  veil: BattlegroundVeil,
  liveDrag: LiveBoardDrag | null,
): BattlegroundVeil {
  if (liveDrag?.kind === "veil" && liveDrag.veilId === veil.id) {
    return { ...veil, x: liveDrag.x, y: liveDrag.y };
  }
  if (liveDrag?.kind === "veil-resize" && liveDrag.veilId === veil.id) {
    return {
      ...veil,
      x: liveDrag.x,
      y: liveDrag.y,
      widthCells: liveDrag.widthCells,
      heightCells: liveDrag.heightCells,
    };
  }
  return veil;
}

export function applyLiveStaging(
  staging: { x: number; y: number; cellWidth: number; cellHeight: number },
  liveDrag: LiveBoardDrag | null,
): { x: number; y: number; cellWidth: number; cellHeight: number } {
  if (liveDrag?.kind === "staging") {
    return { ...staging, x: liveDrag.x, y: liveDrag.y };
  }
  return staging;
}
