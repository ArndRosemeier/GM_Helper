import {
  asCampaignId,
  asChunkId,
  asEntityId,
  asLogEntryId,
  asMediaId,
  asParticipantId,
  asSceneId,
  asSessionId,
  asSourceId,
  asTokenId,
  asTrackId,
} from "../ids";
import { parseAppSettings, type AppSettings } from "../settings";
import { syncCombatStatsForCategory } from "../runCard";
import {
  emptyBattleground,
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  TOKEN_SIZE_DEFAULT,
  TOKEN_SIZE_MIN,
  TOKEN_SCALE_MIN,
  nowIso,
  DEFAULT_CAMPAIGN_GENRE,
  normalizeCampaignGenre,
  type Battleground,
  type BattlegroundToken,
  type Campaign,
  type EncounterBoard,
  type EncounterParticipant,
  type EncounterState,
  type Entity,
  type EntityLifecycle,
  type IsoDateTime,
  type LogEntry,
  type MediaRecord,
  type TokenShape,
  type MediaRole,
  type RunCard,
  type RunCardBlock,
  type Scene,
  type Session,
  type Source,
  type SourceChunk,
  type SourceKind,
  type Track,
  withDefaultCardCategories,
} from "../types";
import type { MigrationWarning } from "./warnings";

const SOURCE_KINDS: ReadonlyArray<SourceKind> = ["pdf", "markdown", "html", "image", "manual"];
const MEDIA_ROLES: ReadonlyArray<MediaRole> = ["portrait", "token", "map", "other"];
const LIFECYCLES: ReadonlyArray<EntityLifecycle> = ["ephemeral", "recurring"];
const BLOCK_KINDS = ["text", "facts", "tracks", "secret", "media", "provenance", "encounter", "combat"] as const;

export function readStored<T>(
  rows: ReadonlyArray<unknown>,
  read: (value: unknown, warnings: MigrationWarning[]) => T | null,
  warnings: MigrationWarning[],
): T[] {
  const items: T[] = [];
  for (const row of rows) {
    const next = read(row, warnings);
    if (next) {
      items.push(next);
    }
  }
  return items;
}

export function readCampaign(value: unknown, warnings: MigrationWarning[]): Campaign | null {
  const record = asObject(value, "campaigns", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "campaigns", warnings);
  if (id === null) {
    return null;
  }
  return {
    id: asCampaignId(id),
    name: readString(record, "name", "campaigns", id, warnings) ?? "Campaign",
    createdAt: readIso(record, "createdAt", "campaigns", id, warnings),
    cardCategories: withDefaultCardCategories(
      readStringList(record.cardCategories, "campaigns", id, "cardCategories", warnings),
    ),
  };
}

export function readEntity(value: unknown, warnings: MigrationWarning[]): Entity | null {
  const record = asObject(value, "entities", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "entities", warnings);
  const campaignId = readId(record, "campaignId", "entities", warnings);
  if (id === null || campaignId === null) {
    return null;
  }
  const lifecycle = record.lifecycle;
  if (lifecycle !== undefined && !isLifecycle(lifecycle)) {
    warnings.push({ store: "entities", id, message: `Unknown lifecycle ${String(lifecycle)}, using recurring` });
  }
  const rawSessionId = record.sessionId;
  let sessionId: ReturnType<typeof asSessionId> | null = null;
  if (rawSessionId === undefined || rawSessionId === null) {
    sessionId = null;
  } else if (typeof rawSessionId === "string" && rawSessionId.length > 0) {
    sessionId = asSessionId(rawSessionId);
  } else {
    warnings.push({ store: "entities", id, message: "sessionId was invalid and was cleared to global" });
    sessionId = null;
  }
  return {
    id: asEntityId(id),
    campaignId: asCampaignId(campaignId),
    sessionId,
    runCard: readRunCard(record.runCard, id, warnings),
    lifecycle: isLifecycle(lifecycle) ? lifecycle : "recurring",
    createdAt: readIso(record, "createdAt", "entities", id, warnings),
    updatedAt: readIso(record, "updatedAt", "entities", id, warnings),
  };
}

