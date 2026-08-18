import {
  newParticipantId,
  newTokenId,
  newVeilId,
  type EntityId,
  type MediaId,
  type ParticipantId,
  type SessionId,
} from "./ids";
import { cloneTracks, combatStatsFrom } from "./runCard";
import {
  emptyBattleground,
  ENCOUNTER_TAG,
  NPC_CATEGORY,
  PLAYER_CATEGORY,
  type EncounterBoard,
  type EncounterBlock,
  type EncounterParticipant,
  type EncounterState,
  type Entity,
  type RunCard,
} from "./types";

export function emptyEncounterBoard(): EncounterBoard {
  const board = emptyBattleground();
  return {
    participants: [],
    activeIndex: 0,
    mapMediaId: null,
    live: false,
    tokens: [],
    veils: [],
    gridSize: board.gridSize,
    tokenSize: board.tokenSize,
  };
}

export function emptyEncounter(sessionId: SessionId): EncounterState {
  return { ...emptyEncounterBoard(), sessionId };
}

export function boardOf(state: EncounterBoard): EncounterBoard {
  return {
    participants: state.participants,
    activeIndex: state.activeIndex,
    mapMediaId: state.mapMediaId,
    live: state.live,
    tokens: state.tokens,
    veils: state.veils,
    gridSize: state.gridSize,
    tokenSize: state.tokenSize,
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

export type ResolvedCombatHp = {
  maxHp: number;
  currentHp: number;
  currentOwnedBy: "card" | "participant";
};

export function combatHpForParticipant(
  participant: EncounterParticipant,
  entity: Entity | undefined,
): ResolvedCombatHp | null {
  if (entity === undefined) {
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
  if (participant.currentHp === null) {
    throw new Error(`NPC “${participant.label}” in this encounter is missing current HP`);
  }
  return { maxHp: stats.maxHp, currentHp: participant.currentHp, currentOwnedBy: "participant" };
}

/** NPC instances own current HP on the participant; players keep it on the card. */
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

export function withParticipantHpOwnership(
  board: EncounterBoard,
  entity: Entity,
  previousCardCurrentHp: number | null = null,
): EncounterBoard {
  let changed = false;
  const participants = board.participants.map((participant) => {
    if (participant.entityId !== entity.id) {
      return participant;
    }
    const currentHp = instanceCurrentHpFor(entity, participant.currentHp, previousCardCurrentHp);
    if (participant.currentHp === currentHp) {
      return participant;
    }
    changed = true;
    return { ...participant, currentHp };
  });
  if (!changed) {
    return board;
  }
  return { ...board, participants };
}

export function fillParticipantCurrentHp(
  board: EncounterBoard,
  entities: ReadonlyArray<Entity>,
): EncounterBoard {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let changed = false;
  const participants = board.participants.map((participant) => {
    const owner = byId.get(participant.entityId);
    if (owner === undefined) {
      return participant;
    }
    const currentHp = instanceCurrentHpFor(owner, participant.currentHp);
    if (participant.currentHp === currentHp) {
      return participant;
    }
    changed = true;
    return { ...participant, currentHp };
  });
  if (!changed) {
    return board;
  }
  return { ...board, participants };
}

export function withFilledEncounterCardHp(
  entities: ReadonlyArray<Entity>,
): Entity[] {
  return entities.map((entity) => {
    const board = encounterFromCard(entity);
    if (board === null) {
      return entity;
    }
    const next = fillParticipantCurrentHp(board, entities);
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
  const participantIds = new Map<ParticipantId, ParticipantId>();
  const participants = board.participants.map((participant) => {
    const id = newParticipantId();
    participantIds.set(participant.id, id);
    return {
      ...participant,
      id,
      tracks: cloneTracks(participant.tracks),
      conditions: [...participant.conditions],
    };
  });
  const tokens = board.tokens.map((token) => ({
    ...token,
    id: newTokenId(),
    participantId:
      token.participantId === null ? null : (participantIds.get(token.participantId) ?? null),
  }));
  const veils = board.veils.map((veil) => ({
    ...veil,
    id: newVeilId(),
  }));
  return {
    ...boardOf(board),
    participants,
    tokens,
    veils,
  };
}

export function scrubEntityFromBoard(board: EncounterBoard, entityId: EntityId): EncounterBoard {
  const participants = board.participants.filter((participant) => participant.entityId !== entityId);
  const tokens = board.tokens.filter((token) => token.entityId !== entityId);
  if (participants.length === board.participants.length && tokens.length === board.tokens.length) {
    return board;
  }
  return {
    ...board,
    participants,
    activeIndex: participants.length === 0 ? 0 : Math.min(board.activeIndex, participants.length - 1),
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
