import type {
  CampaignId,
  ChunkId,
  EntityId,
  LogEntryId,
  MediaId,
  SceneId,
  SessionId,
  SourceId,
  TokenId,
  TrackId,
  VeilId,
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
export type { AppSettings } from "./settings";
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

export type CombatStatsBlock = {
  kind: "combat";
  maxHp: number;
  /** Player cards only. NPC current HP lives on each encounter participant. */
  currentHp: number | null;
  initiativeBonus: number;
};

export type RunCardBlock =
  | TextBlock
  | FactsBlock
  | TracksBlock
  | SecretBlock
  | MediaBlock
  | ProvenanceBlock
  | EncounterBlock
  | CombatStatsBlock;

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

export const ENCOUNTER_CATEGORY = "Encounter";
export const ENCOUNTER_TAG = "encounter";
export const PLAYER_CATEGORY = "Player";
export const NPC_CATEGORY = "NPC";

export function categoryHasCombatStats(category: string): boolean {
  return category === PLAYER_CATEGORY || category === NPC_CATEGORY;
}

export const DEFAULT_CARD_CATEGORIES: ReadonlyArray<string> = [
  "Misc",
  PLAYER_CATEGORY,
  NPC_CATEGORY,
  "Battlemap",
  ENCOUNTER_CATEGORY,
];

export function withDefaultCardCategories(
  categories: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return categories.length > 0 ? categories : [...DEFAULT_CARD_CATEGORIES];
}

export function withEncounterCategory(
  categories: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return categories.includes(ENCOUNTER_CATEGORY)
    ? categories
    : [...categories, ENCOUNTER_CATEGORY];
}

export type Session = {
  id: SessionId;
  campaignId: CampaignId;
  title: string;
  /** Free-text genre for this UI campaign. */
  genre: string;
  createdAt: IsoDateTime;
};

export const DEFAULT_CAMPAIGN_GENRE = "Fantasy";

export function normalizeCampaignGenre(value: string): string {
  const next = value.trim();
  return next.length > 0 ? next : DEFAULT_CAMPAIGN_GENRE;
}

export type TokenShape = "circle" | "square" | "portrait";

export const VEIL_DEFAULT_CELLS = 2;
export const VEIL_MIN_CELLS = 1;

export type VeilKind = "veil" | "fog";

export type BattlegroundVeil = {
  id: VeilId;
  kind: VeilKind;
  x: number;
  y: number;
  /** Width in grid cells, or token-size units when the grid is off. */
  widthCells: number;
  /** Height in grid cells, or token-size units when the grid is off. */
  heightCells: number;
};

export type BattlegroundToken = {
  id: TokenId;
  /** Null for geometric stamp tokens with no card. */
  entityId: EntityId | null;
  x: number;
  y: number;
  visible: boolean;
  label: string;
  /** Multiplier vs encounter.tokenSize. Stages: 0.5, 1, 2, 3, … */
  scale: number;
  shape: TokenShape;
  /** Fill color for circle/square stamps; null for portrait tokens. */
  color: string | null;
  /** NPC instance HP. Null for players (card owns HP) and stamps. */
  currentHp: number | null;
  /** d20 result for this encounter's initiative, when rolled. */
  initiativeRoll: number | null;
  /** Initiative bonus snapshot from the card when initiative was rolled. */
  initiativeBonus: number | null;
  tracks: ReadonlyArray<Track>;
  conditions: ReadonlyArray<string>;
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
export const GRID_SIZE_DEFAULT = 72;
export const TOKEN_SIZE_MIN = GRID_SIZE_MIN / 2;
/**
 * Outer box-shadow ring on `.token-art` / `.token-shape` (each side).
 * Token CSS width + 2× this should equal the grid cell so lines sit just outside.
 */
export const TOKEN_RING_OUTSET_PX = 4;

/** Token CSS width that fills a grid cell with the ring just inside the lines. */
export function tokenSizeFittingGrid(gridSize: number): number {
  const inner = gridSize - TOKEN_RING_OUTSET_PX * 2;
  const clamped = Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, inner));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

export const TOKEN_SIZE_DEFAULT = tokenSizeFittingGrid(GRID_SIZE_DEFAULT);

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
  searchQuery: string | null;
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

export type EncounterBoard = {
  activeIndex: number;
  mapMediaId: MediaId | null;
  live: boolean;
  tokens: ReadonlyArray<BattlegroundToken>;
  veils: ReadonlyArray<BattlegroundVeil>;
  /** Cell size in CSS pixels. `null` hides the grid. */
  gridSize: number | null;
  tokenSize: number;
  initiativeEnabled: boolean;
  /** Turn order by token id. Indexes `activeIndex` when initiative is on. */
  initiativeOrder: ReadonlyArray<TokenId>;
};

export type EncounterBlock = { kind: "encounter" } & EncounterBoard;

export type EncounterState = EncounterBoard & {
  sessionId: SessionId;
};

export type NowContext = {
  campaignId: CampaignId | null;
  sessionId: SessionId | null;
  focusEntityId: EntityId | null;
  surface: Surface;
};

export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  chunkId: ChunkId;
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