export function readSession(value: unknown, warnings: MigrationWarning[]): Session | null {
  const record = asObject(value, "sessions", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "sessions", warnings);
  const campaignId = readId(record, "campaignId", "sessions", warnings);
  if (id === null || campaignId === null) {
    return null;
  }
  return {
    id: asSessionId(id),
    campaignId: asCampaignId(campaignId),
    title: readString(record, "title", "sessions", id, warnings) ?? "Session",
    genre: normalizeCampaignGenre(
      readString(record, "genre", "sessions", id, warnings) ?? DEFAULT_CAMPAIGN_GENRE,
    ),
    createdAt: readIso(record, "createdAt", "sessions", id, warnings),
  };
}

export function readScene(value: unknown, warnings: MigrationWarning[]): Scene | null {
  const record = asObject(value, "scenes", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "scenes", warnings);
  const sessionId = readId(record, "sessionId", "scenes", warnings);
  const campaignId = readId(record, "campaignId", "scenes", warnings);
  if (id === null || sessionId === null || campaignId === null) {
    return null;
  }
  const description = record.description;
  if (description !== undefined && typeof description !== "string") {
    warnings.push({ store: "scenes", id, message: "description was not a string and was cleared" });
  }
  const order = record.order;
  if (typeof order !== "number" || !Number.isInteger(order)) {
    warnings.push({ store: "scenes", id, message: "order was missing or not an integer, using 0" });
  }
  return {
    id: asSceneId(id),
    sessionId: asSessionId(sessionId),
    campaignId: asCampaignId(campaignId),
    title: readString(record, "title", "scenes", id, warnings) ?? "Scene",
    description: typeof description === "string" ? description : "",
    entityIds: readIdList(record.entityIds, "scenes", id, warnings).map(asEntityId),
    battleground: readBattleground(record.battleground, id, warnings),
    order: typeof order === "number" && Number.isInteger(order) ? order : 0,
  };
}

export function readSource(value: unknown, warnings: MigrationWarning[]): Source | null {
  const record = asObject(value, "sources", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "sources", warnings);
  const campaignId = readId(record, "campaignId", "sources", warnings);
  if (id === null || campaignId === null) {
    return null;
  }
  const kind = record.kind;
  if (!isSourceKind(kind)) {
    warnings.push({ store: "sources", id, message: `Unknown source kind ${String(kind)}, using manual` });
  }
  const mimeType = record.mimeType;
  if (mimeType !== undefined && mimeType !== null && typeof mimeType !== "string") {
    warnings.push({ store: "sources", id, message: "mimeType was not a string and was cleared" });
  }
  const bytes = record.bytes;
  if (bytes !== undefined && bytes !== null && !(bytes instanceof Blob)) {
    warnings.push({ store: "sources", id, message: "bytes was not a Blob and was cleared" });
  }
  return {
    id: asSourceId(id),
    campaignId: asCampaignId(campaignId),
    title: readString(record, "title", "sources", id, warnings) ?? "Source",
    kind: isSourceKind(kind) ? kind : "manual",
    createdAt: readIso(record, "createdAt", "sources", id, warnings),
    mimeType: typeof mimeType === "string" ? mimeType : null,
    bytes: bytes instanceof Blob ? bytes : null,
  };
}

export function readChunk(value: unknown, warnings: MigrationWarning[]): SourceChunk | null {
  const record = asObject(value, "chunks", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "chunks", warnings);
  const sourceId = readId(record, "sourceId", "chunks", warnings);
  const campaignId = readId(record, "campaignId", "chunks", warnings);
  if (id === null || sourceId === null || campaignId === null) {
    return null;
  }
  const page = record.page;
  if (page !== undefined && page !== null && typeof page !== "number") {
    warnings.push({ store: "chunks", id, message: "page was not a number and was cleared" });
  }
  return {
    id: asChunkId(id),
    sourceId: asSourceId(sourceId),
    campaignId: asCampaignId(campaignId),
    heading: readString(record, "heading", "chunks", id, warnings) ?? "",
    page: typeof page === "number" ? page : null,
    text: readString(record, "text", "chunks", id, warnings) ?? "",
  };
}

