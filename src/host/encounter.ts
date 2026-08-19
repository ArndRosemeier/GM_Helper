import { cardVisibleForSession } from "./cardModel";
import {
  newTokenId,
  newVeilId,
  type EntityId,
  type MediaId,
  type SessionId,
} from "./ids";
import { cloneTracks, combatStatsFrom, tracksFrom } from "./runCard";
import {
  emptyBattleground,
  ENCOUNTER_TAG,
  NPC_CATEGORY,
  PLAYER_CATEGORY,
  STAGING_GROUND_CELLS,
  type StagingGround,
  type BattlegroundToken,
  type EncounterBoard,
  type EncounterBlock,
  type EncounterStageSnapshot,
  type EncounterState,
  type Entity,
  type RunCard,
} from "./types";

export function emptyEncounterBoard(): EncounterBoard {
  const board = emptyBattleground();
  return {
    activeIndex: 0,
    mapMediaId: null,
    live: false,
    tokens: [],
    veils: [],
    gridSize: board.gridSize,
    tokenSize: board.tokenSize,
    initiativeEnabled: false,
    initiativeOrder: [],
    stage: null,
    stagingGround: null,
  };
}

export function emptyEncounter(sessionId: SessionId): EncounterState {
  return { ...emptyEncounterBoard(), sessionId };
}

export function boardOf(state: EncounterBoard): EncounterBoard {
  return {
    activeIndex: state.activeIndex,
    mapMediaId: state.mapMediaId,
    live: state.live,
    tokens: state.tokens,
    veils: state.veils,
    gridSize: state.gridSize,
    tokenSize: state.tokenSize,
    initiativeEnabled: state.initiativeEnabled,
    initiativeOrder: state.initiativeOrder,
    stage: state.stage,
    stagingGround: state.stagingGround,
  };
}

export function isEncounterCard(entity: Entity): boolean {
  return entity.runCard.tags.includes(ENCOUNTER_TAG);
}

export function isPlayerCard(entity: Entity): boolean {
  return entity.runCard.category === PLAYER_CATEGORY;
}

export function isNpcCard(entity: Entity): boolean {
  return entity.runCard.category === NPC_CATEGORY;
}

export function isFighterEntity(entity: Entity): boolean {
  return isPlayerCard(entity) || isNpcCard(entity);
}

export function isFighterToken(token: BattlegroundToken, entities: ReadonlyArray<Entity>): boolean {
  if (token.entityId === null) {
    return false;
  }
  const entity = entities.find((item) => item.id === token.entityId);
  return entity !== undefined && isFighterEntity(entity);
}

/** Portrait tokens linked to a card in this encounter. */
export function cardTokens(board: EncounterBoard): BattlegroundToken[] {
  return board.tokens.filter((token) => token.entityId !== null);
}

export type ResolvedCombatHp = {
  maxHp: number;
  currentHp: number;
  currentOwnedBy: "card" | "token";
};

export function combatHpForToken(
  token: BattlegroundToken,
  entity: Entity | undefined,
): ResolvedCombatHp | null {
  if (entity === undefined || token.entityId === null) {
    return null;
  }
  if (!isPlayerCard(entity) && !isNpcCard(entity)) {
    return null;
  }
  const stats = combatStatsFrom(entity.runCard);
  if (stats === null) {
    throw new Error(`Card “${entity.runCard.title}” has no combat stats`);
  }
  if (isPlayerCard(entity)) {
    if (stats.currentHp === null) {
      throw new Error(`Player “${entity.runCard.title}” is missing current HP`);
    }
    return { maxHp: stats.maxHp, currentHp: stats.currentHp, currentOwnedBy: "card" };
  }
  const currentHp = instanceCurrentHpFor(entity, token.currentHp);
  if (currentHp === null) {
    throw new Error(`NPC “${token.label}” in this encounter is missing current HP`);
  }
  return { maxHp: stats.maxHp, currentHp, currentOwnedBy: "token" };
}

/** NPC instances own current HP on the token; players keep it on the card. */
export function instanceCurrentHpFor(
  entity: Entity,
  existingInstanceHp: number | null,
  previousCardCurrentHp: number | null = null,
): number | null {
  if (!isNpcCard(entity)) {
    return null;
  }
  if (existingInstanceHp !== null) {
    return existingInstanceHp;
  }
  if (previousCardCurrentHp !== null) {
    return previousCardCurrentHp;
  }
  const stats = combatStatsFrom(entity.runCard);
  if (stats === null) {
    throw new Error(`NPC “${entity.runCard.title}” has no combat stats`);
  }
  return stats.maxHp;
}

