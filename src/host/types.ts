import type {
  CampaignId,
  ChunkId,
  EntityId,
  LogEntryId,
  MediaId,
  ParticipantId,
  SceneId,
  SessionId,
  SourceId,
  TokenId,
  TrackId,
} from "./ids";

/** Persisted document types. Changing a field requires a SCHEMA_VERSION bump and a migration — see persist/schema.ts. */

export type IsoDateTime = string & { readonly __brand: "IsoDateTime" };

export function nowIso(): IsoDateTime {
  return new Date().toISOString() as IsoDateTime;
}

export type EntityLifecycle = "ephemeral" | "recurring";
export type AppMode = "home" | "prep" | "settings";

export type BusyStatus = {
  title: string;
  detail: string;
};
export type Surface = "gm" | "table";
export type { AppSettings, SurfaceLock } from "./settings";
export type SourceKind = "pdf" | "markdown" | "html" | "image" | "manual";
export type MediaRole = "portrait" | "token" | "map" | "other";

export type Track = {
  id: TrackId;
  label: string;
  current: number;
  max: number | null;
};

export type FactItem = {
  label: string;
  value: string;
};

export type TextBlock = {
  kind: "text";
  body: string;
};

export type FactsBlock = {
  kind: "facts";
  items: ReadonlyArray<FactItem>;
};

export type TracksBlock = {
  kind: "tracks";
  items: ReadonlyArray<Track>;
};

export type SecretBlock = {
  kind: "secret";
  body: string;
};

export type MediaBlock = {
  kind: "media";
  mediaId: MediaId;
  role: MediaRole;
};

export type ProvenanceBlock = {
  kind: "provenance";
  sourceId: SourceId;
  page: number | null;
  url: string | null;
  excerpt: string;
};

export type RunCardBlock =
  | TextBlock
  | FactsBlock
  | TracksBlock
  | SecretBlock
  | MediaBlock
  | ProvenanceBlock;

export type RunCard = {
  title: string;
  tags: ReadonlyArray<string>;
  /** User-defined category name; empty means uncategorized. */
  category: string;
  blocks: ReadonlyArray<RunCardBlock>;
};

export type Entity = {
  id: EntityId;
  campaignId: CampaignId;
  /** Session (UI “campaign”) this card belongs to; null means global. */
  sessionId: SessionId | null;
  runCard: RunCard;
  lifecycle: EntityLifecycle;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type Campaign = {
  id: CampaignId;
  name: string;
  createdAt: IsoDateTime;
  /** Ordered category names available for cards in this campaign. */
  cardCategories: ReadonlyArray<string>;
};

export const DEFAULT_CARD_CATEGORIES: ReadonlyArray<string> = [
  "Misc",
  "Player",
  "NPC",
  "Battlemap",
];

export function withDefaultCardCategories(
  categories: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return categories.length > 0 ? categories : [...DEFAULT_CARD_CATEGORIES];
}

export type Session = {
  id: SessionId;
  campaignId: CampaignId;
  title: string;
  createdAt: IsoDateTime;
};

export type TokenShape = "circle" | "square" | "portrait";

export type BattlegroundToken = {
  id: TokenId;
  /** Null for geometric stamp tokens with no card. */
  entityId: EntityId | null;
  participantId: ParticipantId | null;
  x: number;
  y: number;
  visible: boolean;
  label: string;
  /** Multiplier vs encounter.tokenSize. Stages: 0.5, 1, 2, 3, … */
  scale: number;
  shape: TokenShape;
  /** Fill color for circle/square stamps; null for portrait tokens. */
  color: string | null;
};

export const TOKEN_SCALE_MIN = 0.5;

export const TOKEN_STAMP_COLORS: ReadonlyArray<string> = ["#ff0000", "#ffe600", "#000000"];

export function nextTokenScale(current: number, delta: -1 | 1): number {
  if (delta > 0) {
    if (current < 1) {
      return 1;
    }
    return Math.floor(current) + 1;
  }
  if (current <= 1) {
    return TOKEN_SCALE_MIN;
  }
  return Math.floor(current) - 1;
}

export type Battleground = {
  tokens: ReadonlyArray<BattlegroundToken>;
  /** Cell size in CSS pixels. `null` hides the grid. */
  gridSize: number | null;
  tokenSize: number;
};

export const GRID_SIZE_MIN = 16;
export const GRID_SIZE_MAX = 128;
export const GRID_SIZE_DEFAULT = 48;
/** Default token diameter in CSS pixels (~10% under grid default). */
export const TOKEN_SIZE_DEFAULT = 44;

export function emptyBattleground(): Battleground {
  return {
    tokens: [],
    gridSize: GRID_SIZE_DEFAULT,
    tokenSize: TOKEN_SIZE_DEFAULT,
  };
}

export type Scene = {
  id: SceneId;
  sessionId: SessionId;
  campaignId: CampaignId;
  title: string;
  description: string;
  entityIds: ReadonlyArray<EntityId>;
  battleground: Battleground;
  order: number;
};

/** @deprecated Prefer persist/readRecord.readScene. Kept for call sites that already have a Scene. */
export function normalizeScene(value: Scene): Scene {
  return {
    ...value,
    description: typeof value.description === "string" ? value.description : "",
  };
}

export type Source = {
  id: SourceId;
  campaignId: CampaignId;
  title: string;
  kind: SourceKind;
  createdAt: IsoDateTime;
  mimeType: string | null;
  bytes: Blob | null;
};

export type SourceView = {
  sourceId: SourceId;
  page: number | null;
};

export type UrlView = {
  href: string;
};

export function normalizeSource(value: Source): Source {
  return {
    ...value,
    mimeType: value.mimeType ?? null,
    bytes: value.bytes instanceof Blob ? value.bytes : null,
  };
}

export type SourceChunk = {
  id: ChunkId;
  sourceId: SourceId;
  campaignId: CampaignId;
  heading: string;
  page: number | null;
  text: string;
};

export type MediaRecord = {
  id: MediaId;
  campaignId: CampaignId;
  mimeType: string;
  role: MediaRole;
  bytes: Blob;
};

export type LogEntry = {
  id: LogEntryId;
  sessionId: SessionId;
  sceneId: SceneId | null;
  body: string;
  createdAt: IsoDateTime;
};

export type EncounterParticipant = {
  id: ParticipantId;
  entityId: EntityId;
  label: string;
  tracks: ReadonlyArray<Track>;
  conditions: ReadonlyArray<string>;
};

export type EncounterState = {
  sessionId: SessionId;
  participants: ReadonlyArray<EncounterParticipant>;
  activeIndex: number;
  mapMediaId: MediaId | null;
  live: boolean;
  tokens: ReadonlyArray<BattlegroundToken>;
  /** Cell size in CSS pixels. `null` hides the grid. */
  gridSize: number | null;
  tokenSize: number;
};

export type NowContext = {
  campaignId: CampaignId | null;
  sessionId: SessionId | null;
  focusEntityId: EntityId | null;
  surface: Surface;
};

export type SearchHitKind = "entity" | "chunk";

export type SearchHit = {
  id: string;
  kind: SearchHitKind;
  title: string;
  snippet: string;
  entityId: EntityId | null;
  chunkId: ChunkId | null;
};

export type CampaignExport = {
  version: number;
  campaign: Campaign;
  entities: ReadonlyArray<Entity>;
  sessions: ReadonlyArray<Session>;
  scenes: ReadonlyArray<Scene>;
  sources: ReadonlyArray<Source>;
  chunks: ReadonlyArray<SourceChunk>;
  logEntries: ReadonlyArray<LogEntry>;
  encounter: EncounterState | null;
};