export function readMedia(value: unknown, warnings: MigrationWarning[]): MediaRecord | null {
  const record = asObject(value, "media", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "media", warnings);
  const campaignId = readId(record, "campaignId", "media", warnings);
  if (id === null || campaignId === null) {
    return null;
  }
  if (!(record.bytes instanceof Blob)) {
    warnings.push({ store: "media", id, message: "Media bytes are missing; record skipped" });
    return null;
  }
  const role = record.role;
  if (!isMediaRole(role)) {
    warnings.push({ store: "media", id, message: `Unknown media role ${String(role)}, using other` });
  }
  return {
    id: asMediaId(id),
    campaignId: asCampaignId(campaignId),
    mimeType: readString(record, "mimeType", "media", id, warnings) ?? "application/octet-stream",
    role: isMediaRole(role) ? role : "other",
    bytes: record.bytes,
  };
}

export function readLogEntry(value: unknown, warnings: MigrationWarning[]): LogEntry | null {
  const record = asObject(value, "logEntries", "?", warnings);
  if (!record) {
    return null;
  }
  const id = readId(record, "id", "logEntries", warnings);
  const sessionId = readId(record, "sessionId", "logEntries", warnings);
  if (id === null || sessionId === null) {
    return null;
  }
  const sceneId = record.sceneId;
  if (sceneId !== undefined && sceneId !== null && typeof sceneId !== "string") {
    warnings.push({ store: "logEntries", id, message: "sceneId was not a string and was cleared" });
  }
  return {
    id: asLogEntryId(id),
    sessionId: asSessionId(sessionId),
    sceneId: typeof sceneId === "string" ? asSceneId(sceneId) : null,
    body: readString(record, "body", "logEntries", id, warnings) ?? "",
    createdAt: readIso(record, "createdAt", "logEntries", id, warnings),
  };
}

export function readEncounter(value: unknown, warnings: MigrationWarning[]): EncounterState | null {
  if (value === null || value === undefined) {
    return null;
  }
  const record = asObject(value, "encounters", "?", warnings);
  if (!record) {
    return null;
  }
  const sessionId = readId(record, "sessionId", "encounters", warnings);
  if (sessionId === null) {
    return null;
  }
  return {
    sessionId: asSessionId(sessionId),
    ...readEncounterBoard(record, sessionId, warnings, "encounters"),
  };
}

export function readEncounterBoard(
  record: Record<string, unknown>,
  ownerId: string,
  warnings: MigrationWarning[],
  store: "encounters" | "entities",
): EncounterBoard {
  const activeIndex = record.activeIndex;
  const participants = readParticipants(record.participants, ownerId, warnings, store);
  const index = typeof activeIndex === "number" && Number.isInteger(activeIndex) ? activeIndex : 0;
  const mapMediaId = record.mapMediaId;
  const board = emptyBattleground();
  return {
    participants,
    activeIndex: participants.length === 0 ? 0 : Math.min(Math.max(0, index), participants.length - 1),
    mapMediaId: typeof mapMediaId === "string" ? asMediaId(mapMediaId) : null,
    live: record.live === true,
    tokens: readTokens(record.tokens, ownerId, warnings, store),
    gridSize:
      record.gridSize === undefined
        ? board.gridSize
        : readGridSize(record.gridSize, ownerId, warnings),
    tokenSize: readTokenSize(record.tokenSize, record.gridSize, ownerId, warnings),
  };
}

export function readSettings(value: unknown, warnings: MigrationWarning[]): AppSettings | null {
  try {
    return parseAppSettings(value);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push({ store: "settings", id: "app", message });
    return null;
  }
}