export function withTokenHpOwnership(
  board: EncounterBoard,
  entity: Entity,
  previousCardCurrentHp: number | null = null,
): EncounterBoard {
  let changed = false;
  const tokens = board.tokens.map((token) => {
    if (token.entityId !== entity.id) {
      return token;
    }
    const currentHp = instanceCurrentHpFor(entity, token.currentHp, previousCardCurrentHp);
    if (token.currentHp === currentHp) {
      return token;
    }
    changed = true;
    return { ...token, currentHp };
  });
  if (!changed) {
    return board;
  }
  return { ...board, tokens };
}

export function fillTokenCurrentHp(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
): EncounterBoard {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let changed = false;
  const tokens = board.tokens.map((token) => {
    if (token.entityId === null) {
      return token;
    }
    const owner = byId.get(token.entityId);
    if (owner === undefined) {
      return token;
    }
    const currentHp = instanceCurrentHpFor(owner, token.currentHp);
    if (token.currentHp === currentHp) {
      return token;
    }
    changed = true;
    return { ...token, currentHp };
  });
  if (!changed) {
    return board;
  }
  return { ...board, tokens };
}

export function restoreAllNpcHp(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
): EncounterBoard {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let changed = false;
  const tokens = board.tokens.map((token) => {
    if (token.entityId === null) {
      return token;
    }
    const owner = byId.get(token.entityId);
    if (owner === undefined || !isNpcCard(owner)) {
      return token;
    }
    const stats = combatStatsFrom(owner.runCard);
    if (stats === null) {
      return token;
    }
    if (token.currentHp === stats.maxHp) {
      return token;
    }
    changed = true;
    return { ...token, currentHp: stats.maxHp };
  });
  if (!changed) {
    return board;
  }
  return { ...board, tokens };
}

export function stagingGroundAt(
  x: number,
  y: number,
  boardWidthPx: number,
  boardHeightPx: number,
  cellPx: number,
): StagingGround {
  if (!(boardWidthPx > 0) || !(boardHeightPx > 0)) {
    throw new Error("Board size must be positive");
  }
  if (!(cellPx > 0)) {
    throw new Error(`Cell size must be positive, got ${String(cellPx)}`);
  }
  return {
    x,
    y,
    cellWidth: cellPx / boardWidthPx,
    cellHeight: cellPx / boardHeightPx,
  };
}

export function spawnPointInStagingGround(
  playerIndex: number,
  staging: StagingGround,
): { x: number; y: number } {
  const col = playerIndex % STAGING_GROUND_CELLS;
  const row = Math.floor(playerIndex / STAGING_GROUND_CELLS);
  const topLeftX = staging.x - (STAGING_GROUND_CELLS / 2) * staging.cellWidth;
  const topLeftY = staging.y - (STAGING_GROUND_CELLS / 2) * staging.cellHeight;
  return {
    x: topLeftX + (col + 0.5) * staging.cellWidth,
    y: topLeftY + (row + 0.5) * staging.cellHeight,
  };
}

export function repositionPlayersInStagingGround(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
  sessionId: SessionId,
): EncounterBoard {
  if (board.stagingGround === null) {
    return board;
  }
  const players = playerEntitiesForSession(entities, sessionId);
  const updated = new Map<BattlegroundToken["id"], BattlegroundToken>();
  let playerIndex = 0;
  for (const player of players) {
    const token = board.tokens.find((item) => item.entityId === player.id);
    if (token === undefined) {
      continue;
    }
    const at = spawnPointInStagingGround(playerIndex, board.stagingGround);
    playerIndex += 1;
    if (token.x !== at.x || token.y !== at.y) {
      updated.set(token.id, { ...token, x: at.x, y: at.y });
    }
  }
  if (updated.size === 0) {
    return board;
  }
  return {
    ...board,
    tokens: board.tokens.map((token) => updated.get(token.id) ?? token),
  };
}

export function withFilledEncounterCardHp(
  entities: ReadonlyArray<Entity>,
): Entity[] {
  return entities.map((entity) => {
    const board = encounterFromCard(entity);
    if (board === null) {
      return entity;
    }
    const next = fillTokenCurrentHp(board, entities);
    if (next === board) {
      return entity;
    }
    return { ...entity, runCard: withEncounterBlock(entity.runCard, next) };
  });
}

