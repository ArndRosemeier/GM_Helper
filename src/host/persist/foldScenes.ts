import { emptyEncounter } from "../encounter";
import type { EncounterState, Scene } from "../types";
import { emptyBattleground } from "../types";
import type { SessionId } from "../ids";

/** Merge scene battlegrounds into per-session encounters, then scenes can be dropped. */
export function foldScenesIntoEncounters(
  scenes: ReadonlyArray<Scene>,
  encounters: ReadonlyArray<EncounterState>,
): EncounterState[] {
  const bySession = new Map<SessionId, Scene[]>();
  for (const scene of scenes) {
    const list = bySession.get(scene.sessionId) ?? [];
    list.push(scene);
    bySession.set(scene.sessionId, list);
  }

  const next = new Map<SessionId, EncounterState>();
  for (const encounter of encounters) {
    next.set(encounter.sessionId, withBoardDefaults(encounter));
  }

  for (const [sessionId, sessionScenes] of bySession) {
    const primary = [...sessionScenes].sort((a, b) => a.order - b.order)[0];
    if (!primary) {
      continue;
    }
    const board = primary.battleground;
    const existing = next.get(sessionId);
    if (existing) {
      const preferExistingTokens = existing.tokens.length > 0;
      next.set(sessionId, {
        ...existing,
        gridSize: board.gridSize,
        tokenSize: board.tokenSize,
        tokens: preferExistingTokens ? existing.tokens : board.tokens,
      });
      continue;
    }
    next.set(sessionId, {
      sessionId,
      participants: [],
      activeIndex: 0,
      mapMediaId: null,
      live: false,
      tokens: board.tokens,
      gridSize: board.gridSize,
      tokenSize: board.tokenSize,
    });
  }

  return [...next.values()].map(withBoardDefaults);
}

export function withBoardDefaults(encounter: EncounterState): EncounterState {
  const fallback = emptyBattleground();
  return {
    ...encounter,
    gridSize: encounter.gridSize,
    tokenSize:
      typeof encounter.tokenSize === "number" && Number.isInteger(encounter.tokenSize)
        ? encounter.tokenSize
        : fallback.tokenSize,
  };
}

export { emptyEncounter };