function readRunCard(value: unknown, entityId: string, warnings: MigrationWarning[]): RunCard {
  const record = asObject(value, "entities", entityId, warnings);
  if (!record) {
    warnings.push({ store: "entities", id: entityId, message: "runCard was missing; used an empty card" });
    return { title: "Untitled", tags: [], category: "", blocks: [] };
  }
  const tags = record.tags;
  const tagList: string[] = [];
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === "string") {
        tagList.push(tag);
      } else {
        warnings.push({ store: "entities", id: entityId, message: "A runCard tag was not a string and was dropped" });
      }
    }
  } else if (tags !== undefined) {
    warnings.push({ store: "entities", id: entityId, message: "runCard.tags was not a list" });
  }
  const categoryRaw = record.category;
  let category = "";
  if (typeof categoryRaw === "string") {
    category = categoryRaw.trim();
  } else if (categoryRaw !== undefined) {
    warnings.push({ store: "entities", id: entityId, message: "runCard.category was not a string and was cleared" });
  }
  return syncCombatStatsForCategory({
    title: readString(record, "title", "entities", entityId, warnings) ?? "Untitled",
    tags: tagList,
    category,
    blocks: readBlocks(record.blocks, entityId, warnings),
  });
}

function readBlocks(value: unknown, entityId: string, warnings: MigrationWarning[]): RunCardBlock[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store: "entities", id: entityId, message: "runCard.blocks was not a list" });
    return [];
  }
  const blocks: RunCardBlock[] = [];
  for (const item of value) {
    const block = readBlock(item, entityId, warnings);
    if (block) {
      blocks.push(block);
    }
  }
  return blocks;
}

function readBlock(value: unknown, entityId: string, warnings: MigrationWarning[]): RunCardBlock | null {
  const record = asObject(value, "entities", entityId, warnings);
  if (!record) {
    return null;
  }
  const kind = record.kind;
  if (!isBlockKind(kind)) {
    warnings.push({ store: "entities", id: entityId, message: `Unknown runCard block ${String(kind)} was dropped` });
    return null;
  }
  switch (kind) {
    case "text":
    case "secret":
      return { kind, body: typeof record.body === "string" ? record.body : "" };
    case "facts":
      return { kind, items: readFactItems(record.items, entityId, warnings) };
    case "tracks":
      return { kind, items: readTracks(record.items, entityId, warnings) };
    case "media": {
      const mediaId = typeof record.mediaId === "string" ? record.mediaId : null;
      if (mediaId === null) {
        warnings.push({ store: "entities", id: entityId, message: "A media block had no mediaId and was dropped" });
        return null;
      }
      const role = record.role;
      return { kind, mediaId: asMediaId(mediaId), role: isMediaRole(role) ? role : "other" };
    }
    case "provenance": {
      const sourceId = typeof record.sourceId === "string" ? record.sourceId : null;
      if (sourceId === null) {
        warnings.push({ store: "entities", id: entityId, message: "A provenance block had no sourceId and was dropped" });
        return null;
      }
      const page = record.page;
      const url = record.url;
      return {
        kind,
        sourceId: asSourceId(sourceId),
        page: typeof page === "number" ? page : null,
        url: typeof url === "string" ? url : null,
        excerpt: typeof record.excerpt === "string" ? record.excerpt : "",
      };
    }
    case "encounter":
      return { kind: "encounter", ...readEncounterBoard(record, entityId, warnings, "entities") };
    case "combat": {
      const maxSource = record.maxHp !== undefined ? record.maxHp : record.hp;
      const maxHp = readCombatInteger(maxSource, entityId, "maxHp", warnings);
      const currentRaw = record.currentHp;
      const currentHp =
        currentRaw === undefined || currentRaw === null
          ? null
          : readCombatInteger(currentRaw, entityId, "currentHp", warnings);
      return {
        kind: "combat",
        maxHp,
        currentHp,
        initiativeBonus: readCombatInteger(record.initiativeBonus, entityId, "initiativeBonus", warnings),
      };
    }
    default: {
      const exhausted: never = kind;
      warnings.push({ store: "entities", id: entityId, message: `Unhandled block kind ${String(exhausted)}` });
      return null;
    }
  }
}

function readFactItems(
  value: unknown,
  entityId: string,
  warnings: MigrationWarning[],
): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: Array<{ label: string; value: string }> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store: "entities", id: entityId, message: "A fact item was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    items.push({
      label: typeof record.label === "string" ? record.label : "",
      value: typeof record.value === "string" ? record.value : "",
    });
  }
  return items;
}