export function encounterBlockFrom(card: RunCard): EncounterBlock | null {
  for (const block of card.blocks) {
    if (block.kind === "encounter") {
      return block;
    }
  }
  return null;
}

export function encounterFromCard(entity: Entity): EncounterBoard | null {
  const block = encounterBlockFrom(entity.runCard);
  if (block === null) {
    return null;
  }
  return boardOf(block);
}

export function withEncounterBlock(card: RunCard, board: EncounterBoard): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "encounter");
  const block: EncounterBlock = { kind: "encounter", ...boardOf(board) };
  return { ...card, blocks: [...without, block] };
}

export function encounterCardTitle(mapTitle: string | null): string {
  return `${mapTitle ?? "Free"} encounter`;
}

export function playerEntitiesForSession(
  entities: ReadonlyArray<Entity>,
  sessionId: SessionId,
): Entity[] {
  return entities.filter(
    (entity) => isPlayerCard(entity) && cardVisibleForSession(entity, sessionId),
  );
}

export function captureStageSnapshot(board: EncounterBoard): EncounterStageSnapshot {
  return {
    mapMediaId: board.mapMediaId,
    gridSize: board.gridSize,
    tokenSize: board.tokenSize,
    tokens: board.tokens.map((token) => ({
      ...token,
      tracks: cloneTracks(token.tracks),
      conditions: [...token.conditions],
    })),
    veils: board.veils.map((veil) => ({ ...veil })),
    stagingGround:
      board.stagingGround === null
        ? null
        : {
            x: board.stagingGround.x,
            y: board.stagingGround.y,
            cellWidth: board.stagingGround.cellWidth,
            cellHeight: board.stagingGround.cellHeight,
          },
  };
}

export function cloneStageSnapshot(stage: EncounterStageSnapshot): EncounterStageSnapshot {
  return {
    mapMediaId: stage.mapMediaId,
    gridSize: stage.gridSize,
    tokenSize: stage.tokenSize,
    tokens: stage.tokens.map((token) => ({
      ...token,
      tracks: cloneTracks(token.tracks),
      conditions: [...token.conditions],
    })),
    veils: stage.veils.map((veil) => ({ ...veil })),
    stagingGround:
      stage.stagingGround === null
        ? null
        : {
            x: stage.stagingGround.x,
            y: stage.stagingGround.y,
            cellWidth: stage.stagingGround.cellWidth,
            cellHeight: stage.stagingGround.cellHeight,
          },
  };
}

function resetTokenForStage(
  token: BattlegroundToken,
  entities: ReadonlyArray<Entity>,
): BattlegroundToken {
  const base: BattlegroundToken = {
    ...token,
    tracks: cloneTracks(token.tracks),
    conditions: [...token.conditions],
    initiativeRoll: null,
    initiativeBonus: null,
  };
  if (token.entityId === null) {
    return base;
  }
  const entity = entities.find((item) => item.id === token.entityId);
  if (entity === undefined || !isNpcCard(entity)) {
    return base;
  }
  return { ...base, currentHp: instanceCurrentHpFor(entity, null) };
}

export function ensurePlayerTokens(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
  sessionId: SessionId,
): EncounterBoard {
  const players = playerEntitiesForSession(entities, sessionId);
  const present = new Set(
    board.tokens
      .filter((token) => token.entityId !== null)
      .map((token) => token.entityId as EntityId),
  );
  let tokens = [...board.tokens];
  let layoutIndex = cardTokens({ ...board, tokens }).length;
  let playerIndex = 0;
  for (const player of players) {
    if (present.has(player.id)) {
      continue;
    }
    const at =
      board.stagingGround === null
        ? null
        : spawnPointInStagingGround(playerIndex, board.stagingGround);
    tokens.push(tokenFromEntity(player, layoutIndex, board.live, at));
    layoutIndex += 1;
    playerIndex += 1;
  }
  if (tokens.length === board.tokens.length) {
    return board;
  }
  return { ...board, tokens };
}

