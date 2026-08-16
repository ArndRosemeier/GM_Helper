import type {
  CampaignId,
  ChunkId,
  EntityId,
  FactPinId,
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
export type AppMode = "run" | "prep" | "settings";

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
  blocks: ReadonlyArray<RunCardBlock>;
};

export type Entity = {
  id: EntityId;
  campaignId: CampaignId;
  runCard: RunCard;
  lifecycle: EntityLifecycle;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type FactPin = {
  id: FactPinId;
  entityId: EntityId;
  label: string;
};

export type Campaign = {
  id: CampaignId;
  name: string;
  pinnedFacts: ReadonlyArray<FactPin>;
  createdAt: IsoDateTime;
};

export type Session = {
  id: SessionId;
  campaignId: CampaignId;
  title: string;
  createdAt: IsoDateTime;
};

export type BattlegroundToken = {
  id: TokenId;
  entityId: EntityId;
  participantId: ParticipantId | null;
  x: number;
  y: number;
  visible: boolean;
  label: string;
};

export type Battleground = {
  mapMediaId: MediaId | null;
  tokens: ReadonlyArray<BattlegroundToken>;
  /** Cell size in CSS pixels. `null` hides the grid. */
  gridSize: number | null;
  tokenSize: number;
};

export const GRID_SIZE_MIN = 16;
export const GRID_SIZE_MAX = 128;
export const GRID_SIZE_DEFAULT = 48;

export function emptyBattleground(): Battleground {
  return {
    mapMediaId: null,
    tokens: [],
    gridSize: GRID_SIZE_DEFAULT,
    tokenSize: GRID_SIZE_DEFAULT,
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

export type WebSearchView = {
  query: string;
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
};

export type NowContext = {
  campaignId: CampaignId | null;
  sessionId: SessionId | null;
  sceneId: SceneId | null;
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