function readTracks(value: unknown, entityId: string, warnings: MigrationWarning[]): Track[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: Track[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store: "entities", id: entityId, message: "A track was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (id === null) {
      warnings.push({ store: "entities", id: entityId, message: "A track had no id and was dropped" });
      continue;
    }
    const current = typeof record.current === "number" ? record.current : 0;
    const max = record.max;
    items.push({
      id: asTrackId(id),
      label: typeof record.label === "string" ? record.label : "Track",
      current,
      max: typeof max === "number" ? max : null,
    });
  }
  return items;
}

function readBattleground(value: unknown, sceneId: string, warnings: MigrationWarning[]): Battleground {
  if (value === undefined) {
    return emptyBattleground();
  }
  const record = asObject(value, "scenes", sceneId, warnings);
  if (!record) {
    return emptyBattleground();
  }
  return {
    tokens: readTokens(record.tokens, sceneId, warnings, "scenes"),
    gridSize: readGridSize(record.gridSize, sceneId, warnings),
    tokenSize: readTokenSize(record.tokenSize, record.gridSize, sceneId, warnings),
  };
}

function readGridSize(value: unknown, sceneId: string, warnings: MigrationWarning[]): number | null {
  if (value === undefined) {
    return GRID_SIZE_DEFAULT;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, value));
  }
  warnings.push({ store: "scenes", id: sceneId, message: "gridSize was not an integer; using default" });
  return GRID_SIZE_DEFAULT;
}

function readTokenSize(
  value: unknown,
  gridSize: unknown,
  sceneId: string,
  warnings: MigrationWarning[],
): number {
  if (value === undefined) {
    if (typeof gridSize === "number" && Number.isInteger(gridSize)) {
      return Math.min(GRID_SIZE_MAX, Math.max(TOKEN_SIZE_MIN, gridSize));
    }
    return TOKEN_SIZE_DEFAULT;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return Math.min(GRID_SIZE_MAX, Math.max(TOKEN_SIZE_MIN, value));
  }
  warnings.push({ store: "scenes", id: sceneId, message: "tokenSize was not an integer; using default" });
  return TOKEN_SIZE_DEFAULT;
}

function readTokens(
  value: unknown,
  ownerId: string,
  warnings: MigrationWarning[],
  store: "scenes" | "encounters" | "entities",
): BattlegroundToken[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store, id: ownerId, message: "tokens was not a list" });
    return [];
  }
  const tokens: BattlegroundToken[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store, id: ownerId, message: "A token was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (id === null) {
      warnings.push({ store, id: ownerId, message: "A token was missing id and was dropped" });
      continue;
    }
    const entityIdRaw = record.entityId;
    let entityId: ReturnType<typeof asEntityId> | null = null;
    if (typeof entityIdRaw === "string" && entityIdRaw.length > 0) {
      entityId = asEntityId(entityIdRaw);
    } else if (entityIdRaw !== null && entityIdRaw !== undefined) {
      warnings.push({ store, id: ownerId, message: "A token entityId was invalid and was cleared" });
    }
    const participantId = record.participantId;
    const scaleRaw = record.scale;
    let scale = 1;
    if (typeof scaleRaw === "number" && Number.isFinite(scaleRaw) && scaleRaw > 0) {
      scale = scaleRaw < 1 ? TOKEN_SCALE_MIN : Math.max(1, Math.floor(scaleRaw));
    }
    const shapeRaw = record.shape;
    const shape: TokenShape =
      shapeRaw === "circle" || shapeRaw === "square" || shapeRaw === "portrait"
        ? shapeRaw
        : entityId === null
          ? "circle"
          : "portrait";
    const colorRaw = record.color;
    const color = typeof colorRaw === "string" && colorRaw.length > 0 ? colorRaw : null;
    tokens.push({
      id: asTokenId(id),
      entityId,
      participantId: typeof participantId === "string" ? asParticipantId(participantId) : null,
      x: typeof record.x === "number" ? record.x : 0.5,
      y: typeof record.y === "number" ? record.y : 0.5,
      visible: record.visible === false ? false : true,
      label: typeof record.label === "string" ? record.label : shape === "portrait" ? "Token" : "",
      scale,
      shape,
      color,
    });
  }
  return tokens;
}