export function applyStageReset(
  board: EncounterBoard,
  stage: EncounterStageSnapshot,
  entities: ReadonlyArray<Entity>,
  sessionId: SessionId,
): EncounterBoard {
  const tokens = stage.tokens.map((token) => resetTokenForStage(token, entities));
  const next: EncounterBoard = {
    ...board,
    mapMediaId: stage.mapMediaId,
    gridSize: stage.gridSize,
    tokenSize: stage.tokenSize,
    tokens,
    veils: stage.veils.map((veil) => ({ ...veil })),
    stagingGround:
      stage.stagingGround === null
        ? null
        : {
            x: stage.stagingGround.x,
            y: stage.stagingGround.y,
            cellWidth: stage.stagingGround.cellWidth,
            cellHeight: stage.stagingGround.cellHeight,
          },
    activeIndex: 0,
    initiativeEnabled: false,
    initiativeOrder: [],
  };
  return ensurePlayerTokens(next, entities, sessionId);
}

export function battlemapTitleForMedia(
  entities: ReadonlyArray<Entity>,
  mapMediaId: MediaId | null,
): string | null {
  if (mapMediaId === null) {
    return null;
  }
  for (const entity of entities) {
    if (isEncounterCard(entity)) {
      continue;
    }
    const ownsMap = entity.runCard.blocks.some(
      (block) => block.kind === "media" && block.mediaId === mapMediaId,
    );
    if (ownsMap) {
      return entity.runCard.title;
    }
  }
  return null;
}

export function cloneEncounterBoard(board: EncounterBoard): EncounterBoard {
  const tokens = board.tokens.map((token) => ({
    ...token,
    id: newTokenId(),
    tracks: cloneTracks(token.tracks),
    conditions: [...token.conditions],
    initiativeRoll: null,
    initiativeBonus: null,
  }));
  const veils = board.veils.map((veil) => ({
    ...veil,
    id: newVeilId(),
  }));
  return {
    ...boardOf(board),
    stagingGround:
      board.stagingGround === null
        ? null
        : {
            x: board.stagingGround.x,
            y: board.stagingGround.y,
            cellWidth: board.stagingGround.cellWidth,
            cellHeight: board.stagingGround.cellHeight,
          },
    stage: board.stage === null ? null : cloneStageSnapshot(board.stage),
    tokens,
    veils,
    initiativeEnabled: false,
    initiativeOrder: [],
    activeIndex: 0,
  };
}

export function scrubEntityFromBoard(board: EncounterBoard, entityId: EntityId): EncounterBoard {
  const removedTokenIds = new Set(
    board.tokens.filter((token) => token.entityId === entityId).map((token) => token.id),
  );
  const tokens = board.tokens.filter((token) => token.entityId !== entityId);
  const initiativeOrder = board.initiativeOrder.filter((id) => !removedTokenIds.has(id));
  if (
    tokens.length === board.tokens.length &&
    initiativeOrder.length === board.initiativeOrder.length
  ) {
    return board;
  }
  const activeId = board.initiativeOrder[board.activeIndex];
  const activeIndex =
    activeId === undefined ? 0 : Math.max(0, initiativeOrder.indexOf(activeId));
  const cardCount = cardTokens({ ...board, tokens }).length;
  return {
    ...board,
    activeIndex: cardCount === 0 ? 0 : Math.min(activeIndex, Math.max(initiativeOrder.length - 1, 0)),
    initiativeOrder,
    tokens,
  };
}

export function cardReferencedMediaIds(card: RunCard): MediaId[] {
  const ids: MediaId[] = [];
  for (const block of card.blocks) {
    if (block.kind === "media") {
      ids.push(block.mediaId);
    }
    if (block.kind === "encounter" && block.mapMediaId !== null) {
      ids.push(block.mapMediaId);
    }
  }
  return ids;
}

export function emptyTokenInstanceFields(): Pick<
  BattlegroundToken,
  "currentHp" | "initiativeRoll" | "initiativeBonus" | "tracks" | "conditions"
> {
  return {
    currentHp: null,
    initiativeRoll: null,
    initiativeBonus: null,
    tracks: [],
    conditions: [],
  };
}

export function tokenFromEntity(
  entity: Entity,
  index: number,
  visible: boolean,
  at: { x: number; y: number } | null,
): BattlegroundToken {
  return {
    id: newTokenId(),
    entityId: entity.id,
    x: at === null ? 0.18 + (index % 5) * 0.14 : at.x,
    y: at === null ? 0.22 + Math.floor(index / 5) * 0.16 : at.y,
    visible,
    label: entity.runCard.title,
    scale: 1,
    shape: "portrait",
    color: null,
    currentHp: instanceCurrentHpFor(entity, null),
    initiativeRoll: null,
    initiativeBonus: null,
    tracks: cloneTracks(tracksFrom(entity.runCard)),
    conditions: [],
  };
}