function readParticipants(
  value: unknown,
  ownerId: string,
  warnings: MigrationWarning[],
  store: "encounters" | "entities" = "encounters",
): EncounterParticipant[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) {
      warnings.push({ store, id: ownerId, message: "participants was not a list" });
    }
    return [];
  }
  const participants: EncounterParticipant[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store, id: ownerId, message: "A participant was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const entityId = typeof record.entityId === "string" ? record.entityId : null;
    if (id === null || entityId === null) {
      warnings.push({ store, id: ownerId, message: "A participant was missing ids and was dropped" });
      continue;
    }
    const conditions: string[] = [];
    if (Array.isArray(record.conditions)) {
      for (const tag of record.conditions) {
        if (typeof tag === "string") {
          conditions.push(tag);
        }
      }
    }
    participants.push({
      id: asParticipantId(id),
      entityId: asEntityId(entityId),
      label: typeof record.label === "string" ? record.label : "Participant",
      tracks: readTracks(record.tracks, ownerId, warnings),
      conditions,
      currentHp: readOptionalCombatInteger(record.currentHp, ownerId, warnings, store),
    });
  }
  return participants;
}

function asObject(
  value: unknown,
  store: string,
  id: string,
  warnings: MigrationWarning[],
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    warnings.push({ store, id, message: "Record is not an object" });
    return null;
  }
  return value as Record<string, unknown>;
}

function readId(
  record: Record<string, unknown>,
  field: string,
  store: string,
  warnings: MigrationWarning[],
): string | null {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    warnings.push({ store, id: "?", message: `${field} is missing; record skipped` });
    return null;
  }
  return value;
}

function readStringList(
  value: unknown,
  store: string,
  id: string,
  field: string,
  warnings: MigrationWarning[],
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store, id, message: `${field} was not a list and was cleared` });
    return [];
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      items.push(item.trim());
    } else {
      warnings.push({ store, id, message: `A ${field} entry was dropped` });
    }
  }
  return items;
}

function readString(
  record: Record<string, unknown>,
  field: string,
  store: string,
  id: string,
  warnings: MigrationWarning[],
): string | null {
  const value = record[field];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    warnings.push({ store, id, message: `${field} was not a string` });
    return null;
  }
  return value;
}

function readIso(
  record: Record<string, unknown>,
  field: string,
  store: string,
  id: string,
  warnings: MigrationWarning[],
): IsoDateTime {
  const value = record[field];
  if (typeof value === "string" && value.length > 0) {
    return value as IsoDateTime;
  }
  warnings.push({ store, id, message: `${field} was missing; stamped now` });
  return nowIso();
}

function readIdList(value: unknown, store: string, id: string, warnings: MigrationWarning[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store, id, message: "id list was not an array" });
    return [];
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      ids.push(item);
    } else {
      warnings.push({ store, id, message: "An id list entry was not a string and was dropped" });
    }
  }
  return ids;
}

function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === "string" && SOURCE_KINDS.some((item) => item === value);
}

function isMediaRole(value: unknown): value is MediaRole {
  return typeof value === "string" && MEDIA_ROLES.some((item) => item === value);
}

function isLifecycle(value: unknown): value is EntityLifecycle {
  return typeof value === "string" && LIFECYCLES.some((item) => item === value);
}

function isBlockKind(value: unknown): value is (typeof BLOCK_KINDS)[number] {
  return typeof value === "string" && BLOCK_KINDS.some((item) => item === value);
}

function readCombatInteger(
  value: unknown,
  entityId: string,
  field: "maxHp" | "currentHp" | "initiativeBonus",
  warnings: MigrationWarning[],
): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  warnings.push({
    store: "entities",
    id: entityId,
    message: `combat.${field} was not a whole number and was set to 0`,
  });
  return 0;
}

function readOptionalCombatInteger(
  value: unknown,
  ownerId: string,
  warnings: MigrationWarning[],
  store: "encounters" | "entities",
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  warnings.push({
    store,
    id: ownerId,
    message: "participant.currentHp was not a whole number and was cleared",
  });
  return null;
}
