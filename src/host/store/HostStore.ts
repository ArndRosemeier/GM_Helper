import MiniSearch from "minisearch";
import {
  asCampaignId,
  asSessionId,
  newCampaignId,
  newChunkId,
  newEntityId,
  newMediaId,
  newParticipantId,
  newSessionId,
  newSourceId,
  newTokenId,
  type CampaignId,
  type ChunkId,
  type EntityId,
  type MediaId,
  type ParticipantId,
  type SessionId,
  type SourceId,
  type TokenId,
  type TrackId,
} from "../ids";
import {
  nowIso,
  type AppMode,
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  TOKEN_SIZE_MIN,
  nextTokenScale,
  TOKEN_STAMP_COLORS,
  tokenSizeFittingGrid,
  DEFAULT_CARD_CATEGORIES,
  DEFAULT_CAMPAIGN_GENRE,
  ENCOUNTER_CATEGORY,
  ENCOUNTER_TAG,
  NPC_CATEGORY,
  categoryHasCombatStats,
  normalizeCampaignGenre,
  type BattlegroundToken,
  type BusyStatus,
  type Campaign,
  type EncounterBoard,
  type EncounterParticipant,
  type EncounterState,
  type Entity,
  type MediaRecord,
  type NowContext,
  type RunCard,
  type SearchHit,
  type Session,
  type Source,
  type SourceChunk,
  type SourceView,
  type Surface,
  type UrlView,
} from "../types";
import { migrateOpenDatabase, migrationBanner, SCHEMA_VERSION } from "../persist";
import { migrateArchivePayload, migrateCardArchivePayload, parseAnyArchiveManifest, parseArchiveManifest } from "../persist/archiveMigrate";
import { emptyEncounter, foldScenesIntoEncounters } from "../persist/foldScenes";
import {
  battlemapTitleForMedia,
  boardOf,
  cardReferencedMediaIds,
  cloneEncounterBoard,
  combatHpForParticipant,
  encounterCardTitle,
  encounterFromCard,
  instanceCurrentHpFor,
  isEncounterCard,
  isPlayerCard,
  scrubEntityFromBoard,
  withEncounterBlock,
  withParticipantHpOwnership,
} from "../encounter";
import { snapPointToGrid, tokenSpanCells } from "../gridSnap";
import { SCHEMA_META_KEY } from "../persist/schema";
import {
  formatMigrationWarnings,
  type MigrationWarning,
} from "../persist/warnings";
import {
  readCampaign,
  readChunk,
  readEncounter,
  readEntity,
  readLogEntry,
  readMedia,
  readScene,
  readSession,
  readSource,
  readStored,
} from "../persist/readRecord";
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  parseAppSettings,
  type AppSettings,
  type SettingsPatch,
} from "../settings";
import {
  blobToUint8Array,
  packArchiveZip,
  unpackArchiveZip,
  readArchiveManifest,
  ARCHIVE_FORMAT,
  CARD_ARCHIVE_FORMAT,
  type ArchiveData,
  type CardArchiveData,
} from "../../lib/archive";
import { yieldToUi } from "../../lib/yieldToUi";
import { createCatalog, rebuildCatalog, searchCatalog } from "../search/catalog";
import {
  adjustTrackInCard,
  cloneTracks,
  mediaBlocksFrom,
  mediaFrom,
  newTrack,
  provenanceFrom,
  replaceTracks,
  textFrom,
  tracksFrom,
  withFacts,
  withMedia,
  withoutMediaId,
  withCategory,
  withCombatStats,
  combatStatsFrom,
  emptyCombatStats,
  syncCombatStatsForCategory,
  withProvenance,
  withSecret,
  withText,
  emptyRunCard,
} from "../runCard";
import { ingestFile } from "../../lib/ingest";
import { parseEntityUrl, titleFromEntityUrl } from "../../lib/entityUrl";
import { openExternalTab } from "../../lib/iframeEmbed";
import { localNpcCard } from "../../lib/names";
import {
  completeJson,
  editImagePng,
  generateImagePng,
  parseGeneratedNpc,
  parseLiftedCard,
  type OpenRouterConfig,
} from "../../lib/openrouter";
import { errorMessage, isDeadPdfTextLayer, isRenderCancelled } from "../errors";
import { newestBackup, type CampaignBackup } from "./backup";
import { openGmDb, type GmDb } from "./db";
import { parseTableCardIds, tableCardsMetaKey } from "./tableCards";

export type HostSnapshot = {
  ready: boolean;
  error: string | null;
  campaigns: ReadonlyArray<Campaign>;
  campaign: Campaign | null;
  entities: ReadonlyArray<Entity>;
  tableCards: ReadonlyArray<Entity>;
  openedEntityId: EntityId | null;
  sessions: ReadonlyArray<Session>;
  session: Session | null;
  focus: Entity | null;
  sources: ReadonlyArray<Source>;
  chunks: ReadonlyArray<SourceChunk>;
  encounter: EncounterState | null;
  /** Board shown on the table surface: opened encounter card, else session scratch. */
  tableEncounter: EncounterBoard | null;
  openedEncounterEntityId: EntityId | null;
  settings: AppSettings;
  mode: AppMode;
  surface: Surface;
  now: NowContext;
  mediaUrls: Readonly<Record<string, string>>;
  sourceView: SourceView | null;
  mediaViewEntityId: EntityId | null;
  urlView: UrlView | null;
  busy: BusyStatus | null;
  /** Category names selected in the card filter bar. */
  categoryFilters: ReadonlyArray<string>;
  /** Category applied to newly created cards. */
  addCategory: string;
};

const META_CAMPAIGN = "currentCampaignId";
const META_SESSION = "currentSessionId";

type EncounterTarget = { kind: "session" } | { kind: "card"; entityId: EntityId };

export class HostStore {
  private db: GmDb | null = null;
  private listeners = new Set<() => void>();
  private catalog: MiniSearch<{
    id: string;
    kind: "entity" | "chunk";
    title: string;
    text: string;
    tags: string;
  }> = createCatalog();
  private objectUrls = new Map<string, string>();

  private campaigns: Campaign[] = [];
  private entities: Entity[] = [];
  private sessions: Session[] = [];
  private sources: Source[] = [];
  private chunks: SourceChunk[] = [];
  private media: MediaRecord[] = [];
  private encounter: EncounterState | null = null;
  private openedEncounterEntityId: EntityId | null = null;
  private settings: AppSettings = DEFAULT_SETTINGS;
  private currentCampaignId: CampaignId | null = null;
  private currentSessionId: SessionId | null = null;
  private focusEntityId: EntityId | null = null;
  private tableCardIds: EntityId[] = [];
  private openedEntityId: EntityId | null = null;
  private mode: AppMode = "home";
  private surface: Surface = "gm";
  private ready = false;
  private error: string | null = null;
  private sourceView: SourceView | null = null;
  private mediaViewEntityId: EntityId | null = null;
  private urlView: UrlView | null = null;
  private busy: BusyStatus | null = null;
  private readonly sourcePageById = new Map<SourceId, number>();
  private snapshot: HostSnapshot = this.createSnapshot();
  private booting: Promise<void> | null = null;
  private categoryFilters: string[] = [];
  private addCategory = "";

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): HostSnapshot => this.snapshot;

  async boot(): Promise<void> {
    if (this.ready) {
      return;
    }
    if (this.booting) {
      return this.booting;
    }
    this.booting = this.bootOnce();
    try {
      await this.booting;
    } finally {
      this.booting = null;
    }
  }

  private async bootOnce(): Promise<void> {
    this.db = await openGmDb();
    // Document schema first. A missing migration is a crash, not a silent reset.
    const migrated = await migrateOpenDatabase(this.db);
    const banner = migrationBanner(migrated);
    if (banner !== null) {
      this.error = banner;
    }
    await this.readSettings();
    this.campaigns = await this.db.getAll("campaigns");
    const metaCampaign = await this.db.get("meta", META_CAMPAIGN);
    if (this.campaigns.length === 0) {
      await this.recoverMissingCampaigns(metaCampaign);
    }
    const remembered =
      metaCampaign && this.campaigns.some((campaign) => campaign.id === metaCampaign)
        ? asCampaignId(metaCampaign)
        : null;
    if (metaCampaign && remembered === null) {
      this.setErrorAndThrow(
        `Saved campaign ${metaCampaign} is missing from the index and could not be restored. Other data was not opened.`,
      );
    }
    const startId = remembered ?? this.campaigns[0]?.id;
    if (!startId) {
      this.setErrorAndThrow("Boot produced no campaign");
    }
    await this.loadCampaign(startId);
    this.ready = true;
    this.emit();
  }

  search(query: string): ReadonlyArray<SearchHit> {
    return searchCatalog(this.catalog, query);
  }

  setMode(mode: AppMode): void {
    this.mode = mode;
    this.emit();
  }

  setError(message: string | null): void {
    this.error = message;
    this.emit();
  }

  report(error: unknown): void {
    this.setError(errorMessage(error));
  }

  run(work: Promise<unknown>): void {
    void work.catch((error: unknown) => {
      if (isRenderCancelled(error) || isDeadPdfTextLayer(error)) {
        return;
      }
      this.report(error);
    });
  }

  private setBusy(status: BusyStatus | null): void {
    this.busy = status;
    this.emit();
  }

  setSurface(surface: Surface): void {
    if (this.surface === surface) {
      return;
    }
    this.surface = surface;
    if (surface === "gm") {
      this.openedEncounterEntityId = null;
    }
    this.emit();
  }

  async selectCampaign(id: CampaignId): Promise<void> {
    await this.loadCampaign(id);
    this.emit();
  }

  async createCampaign(name: string): Promise<void> {
    const campaign: Campaign = {
      id: newCampaignId(),
      name,
      createdAt: nowIso(),
      cardCategories: [...DEFAULT_CARD_CATEGORIES],
    };
    await this.requireDb().put("campaigns", campaign);
    this.markDirty();
    this.campaigns = [...this.campaigns, campaign];
    await this.loadCampaign(campaign.id);
    this.emit();
  }

  async selectSession(id: SessionId): Promise<void> {
    this.currentSessionId = id;
    this.openedEncounterEntityId = null;
    if (this.surface === "table") {
      this.surface = "gm";
    }
    await this.requireDb().put("meta", id, META_SESSION);
    this.encounter = (await this.requireDb().get("encounters", id)) ?? null;
    this.emit();
  }

  async clearSession(): Promise<void> {
    this.currentSessionId = null;
    this.encounter = null;
    this.openedEncounterEntityId = null;
    if (this.surface === "table") {
      this.surface = "gm";
    }
    await this.requireDb().put("meta", "", META_SESSION);
    this.emit();
  }

  async createSession(title: string, genre = DEFAULT_CAMPAIGN_GENRE): Promise<Session> {
    const campaignId = this.requireCampaignId();
    const session: Session = {
      id: newSessionId(),
      campaignId,
      title,
      genre: normalizeCampaignGenre(genre),
      createdAt: nowIso(),
    };
    await this.requireDb().put("sessions", session);
    this.markDirty();
    this.sessions = [...this.sessions, session];
    await this.selectSession(session.id);
    return session;
  }

  async setSessionGenre(genre: string): Promise<void> {
    const session = this.requireSession();
    const next = normalizeCampaignGenre(genre);
    if (session.genre === next) {
      return;
    }
    const updated = { ...session, genre: next };
    await this.requireDb().put("sessions", updated);
    this.markDirty();
    this.sessions = this.sessions.map((item) => (item.id === updated.id ? updated : item));
    this.emit();
  }

  async deleteSession(id: SessionId): Promise<void> {
    const db = this.requireDb();
    const leftover = await db.getAllFromIndex("scenes", "sessionId", id);
    for (const scene of leftover) {
      await db.delete("scenes", scene.id);
    }
    const logs = await db.getAllFromIndex("logEntries", "sessionId", id);
    for (const entry of logs) {
      await db.delete("logEntries", entry.id);
    }
    await db.delete("encounters", id);
    await db.delete("sessions", id);
    this.markDirty();
    this.sessions = this.sessions.filter((session) => session.id !== id);
    const orphaned = this.entities.filter((entity) => entity.sessionId === id);
    for (const entity of orphaned) {
      await this.putEntity({ ...entity, sessionId: null, updatedAt: nowIso() });
    }
    if (this.currentSessionId !== id) {
      this.emit();
      return;
    }
    const next = this.sessions[0];
    if (next) {
      await this.selectSession(next.id);
      return;
    }
    await this.clearSession();
  }

  setFocus(id: EntityId | null): void {
    this.focusEntityId = id;
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.urlView = null;
    if (id !== null && this.placeOnTable(id)) {
      this.run(this.persistTableCards());
    }
    this.emit();
  }

  openCard(id: EntityId): void {
    this.mode = "home";
    this.focusEntityId = id;
    this.openedEntityId = id;
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.urlView = null;
    if (this.placeOnTable(id)) {
      this.run(this.persistTableCards());
    }
    this.emit();
  }

  async createEntity(runCard: RunCard, lifecycle: Entity["lifecycle"]): Promise<Entity> {
    return this.insertEntity(runCard, lifecycle);
  }

  async createEntityFromUrl(raw: string, title = ""): Promise<Entity> {
    const url = parseEntityUrl(raw);
    const href = url.toString();
    const source = await this.ensureWebSource();
    const cardTitle = title.trim().length > 0 ? title.trim() : titleFromEntityUrl(url);
    const entity = await this.createEntity(
      withProvenance(
        withText({ title: cardTitle, tags: ["web"], category: "", blocks: [] }, href),
        {
          kind: "provenance",
          sourceId: source.id,
          page: null,
          url: href,
          excerpt: href,
        },
      ),
      "recurring",
    );
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.emit();
    return entity;
  }

  async updateRunCard(id: EntityId, runCard: RunCard): Promise<void> {
    const entity = this.requireEntity(id);
    await this.putEntity({ ...entity, runCard, updatedAt: nowIso() });
    this.reindex();
    this.emit();
  }

  async renameEntity(id: EntityId, raw: string): Promise<void> {
    const title = raw.trim();
    if (title.length === 0) {
      this.setErrorAndThrow("Card title is empty");
    }
    const entity = this.requireEntity(id);
    if (entity.runCard.title === title) {
      return;
    }
    await this.updateRunCard(id, { ...entity.runCard, title });
  }

  async setEntityCategory(id: EntityId, category: string): Promise<void> {
    const entity = this.requireEntity(id);
    const campaign = this.requireCampaign();
    const next = category.trim();
    if (next.length > 0 && !campaign.cardCategories.includes(next)) {
      this.setErrorAndThrow(`Unknown category “${next}”`);
    }
    if (entity.runCard.category === next) {
      return;
    }
    await this.updateRunCard(id, withCategory(entity.runCard, next));
    await this.syncParticipantHpOwnership(id, combatStatsFrom(entity.runCard)?.currentHp ?? null);
  }

  async setEntityCombatStats(
    id: EntityId,
    maxHp: number,
    currentHp: number | null,
    initiativeBonus: number,
  ): Promise<void> {
    const entity = this.requireEntity(id);
    if (!categoryHasCombatStats(entity.runCard.category)) {
      this.setErrorAndThrow("Only Player and NPC cards have HP and initiative bonus");
    }
    if (!Number.isInteger(maxHp)) {
      this.setErrorAndThrow("Max HP must be a whole number");
    }
    if (!Number.isInteger(initiativeBonus)) {
      this.setErrorAndThrow("Initiative bonus must be a whole number");
    }
    if (isPlayerCard(entity)) {
      if (currentHp === null || !Number.isInteger(currentHp)) {
        this.setErrorAndThrow("Player current HP must be a whole number");
      }
    } else if (currentHp !== null) {
      this.setErrorAndThrow("NPC current HP is stored on the encounter, not the card");
    }
    const existing = combatStatsFrom(entity.runCard) ?? emptyCombatStats();
    if (
      existing.maxHp === maxHp &&
      existing.currentHp === currentHp &&
      existing.initiativeBonus === initiativeBonus
    ) {
      return;
    }
    await this.updateRunCard(
      id,
      withCombatStats(entity.runCard, { kind: "combat", maxHp, currentHp, initiativeBonus }),
    );
  }

  async setParticipantCurrentHp(participantId: ParticipantId, currentHp: number): Promise<void> {
    if (!Number.isInteger(currentHp)) {
      this.setErrorAndThrow("Current HP must be a whole number");
    }
    const encounter = this.requireTargetEncounter();
    const participant = encounter.participants.find((item) => item.id === participantId);
    if (!participant) {
      this.setErrorAndThrow("Encounter has no such participant");
    }
    const owner = this.requireEntity(participant.entityId);
    const hp = combatHpForParticipant(participant, owner);
    if (hp === null) {
      this.setErrorAndThrow(`“${owner.runCard.title}” has no hit points`);
    }
    if (hp.currentHp === currentHp) {
      return;
    }
    if (hp.currentOwnedBy === "card") {
      const stats = combatStatsFrom(owner.runCard);
      if (stats === null) {
        this.setErrorAndThrow(`Player “${owner.runCard.title}” has no combat stats`);
      }
      await this.updateRunCard(owner.id, withCombatStats(owner.runCard, { ...stats, currentHp }));
      return;
    }
    await this.putEncounter({
      ...encounter,
      participants: encounter.participants.map((item) =>
        item.id === participantId ? { ...item, currentHp } : item,
      ),
    });
    this.emit();
  }

  async setEntitySession(id: EntityId, sessionId: SessionId | null): Promise<void> {
    const entity = this.requireEntity(id);
    if (sessionId !== null && !this.sessions.some((session) => session.id === sessionId)) {
      this.setErrorAndThrow("Unknown campaign");
    }
    if (entity.sessionId === sessionId) {
      return;
    }
    await this.putEntity({ ...entity, sessionId, updatedAt: nowIso() });
    this.emit();
  }

  async setEntityText(id: EntityId, raw: string): Promise<void> {
    const entity = this.requireEntity(id);
    if (textFrom(entity.runCard) === raw) {
      return;
    }
    await this.updateRunCard(id, withText(entity.runCard, raw));
  }

  async deleteEntity(id: EntityId): Promise<void> {
    await this.requireDb().delete("entities", id);
    this.markDirty();
    this.entities = this.entities.filter((entity) => entity.id !== id);
    if (this.openedEncounterEntityId === id) {
      this.openedEncounterEntityId = null;
      if (this.surface === "table") {
        this.surface = "gm";
      }
    }
    if (this.encounter) {
      const next = scrubEntityFromBoard(this.encounter, id);
      if (next !== this.encounter) {
        if (next.participants.length === 0 && this.encounter.participants.length > 0) {
          await this.endEncounter();
        } else {
          await this.putEncounter(
            { ...this.encounter, ...next, sessionId: this.encounter.sessionId },
            { kind: "session" },
          );
        }
      }
    }
    for (const entity of this.entities) {
      const board = encounterFromCard(entity);
      if (board === null) {
        continue;
      }
      const next = scrubEntityFromBoard(board, id);
      if (next === board) {
        continue;
      }
      await this.putEntity({
        ...entity,
        runCard: withEncounterBlock(entity.runCard, next),
        updatedAt: nowIso(),
      });
    }
    this.tableCardIds = this.tableCardIds.filter((cardId) => cardId !== id);
    if (this.openedEntityId === id) {
      this.openedEntityId = null;
    }
    if (this.focusEntityId === id) {
      this.focusEntityId = this.tableCardIds[0] ?? this.entities[0]?.id ?? null;
    }
    await this.persistTableCards();
    this.reindex();
    this.emit();
  }

  async adjustEntityTrack(entityId: EntityId, trackId: TrackId, delta: number): Promise<void> {
    const entity = this.requireEntity(entityId);
    await this.updateRunCard(entityId, adjustTrackInCard(entity.runCard, trackId, delta));
  }

  async ingestUserFile(file: File): Promise<Source> {
    const result = await ingestFile(this.requireCampaignId(), file);
    await this.requireDb().put("sources", result.source);
    this.markDirty();
    for (const chunk of result.chunks) {
      await this.requireDb().put("chunks", chunk);
    }
    if (result.source.kind === "image") {
      const media: MediaRecord = {
        id: newMediaId(),
        campaignId: this.requireCampaignId(),
        mimeType: file.type || "image/png",
        role: "other",
        bytes: file,
      };
      await this.putMedia(media);
      await this.createEntity(
        withMedia(
          withText({ title: result.source.title, tags: ["image"], category: "", blocks: [] }, result.source.title),
          { kind: "media", mediaId: media.id, role: "other" },
        ),
        "recurring",
      );
    }
    this.sources = [...this.sources, result.source];
    this.chunks = [...this.chunks, ...result.chunks];
    this.reindex();
    this.emit();
    return result.source;
  }

  async deleteSource(id: SourceId): Promise<void> {
    const db = this.requireDb();
    const chunks = this.chunks.filter((chunk) => chunk.sourceId === id);
    for (const chunk of chunks) {
      await db.delete("chunks", chunk.id);
    }
    await db.delete("sources", id);
    this.markDirty();
    this.sources = this.sources.filter((source) => source.id !== id);
    this.chunks = this.chunks.filter((chunk) => chunk.sourceId !== id);
    this.sourcePageById.delete(id);
    if (this.sourceView?.sourceId === id) {
      this.sourceView = null;
    }
    this.reindex();
    this.emit();
  }

  openSourceView(sourceId: SourceId, page: number | null): void {
    this.sourceView = { sourceId, page };
    this.rememberSourcePage(sourceId, page);
    this.mediaViewEntityId = null;
    this.urlView = null;
    this.emit();
  }

  openDoc(sourceId: SourceId): void {
    const source = this.sources.find((item) => item.id === sourceId);
    if (!source) {
      this.setErrorAndThrow(`Source ${sourceId} is missing`);
    }
    this.openSourceView(sourceId, this.sourcePageById.get(sourceId) ?? 1);
  }

  openMediaView(entityId: EntityId): void {
    const entity = this.requireEntity(entityId);
    if (mediaBlocksFrom(entity.runCard).length === 0) {
      this.setErrorAndThrow(`“${entity.runCard.title}” has no pictures`);
    }
    this.mediaViewEntityId = entityId;
    this.sourceView = null;
    this.urlView = null;
    this.emit();
  }

  openUrlView(raw: string): void {
    const url = parseEntityUrl(raw);
    this.urlView = { href: url.toString() };
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.emit();
  }

  closeUrlView(): void {
    this.urlView = null;
    this.emit();
  }

  failUrlViewToTab(): void {
    const view = this.urlView;
    if (!view) {
      this.setErrorAndThrow("No page is open");
    }
    this.urlView = null;
    this.emit();
    if (!openExternalTab(view.href)) {
      this.setError("Could not show the page here, and the browser blocked a new tab.");
    }
  }

  closeMediaView(): void {
    this.mediaViewEntityId = null;
    this.emit();
  }

  openChunkView(chunkId: ChunkId): void {
    const chunk = this.requireChunk(chunkId);
    this.openSourceView(chunk.sourceId, chunk.page);
  }

  closeSourceView(): void {
    this.sourceView = null;
    this.emit();
  }

  setSourceViewPage(page: number): void {
    if (!this.sourceView) {
      this.setErrorAndThrow("No source is open");
    }
    if (page < 1) {
      this.setErrorAndThrow(`Page ${String(page)} is out of range`);
    }
    this.sourceView = { ...this.sourceView, page };
    this.rememberSourcePage(this.sourceView.sourceId, page);
    this.emit();
  }

  private rememberSourcePage(sourceId: SourceId, page: number | null): void {
    if (page === null || page < 1) {
      return;
    }
    this.sourcePageById.set(sourceId, page);
  }

  async saveCapturedImage(blob: Blob, title: string, role: MediaRecord["role"]): Promise<Entity> {
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: this.requireCampaignId(),
      mimeType: blob.type || "image/png",
      role,
      bytes: blob,
    };
    await this.putMedia(media);
    const entity = await this.createEntity(
      withMedia(
        withText({ title, tags: ["image"], category: "", blocks: [] }, title),
        { kind: "media", mediaId: media.id, role },
      ),
      "recurring",
    );
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.emit();
    return entity;
  }

  async saveSourcePageAsCard(
    sourceId: SourceId,
    page: number | null,
    picture: Blob | null,
    titleRaw: string,
  ): Promise<Entity> {
    const title = titleRaw.trim();
    if (title.length === 0) {
      this.setErrorAndThrow("Card name is empty");
    }
    const source = this.sources.find((item) => item.id === sourceId);
    if (!source) {
      this.setErrorAndThrow(`Source ${sourceId} is missing`);
    }
    const chunk =
      page === null
        ? this.chunks.find((item) => item.sourceId === sourceId)
        : (this.chunks.find((item) => item.sourceId === sourceId && item.page === page) ??
          this.chunks.find((item) => item.sourceId === sourceId));
    const text = chunk?.text.slice(0, 600) ?? "";
    const tags = source.kind === "pdf" || source.kind === "image" ? [source.kind] : [];
    let card = withProvenance(
      text.length > 0
        ? withText({ title, tags, category: "", blocks: [] }, text)
        : { title, tags, category: "", blocks: [] },
      {
        kind: "provenance",
        sourceId,
        page,
        url: null,
        excerpt: (text.length > 0 ? text : title).slice(0, 240),
      },
    );
    if (picture !== null) {
      const media: MediaRecord = {
        id: newMediaId(),
        campaignId: source.campaignId,
        mimeType: picture.type || "image/png",
        role: "other",
        bytes: picture,
      };
      await this.putMedia(media);
      card = withMedia(card, { kind: "media", mediaId: media.id, role: "other" });
    }
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.urlView = null;
    const entity = await this.createEntity(card, "recurring");
    this.openCard(entity.id);
    return entity;
  }

  async savePdfImageAsCard(picture: Blob, titleRaw: string): Promise<Entity> {
    const title = titleRaw.trim();
    if (title.length === 0) {
      this.setErrorAndThrow("Card name is empty");
    }
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: this.requireCampaignId(),
      mimeType: picture.type || "image/png",
      role: "other",
      bytes: picture,
    };
    await this.putMedia(media);
    // Free-text card: picture only, no PDF provenance / pdf tag.
    const card = withMedia(emptyRunCard(title), {
      kind: "media",
      mediaId: media.id,
      role: "other",
    });
    this.sourceView = null;
    this.mediaViewEntityId = null;
    this.urlView = null;
    const entity = await this.createEntity(card, "recurring");
    this.openCard(entity.id);
    return entity;
  }

  async saveChunkAsCard(chunkId: ChunkId): Promise<Entity> {
    const chunk = this.requireChunk(chunkId);
    return this.saveSourcePageAsCard(chunk.sourceId, chunk.page, null, chunk.heading);
  }

  async liftChunk(chunkId: ChunkId): Promise<Entity> {
    this.setBusy({
      title: "Lifting a run card",
      detail: "OpenRouter is turning the excerpt into a card. Stay on this page.",
    });
    try {
    const chunk = this.requireChunk(chunkId);
    const raw = await completeJson(this.requireOpenRouter(), [
      {
        role: "system",
        content:
          "Extract a short GM run card from the excerpt. Return JSON: {title, tags:string[], text, facts:{label,value}[], secret:string|null, tracks:{label,current,max:number|null}[]}. Infer fields from the text. Do not invent a rules system.",
      },
      { role: "user", content: `${chunk.heading}\n\n${chunk.text}` },
    ]);
    const lifted = parseLiftedCard(raw);
    const source = this.sources.find((item) => item.id === chunk.sourceId);
    const tags = source?.kind === "pdf" && !lifted.tags.includes("pdf") ? [...lifted.tags, "pdf"] : lifted.tags;
    let card: RunCard = { title: lifted.title, tags, category: "", blocks: [] };
    if (lifted.text.length > 0) {
      card = withText(card, lifted.text);
    }
    if (lifted.facts.length > 0) {
      card = withFacts(card, lifted.facts);
    }
    if (lifted.secret) {
      card = withSecret(card, lifted.secret);
    }
    if (lifted.tracks.length > 0) {
      card = replaceTracks(
        card,
        lifted.tracks.map((track) => newTrack(track.label, track.current, track.max)),
      );
    }
    card = withProvenance(card, {
      kind: "provenance",
      sourceId: chunk.sourceId,
      page: chunk.page,
      url: null,
      excerpt: chunk.text.slice(0, 240),
    });
    return this.createEntity(card, "recurring");
    } finally {
      this.setBusy(null);
    }
  }

  async generateNpc(useAi: boolean, withPortrait: boolean, hint = ""): Promise<Entity> {
    const ask = hint.trim();
    this.setBusy(
      useAi
        ? {
            title: "Asking OpenRouter",
            detail:
              ask.length > 0
                ? `Writing someone who matches “${ask}”. The card appears when the text is ready.`
                : "Writing someone for the table. The card appears when the text is ready.",
          }
        : {
            title: "Making someone here",
            detail: "Picking a name from the local tables.",
          },
    );
    try {
    let card = localNpcCard();
    if (useAi) {
      const genre = this.sessions.find((item) => item.id === this.currentSessionId)?.genre
        ?? DEFAULT_CAMPAIGN_GENRE;
      const raw = await completeJson(this.requireOpenRouter(), [
        {
          role: "system",
          content:
            `Create a side NPC for a live roleplaying session. The campaign genre is ${genre}. Return JSON: {title, text}. title is only the person's name. text is a free-form description in the same language as the GM's hint. If the GM gave a hint, follow it.`,
        },
        {
          role: "user",
          content: ask.length > 0 ? ask : "A side NPC the party might meet.",
        },
      ]);
      const npc = parseGeneratedNpc(raw);
      card = withText({ title: npc.title, tags: [], category: "", blocks: [] }, npc.text);
    }
    const npcCategory = this.requireCampaign().cardCategories.includes(NPC_CATEGORY)
      ? NPC_CATEGORY
      : "";
    const entity = await this.createEntity({ ...card, category: npcCategory }, "recurring");
    if (withPortrait) {
      this.setBusy({
        title: "Drawing a portrait",
        detail: "The person is already on the table. The picture is still coming from the image model.",
      });
      await this.generatePortrait(entity.id);
    }
    return entity;
    } finally {
      this.setBusy(null);
    }
  }

  async generatePortrait(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    const blob = await generateImagePng(
      this.requireOpenRouter(),
      `Portrait of ${entity.runCard.title}, no text. ${entity.runCard.blocks
        .filter((block) => block.kind === "text")
        .map((block) => block.body)
        .join(" ")}`,
      "3:4",
    );
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: entity.campaignId,
      mimeType: blob.type || "image/png",
      role: "portrait",
      bytes: blob,
    };
    await this.putMedia(media);
    await this.updateRunCard(entityId, withMedia(entity.runCard, { kind: "media", mediaId: media.id, role: "portrait" }));
  }

  async sketchBattleground(): Promise<void> {
    this.setBusy({
      title: "Sketching the map",
      detail: "The image model is drawing a map card. This can take a minute.",
    });
    try {
      const session = this.requireSession();
      const blob = await generateImagePng(
        this.requireOpenRouter(),
        `Top-down battle map sketch, no text labels, for ${session.title}. Clear floor space.`,
        "16:9",
      );
      const media: MediaRecord = {
        id: newMediaId(),
        campaignId: session.campaignId,
        mimeType: blob.type || "image/png",
        role: "other",
        bytes: blob,
      };
      await this.putMedia(media);
      const entity = await this.createEntity(
        withMedia(
          { title: `${session.title} map`, tags: ["image"], category: "", blocks: [] },
          { kind: "media", mediaId: media.id, role: "other" },
        ),
        "recurring",
      );
      this.openCard(entity.id);
    } finally {
      this.setBusy(null);
    }
  }

  async generateTokenArt(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    this.setBusy({
      title: "Generating an image",
      detail: `The image model is painting “${entity.runCard.title}”. The full picture is stored on the card.`,
    });
    try {
      const facts = entity.runCard.blocks
        .filter((block) => block.kind === "facts")
        .flatMap((block) => block.items.map((item) => `${item.label}: ${item.value}`))
        .join(". ");
      const text = entity.runCard.blocks
        .filter((block) => block.kind === "text")
        .map((block) => block.body)
        .join(" ");
      const blob = await generateImagePng(
        this.requireOpenRouter(),
        `${entity.runCard.title}, no text. ${text} ${facts}`,
        "1:1",
      );
      await this.saveTokenArt(entityId, blob);
    } finally {
      this.setBusy(null);
    }
  }

  async saveTokenArt(entityId: EntityId, blob: Blob): Promise<void> {
    const entity = this.requireEntity(entityId);
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: entity.campaignId,
      mimeType: blob.type || "image/png",
      role: "token",
      bytes: blob,
    };
    await this.putMedia(media);
    await this.updateRunCard(
      entityId,
      withMedia(entity.runCard, { kind: "media", mediaId: media.id, role: "token" }),
    );
    await this.placeVisibleToken(entityId);
  }

  async insertEntityImage(entityId: EntityId, blob: Blob): Promise<void> {
    const entity = this.requireEntity(entityId);
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: entity.campaignId,
      mimeType: blob.type || "image/png",
      role: "other",
      bytes: blob,
    };
    await this.putMedia(media);
    await this.updateRunCard(
      entityId,
      withMedia(entity.runCard, { kind: "media", mediaId: media.id, role: "other" }),
    );
  }

  async modifyEntityImage(entityId: EntityId, mediaId: MediaId, prompt: string): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (!mediaBlocksFrom(entity.runCard).some((block) => block.mediaId === mediaId)) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” does not have that picture`);
    }
    const source = this.media.find((item) => item.id === mediaId);
    if (!source) {
      this.setErrorAndThrow("That picture is missing");
    }
    const instructions = prompt.trim();
    if (instructions.length === 0) {
      this.setErrorAndThrow("Modification instructions are empty");
    }
    this.setBusy({
      title: "Modifying the picture",
      detail: `The image model is rewriting “${entity.runCard.title}” from your instructions.`,
    });
    try {
      const blob = await editImagePng(this.requireOpenRouter(), instructions, source.bytes);
      const media: MediaRecord = {
        id: newMediaId(),
        campaignId: entity.campaignId,
        mimeType: blob.type || "image/png",
        role: "other",
        bytes: blob,
      };
      await this.putMedia(media);
      await this.updateRunCard(
        entityId,
        withMedia(this.requireEntity(entityId).runCard, {
          kind: "media",
          mediaId: media.id,
          role: "other",
        }),
      );
    } finally {
      this.setBusy(null);
    }
  }

  async removeEntityImage(entityId: EntityId, mediaId: MediaId): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (!mediaBlocksFrom(entity.runCard).some((block) => block.mediaId === mediaId)) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” does not have that picture`);
    }
    await this.updateRunCard(entityId, withoutMediaId(entity.runCard, mediaId));
    await this.deleteMedia(mediaId);
    const remaining = mediaBlocksFrom(this.requireEntity(entityId).runCard);
    if (remaining.length === 0 && this.mediaViewEntityId === entityId) {
      this.mediaViewEntityId = null;
    }
    if (this.encounter?.mapMediaId === mediaId) {
      await this.setEncounterMap(null);
    }
    for (const entity of this.entities) {
      const board = encounterFromCard(entity);
      if (board === null || board.mapMediaId !== mediaId) {
        continue;
      }
      await this.putEntity({
        ...entity,
        runCard: withEncounterBlock(entity.runCard, { ...board, mapMediaId: null }),
        updatedAt: nowIso(),
      });
    }
    this.emit();
  }

  async addToken(entityId: EntityId, visible: boolean): Promise<void> {
    const encounter = await this.ensureTargetEncounter();
    const entity = this.requireEntity(entityId);
    const token: BattlegroundToken = {
      id: newTokenId(),
      entityId,
      participantId: null,
      x: 0.35 + Math.random() * 0.3,
      y: 0.35 + Math.random() * 0.3,
      visible,
      label: entity.runCard.title,
      scale: 1,
      shape: "portrait",
      color: null,
    };
    await this.putEncounter({
      ...encounter,
      tokens: [...encounter.tokens, token],
    });
    this.emit();
  }

  async addShapeToken(shape: "circle" | "square", color: string): Promise<void> {
    if (shape !== "circle" && shape !== "square") {
      this.setErrorAndThrow(`Unknown token shape: ${String(shape)}`);
    }
    if (!TOKEN_STAMP_COLORS.includes(color)) {
      this.setErrorAndThrow(`Unknown token color: ${color}`);
    }
    const encounter = await this.ensureTargetEncounter();
    const token: BattlegroundToken = {
      id: newTokenId(),
      entityId: null,
      participantId: null,
      x: 0.4 + Math.random() * 0.2,
      y: 0.4 + Math.random() * 0.2,
      visible: true,
      label: "",
      scale: 1,
      shape,
      color,
    };
    await this.putEncounter({
      ...encounter,
      tokens: [...encounter.tokens, token],
    });
    this.emit();
  }

  async placeCardOnBattleground(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (isEncounterCard(entity)) {
      this.setErrorAndThrow("Encounter cards cannot be added to an encounter");
    }
    if (isMapCard(entity)) {
      const mediaId = mapMediaIdFromCard(entity);
      if (mediaId === null) {
        this.setErrorAndThrow(`Map card “${entity.runCard.title}” has no picture`);
      }
      const encounter = await this.ensureTargetEncounter();
      await this.putEncounter({ ...encounter, mapMediaId: mediaId });
      this.emit();
      return;
    }
    await this.addToken(entityId, true);
  }

  private async placeVisibleToken(entityId: EntityId): Promise<void> {
    if (this.currentSessionId === null) {
      return;
    }
    const encounter = await this.ensureTargetEncounter();
    if (encounter.tokens.some((token) => token.entityId === entityId)) {
      const tokens = encounter.tokens.map((token) =>
        token.entityId === entityId ? { ...token, visible: true } : token,
      );
      await this.putEncounter({
        ...encounter,
        tokens,
      });
      this.emit();
      return;
    }
    await this.addToken(entityId, true);
  }

  async moveToken(tokenId: TokenId, x: number, y: number): Promise<void> {
    const encounter = await this.ensureTargetEncounter();
    await this.putEncounter({
      ...encounter,
      tokens: this.mapEncounterToken(encounter, tokenId, (token) => ({ ...token, x, y })),
    });
    this.emit();
  }

  async snapEncounterTokens(boardWidth: number, boardHeight: number): Promise<void> {
    if (!(boardWidth > 0) || !(boardHeight > 0)) {
      this.setErrorAndThrow("Battleground board has no size");
    }
    const encounter = this.requireTargetEncounter();
    const gridSize = encounter.gridSize;
    if (gridSize === null) {
      return;
    }
    let changed = false;
    const tokens = encounter.tokens.map((token) => {
      const snapped = snapPointToGrid(
        token.x,
        token.y,
        boardWidth,
        boardHeight,
        gridSize,
        tokenSpanCells(token.scale),
      );
      if (snapped.x === token.x && snapped.y === token.y) {
        return token;
      }
      changed = true;
      return { ...token, x: snapped.x, y: snapped.y };
    });
    if (!changed) {
      return;
    }
    await this.putEncounter({ ...encounter, tokens });
    this.emit();
  }

  async adjustTokenScale(tokenId: TokenId, delta: -1 | 1): Promise<void> {
    const encounter = await this.ensureTargetEncounter();
    await this.putEncounter({
      ...encounter,
      tokens: this.mapEncounterToken(encounter, tokenId, (token) => ({
        ...token,
        scale: nextTokenScale(token.scale, delta),
      })),
    });
    this.emit();
  }

  async removeToken(tokenId: TokenId): Promise<void> {
    const encounter = await this.ensureTargetEncounter();
    const token = encounter.tokens.find((item) => item.id === tokenId);
    if (!token) {
      this.setErrorAndThrow(`Encounter has no token ${tokenId}`);
    }
    let participants = encounter.participants;
    let activeIndex = encounter.activeIndex;
    if (token.participantId !== null) {
      participants = participants.filter((item) => item.id !== token.participantId);
      activeIndex =
        participants.length === 0 ? 0 : Math.min(activeIndex, participants.length - 1);
    }
    await this.putEncounter({
      ...encounter,
      participants,
      activeIndex,
      tokens: encounter.tokens.filter((item) => item.id !== tokenId),
    });
    this.emit();
  }

  async setGridSize(size: number | null): Promise<void> {
    if (size !== null && (!Number.isInteger(size) || size < GRID_SIZE_MIN || size > GRID_SIZE_MAX)) {
      this.setErrorAndThrow(
        `Grid scale must be off, or an integer from ${String(GRID_SIZE_MIN)} to ${String(GRID_SIZE_MAX)}`,
      );
    }
    const encounter = await this.ensureTargetEncounter();
    if (encounter.gridSize === size) {
      return;
    }
    await this.putEncounter({
      ...encounter,
      gridSize: size,
      tokenSize: size === null ? encounter.tokenSize : tokenSizeFittingGrid(size),
    });
    this.emit();
  }

  async setTokenSize(size: number): Promise<void> {
    if (!Number.isInteger(size) || size < TOKEN_SIZE_MIN || size > GRID_SIZE_MAX) {
      this.setErrorAndThrow(
        `Token scale must be an integer from ${String(TOKEN_SIZE_MIN)} to ${String(GRID_SIZE_MAX)}`,
      );
    }
    const encounter = await this.ensureTargetEncounter();
    if (encounter.tokenSize === size) {
      return;
    }
    await this.putEncounter({
      ...encounter,
      tokenSize: size,
    });
    this.emit();
  }

  async setTokenVisible(tokenId: TokenId, visible: boolean): Promise<void> {
    const encounter = await this.ensureTargetEncounter();
    await this.putEncounter({
      ...encounter,
      tokens: this.mapEncounterToken(encounter, tokenId, (token) => ({ ...token, visible })),
    });
    this.emit();
  }

  async addParticipant(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (isEncounterCard(entity)) {
      this.setErrorAndThrow("Encounter cards cannot be added to an encounter");
    }
    if (isMapCard(entity)) {
      await this.dropOnEncounter(entityId);
      return;
    }
    const extra = this.participantFromEntity(entityId);
    const existing = this.encounter;
    if (!existing) {
      await this.putEncounter(
        {
          ...emptyEncounter(this.requireSessionId()),
          participants: [extra],
        },
        { kind: "session" },
      );
      this.emit();
      return;
    }
    await this.putEncounter(
      {
        ...existing,
        participants: [...existing.participants, extra],
        tokens: existing.live
          ? [...existing.tokens, this.tokenForParticipant(extra, existing.tokens.length)]
          : existing.tokens,
      },
      { kind: "session" },
    );
    this.emit();
  }

  async beginEncounter(): Promise<void> {
    const encounter = this.encounter;
    if (!encounter) {
      this.setErrorAndThrow("Encounter has no one in it");
    }
    const live = this.liveBoard(encounter);
    if (live.participants.length === 0) {
      this.setErrorAndThrow("Encounter has no one in it");
    }
    this.openedEncounterEntityId = null;
    await this.putEncounter(live, { kind: "session" });
    this.setSurface("table");
  }

  async resetEncounterBoard(): Promise<void> {
    const encounter = this.requireTargetEncounter();
    if (encounter.participants.length === 0) {
      this.setErrorAndThrow("Encounter has no one in it");
    }
    await this.putEncounter({
      ...encounter,
      activeIndex: 0,
      live: true,
      tokenSize:
        encounter.gridSize === null
          ? encounter.tokenSize
          : tokenSizeFittingGrid(encounter.gridSize),
      tokens: this.tokensFromRoster(encounter, encounter.participants, false),
    });
    this.emit();
  }

  async dropOnEncounter(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (isEncounterCard(entity)) {
      this.setErrorAndThrow("Encounter cards cannot be added to an encounter");
    }
    if (isMapCard(entity)) {
      const mediaId = mapMediaIdFromCard(entity);
      if (mediaId === null) {
        this.setErrorAndThrow(`Map card “${entity.runCard.title}” has no picture`);
      }
      await this.setEncounterMap(mediaId);
      return;
    }
    await this.addParticipant(entityId);
  }

  async setEncounterMap(mapMediaId: MediaId | null): Promise<void> {
    const existing = this.encounter;
    if (!existing) {
      await this.putEncounter(
        {
          ...emptyEncounter(this.requireSessionId()),
          mapMediaId,
        },
        { kind: "session" },
      );
      this.emit();
      return;
    }
    if (existing.mapMediaId === mapMediaId) {
      return;
    }
    await this.putEncounter({ ...existing, mapMediaId }, { kind: "session" });
    this.emit();
  }

  async removeParticipant(participantId: ParticipantId): Promise<void> {
    const existing = this.requireEncounter();
    const participants = existing.participants.filter((item) => item.id !== participantId);
    if (participants.length === 0) {
      await this.endEncounter();
      return;
    }
    await this.putEncounter(
      {
        ...existing,
        participants,
        activeIndex: Math.min(existing.activeIndex, participants.length - 1),
        tokens: existing.tokens.filter((token) => token.participantId !== participantId),
      },
      { kind: "session" },
    );
    this.emit();
  }

  async nextTurn(): Promise<void> {
    const existing = this.requireTargetEncounter();
    if (existing.participants.length === 0) {
      this.setErrorAndThrow("Encounter has no participants");
    }
    const nextIndex = (existing.activeIndex + 1) % existing.participants.length;
    await this.putEncounter({ ...existing, activeIndex: nextIndex });
    const active = existing.participants[nextIndex];
    if (active) {
      this.focusEntityId = active.entityId;
    }
    this.emit();
  }

  async adjustParticipantTrack(participantId: ParticipantId, trackId: TrackId, delta: number): Promise<void> {
    const existing = this.requireTargetEncounter();
    await this.putEncounter({
      ...existing,
      participants: existing.participants.map((participant) => {
        if (participant.id !== participantId) {
          return participant;
        }
        return {
          ...participant,
          tracks: participant.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const next = track.current + delta;
            const clamped = track.max === null ? next : Math.min(track.max, next);
            return { ...track, current: Math.max(0, clamped) };
          }),
        };
      }),
    });
    this.emit();
  }

  async addParticipantTrack(participantId: ParticipantId, label: string, max: number | null): Promise<void> {
    const existing = this.requireTargetEncounter();
    await this.putEncounter({
      ...existing,
      participants: existing.participants.map((participant) =>
        participant.id === participantId
          ? { ...participant, tracks: [...participant.tracks, newTrack(label, max ?? 0, max)] }
          : participant,
      ),
    });
    this.emit();
  }

  async clearEncounter(): Promise<void> {
    const participants = (this.encounter?.participants ?? []).filter((participant) => {
      const owner = this.entities.find((item) => item.id === participant.entityId);
      return owner !== undefined && isPlayerCard(owner);
    });
    if (participants.length === 0) {
      if (this.encounter) {
        await this.endEncounter();
      }
      return;
    }
    await this.putEncounter(
      {
        ...emptyEncounter(this.requireSessionId()),
        participants,
      },
      { kind: "session" },
    );
    this.emit();
  }

  async endEncounter(): Promise<void> {
    const sessionId = this.requireSessionId();
    await this.requireDb().delete("encounters", sessionId);
    this.markDirty();
    this.encounter = null;
    this.emit();
  }

  async addEncounterAsCard(): Promise<Entity> {
    const encounter = this.encounter;
    if (!encounter || (encounter.participants.length === 0 && encounter.mapMediaId === null)) {
      this.setErrorAndThrow("Encounter has no map or participants");
    }
    await this.ensureEncounterCategory();
    if (!this.categoryFilters.includes(ENCOUNTER_CATEGORY)) {
      this.categoryFilters = [...this.categoryFilters, ENCOUNTER_CATEGORY];
    }
    const mapTitle = battlemapTitleForMedia(this.entities, encounter.mapMediaId);
    const card: RunCard = withEncounterBlock(
      {
        title: encounterCardTitle(mapTitle),
        tags: [ENCOUNTER_TAG],
        category: ENCOUNTER_CATEGORY,
        blocks: [],
      },
      cloneEncounterBoard(encounter),
    );
    return this.createEntity(card, "recurring");
  }

  async openEncounterCard(id: EntityId): Promise<void> {
    const entity = this.requireEntity(id);
    if (!isEncounterCard(entity)) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” is not an encounter`);
    }
    const board = encounterFromCard(entity);
    if (board === null) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” has no encounter`);
    }
    const sessionId = entity.sessionId ?? this.requireSessionId();
    let next: EncounterState = { ...board, sessionId };
    if (!next.live && next.participants.length > 0) {
      const live = this.liveBoard(next);
      if (live.participants.length > 0) {
        next = live;
        await this.putEncounter(next, { kind: "card", entityId: id });
      }
    }
    this.openedEncounterEntityId = id;
    if (this.surface !== "table") {
      this.setSurface("table");
      return;
    }
    this.emit();
  }

  async applySettingsPatch(patch: SettingsPatch): Promise<void> {
    await this.replaceSettings(applySettingsPatch(this.settings, patch));
  }

  async replaceSettings(next: AppSettings): Promise<void> {
    this.settings = parseAppSettings(next);
    await this.requireDb().put("settings", this.settings, "app");
    this.emit();
  }

  async exportAllArchive(): Promise<Blob> {
    this.setBusy({
      title: "Saving everything",
      detail: "Packing campaigns, docs, and images into a ZIP.",
    });
    try {
      const db = this.requireDb();
      if (this.currentCampaignId !== null) {
        await this.persistTableCards();
      }
      const campaigns = await db.getAll("campaigns");
      const entities = await db.getAll("entities");
      const sessions = await db.getAll("sessions");
      const sources = await db.getAll("sources");
      const chunks = await db.getAll("chunks");
      const media = await db.getAll("media");
      const logEntries = await db.getAll("logEntries");
      const encounters = await db.getAll("encounters");

      const tableCardsByCampaign: Record<string, EntityId[]> = {};
      for (const campaign of campaigns) {
        const raw = await db.get("meta", tableCardsMetaKey(campaign.id));
        const known = new Set(
          entities.filter((entity) => entity.campaignId === campaign.id).map((entity) => entity.id),
        );
        tableCardsByCampaign[campaign.id] =
          raw === undefined ? [] : parseTableCardIds(raw, known);
      }

      const mediaBytes = new Map<MediaId, Uint8Array>();
      for (const record of media) {
        mediaBytes.set(record.id, await blobToUint8Array(record.bytes));
      }
      const sourceBytes = new Map<SourceId, Uint8Array>();
      for (const source of sources) {
        if (source.bytes instanceof Blob) {
          sourceBytes.set(source.id, await blobToUint8Array(source.bytes));
        }
      }

      const data: ArchiveData = {
        schemaVersion: SCHEMA_VERSION,
        campaigns,
        entities,
        sessions,
        scenes: [],
        sources: sources.map((source) => ({
          id: source.id,
          campaignId: source.campaignId,
          title: source.title,
          kind: source.kind,
          createdAt: source.createdAt,
          mimeType: source.mimeType,
          hasFile: source.bytes instanceof Blob,
        })),
        chunks,
        media: media.map((record) => ({
          id: record.id,
          campaignId: record.campaignId,
          mimeType: record.mimeType,
          role: record.role,
        })),
        logEntries,
        encounters,
        tableCardsByCampaign,
        settings: { ...this.settings, openRouterApiKey: null },
        currentCampaignId: this.currentCampaignId,
        currentSessionId: this.currentSessionId,
      };

      return packArchiveZip({
        manifest: {
          format: ARCHIVE_FORMAT,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: nowIso(),
        },
        data,
        mediaBytes,
        sourceBytes,
      });
    } finally {
      this.setBusy(null);
    }
  }

  async exportCardArchive(entityId: EntityId): Promise<Blob> {
    const entity = this.requireEntity(entityId);
    this.setBusy({
      title: "Exporting card",
      detail: `Packing “${entity.runCard.title}” into a ZIP.`,
    });
    try {
      const mediaIds = new Set(cardReferencedMediaIds(entity.runCard));
      const provenance = provenanceFrom(entity.runCard);
      const sourceIds = new Set<SourceId>();
      if (provenance !== null) {
        sourceIds.add(provenance.sourceId);
      }

      const mediaMeta = [];
      const mediaBytes = new Map<MediaId, Uint8Array>();
      for (const mediaId of mediaIds) {
        const record = this.media.find((item) => item.id === mediaId);
        if (!record) {
          this.setErrorAndThrow(`Card image ${mediaId} is missing`);
        }
        mediaMeta.push({
          id: record.id,
          campaignId: record.campaignId,
          mimeType: record.mimeType,
          role: record.role,
        });
        mediaBytes.set(record.id, await blobToUint8Array(record.bytes));
      }

      const sourcesMeta = [];
      const sourceBytes = new Map<SourceId, Uint8Array>();
      const chunks: SourceChunk[] = [];
      for (const sourceId of sourceIds) {
        const source = this.sources.find((item) => item.id === sourceId);
        if (!source) {
          continue;
        }
        sourcesMeta.push({
          id: source.id,
          campaignId: source.campaignId,
          title: source.title,
          kind: source.kind,
          createdAt: source.createdAt,
          mimeType: source.mimeType,
          hasFile: source.bytes instanceof Blob,
        });
        if (source.bytes instanceof Blob) {
          sourceBytes.set(source.id, await blobToUint8Array(source.bytes));
        }
        for (const chunk of this.chunks) {
          if (chunk.sourceId === sourceId) {
            chunks.push(chunk);
          }
        }
      }

      const detached: Entity = {
        ...entity,
        sessionId: null,
      };
      const data: CardArchiveData = {
        schemaVersion: SCHEMA_VERSION,
        entity: detached,
        media: mediaMeta,
        sources: sourcesMeta,
        chunks,
      };

      return packArchiveZip({
        manifest: {
          format: CARD_ARCHIVE_FORMAT,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: nowIso(),
        },
        data,
        mediaBytes,
        sourceBytes,
      });
    } finally {
      this.setBusy(null);
    }
  }

  async peekArchiveKind(blob: Blob): Promise<"full" | "card"> {
    this.setBusy({
      title: "Opening archive",
      detail: "Reading the ZIP. Large saves can take a while.",
    });
    try {
      await yieldToUi();
      const manifest = parseAnyArchiveManifest(readArchiveManifest(await blob.arrayBuffer()));
      return manifest.format === CARD_ARCHIVE_FORMAT ? "card" : "full";
    } finally {
      this.setBusy(null);
    }
  }

  async importPickedArchive(blob: Blob, confirmReplaceAll: () => boolean): Promise<void> {
    this.setBusy({
      title: "Opening archive",
      detail: "Reading the ZIP. Large saves can take a while.",
    });
    try {
      await yieldToUi();
      const buffer = await blob.arrayBuffer();
      this.setBusy({
        title: "Opening archive",
        detail: "Checking whether this is a full save or a single card.",
      });
      await yieldToUi();
      const kind =
        parseAnyArchiveManifest(readArchiveManifest(buffer)).format === CARD_ARCHIVE_FORMAT
          ? "card"
          : "full";
      if (kind === "card") {
        this.setBusy({
          title: "Importing card",
          detail: "Unpacking the card ZIP and adding it to this campaign.",
        });
        await yieldToUi();
        await this.importCardArchiveFromBuffer(buffer);
        return;
      }
      this.setBusy(null);
      await yieldToUi();
      if (!confirmReplaceAll()) {
        return;
      }
      this.setBusy({
        title: "Loading archive",
        detail: "Unpacking campaigns, docs, and images. This can take a while for a large save.",
      });
      await yieldToUi();
      await this.importAllArchiveFromBuffer(buffer);
    } finally {
      this.setBusy(null);
    }
  }

  async importCardArchive(blob: Blob): Promise<void> {
    this.setBusy({
      title: "Importing card",
      detail: "Reading the card ZIP and adding it to this campaign.",
    });
    try {
      await yieldToUi();
      await this.importCardArchiveFromBuffer(await blob.arrayBuffer());
    } finally {
      this.setBusy(null);
    }
  }

  private async importCardArchiveFromBuffer(buffer: ArrayBuffer): Promise<void> {
    const campaignId = this.requireCampaignId();
    const unpacked = await unpackArchiveZip(buffer);
    const manifest = parseAnyArchiveManifest(unpacked.manifest);
      if (manifest.format !== CARD_ARCHIVE_FORMAT) {
        this.setErrorAndThrow("This ZIP is a full archive. Use Load all with confirmation to replace everything.");
      }
      const migrated = migrateCardArchivePayload(
        unpacked.data,
        unpacked.mediaFiles,
        unpacked.sourceFiles,
        manifest.schemaVersion,
      );
      if (migrated.warnings.length > 0) {
        this.error = formatMigrationWarnings(migrated.warnings);
      }

      const mediaIdMap = new Map<MediaId, MediaId>();
      for (const record of migrated.media) {
        mediaIdMap.set(record.id, newMediaId());
      }
      const sourceIdMap = new Map<SourceId, SourceId>();
      for (const source of migrated.sources) {
        sourceIdMap.set(source.id, newSourceId());
      }

      const db = this.requireDb();
      for (const record of migrated.media) {
        const nextId = mediaIdMap.get(record.id);
        if (!nextId) {
          this.setErrorAndThrow(`Media remap missing for ${record.id}`);
        }
        const next: MediaRecord = {
          ...record,
          id: nextId,
          campaignId,
        };
        await this.putMedia(next);
      }
      for (const source of migrated.sources) {
        const nextId = sourceIdMap.get(source.id);
        if (!nextId) {
          this.setErrorAndThrow(`Source remap missing for ${source.id}`);
        }
        const next: Source = {
          ...source,
          id: nextId,
          campaignId,
        };
        await db.put("sources", next);
        this.sources = [...this.sources.filter((item) => item.id !== next.id), next];
      }
      for (const chunk of migrated.data.chunks) {
        const nextSourceId = sourceIdMap.get(chunk.sourceId);
        if (!nextSourceId) {
          continue;
        }
        const next: SourceChunk = {
          ...chunk,
          id: newChunkId(),
          sourceId: nextSourceId,
        };
        await db.put("chunks", next);
        this.chunks = [...this.chunks, next];
      }

      const category = migrated.data.entity.runCard.category.trim();
      if (category.length > 0) {
        const campaign = this.requireCampaign();
        if (!campaign.cardCategories.includes(category)) {
          const updated: Campaign = {
            ...campaign,
            cardCategories: [...campaign.cardCategories, category],
          };
          await db.put("campaigns", updated);
          this.campaigns = this.campaigns.map((item) => (item.id === updated.id ? updated : item));
        }
      }

      const remappedCard = remapCardRefs(migrated.data.entity.runCard, mediaIdMap, sourceIdMap);
      const entity: Entity = {
        ...migrated.data.entity,
        id: newEntityId(),
        campaignId,
        sessionId: this.currentSessionId,
        runCard: remappedCard,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await this.putEntity(entity);
      this.reindex();
      this.focusEntityId = entity.id;
      this.openedEntityId = entity.id;
      this.placeOnTable(entity.id);
      await this.persistTableCards();
      this.markDirty();
      this.emit();
  }

  async importAllArchive(blob: Blob): Promise<void> {
    this.setBusy({
      title: "Loading archive",
      detail: "Reading the ZIP and replacing local campaign data.",
    });
    try {
      await yieldToUi();
      await this.importAllArchiveFromBuffer(await blob.arrayBuffer());
    } finally {
      this.setBusy(null);
    }
  }

  private async importAllArchiveFromBuffer(buffer: ArrayBuffer): Promise<void> {
      const unpacked = await unpackArchiveZip(buffer);
      const manifest = parseArchiveManifest(unpacked.manifest);
      const migrated = migrateArchivePayload(
        unpacked.data,
        unpacked.mediaFiles,
        unpacked.sourceFiles,
        manifest.schemaVersion,
      );
      if (migrated.warnings.length > 0) {
        this.error = formatMigrationWarnings(migrated.warnings);
      }

      const keptApiKey = this.settings.openRouterApiKey;
      const db = this.requireDb();

      for (const url of this.objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      this.objectUrls.clear();

      await db.clear("campaigns");
      await db.clear("entities");
      await db.clear("sessions");
      await db.clear("scenes");
      await db.clear("sources");
      await db.clear("chunks");
      await db.clear("media");
      await db.clear("logEntries");
      await db.clear("encounters");
      await db.clear("backups");

      const metaKeys = await db.getAllKeys("meta");
      for (const key of metaKeys) {
        if (key !== SCHEMA_META_KEY) {
          await db.delete("meta", key);
        }
      }
      await db.put("meta", String(SCHEMA_VERSION), SCHEMA_META_KEY);

      for (const campaign of migrated.data.campaigns) {
        await db.put("campaigns", campaign);
      }
      for (const entity of migrated.data.entities) {
        await db.put("entities", entity);
      }
      for (const session of migrated.data.sessions) {
        await db.put("sessions", session);
      }
      for (const source of migrated.sources) {
        await db.put("sources", source);
      }
      for (const chunk of migrated.data.chunks) {
        await db.put("chunks", chunk);
      }
      for (const record of migrated.media) {
        await db.put("media", record);
      }
      for (const entry of migrated.data.logEntries) {
        await db.put("logEntries", entry);
      }
      for (const encounter of migrated.data.encounters) {
        await db.put("encounters", encounter);
      }
      for (const [campaignId, ids] of Object.entries(migrated.data.tableCardsByCampaign)) {
        await db.put("meta", JSON.stringify(ids), tableCardsMetaKey(asCampaignId(campaignId)));
      }

      const nextSettings = {
        ...migrated.data.settings,
        openRouterApiKey: keptApiKey,
      };
      this.settings = parseAppSettings(nextSettings);
      await db.put("settings", this.settings, "app");

      if (migrated.data.currentCampaignId) {
        await db.put("meta", migrated.data.currentCampaignId, META_CAMPAIGN);
      }
      if (migrated.data.currentSessionId) {
        await db.put("meta", migrated.data.currentSessionId, META_SESSION);
      }

      this.sourceView = null;
      this.mediaViewEntityId = null;
      this.urlView = null;
      this.openedEntityId = null;
      this.sourcePageById.clear();

      this.campaigns = await db.getAll("campaigns");
      const startId =
        migrated.data.currentCampaignId &&
        this.campaigns.some((campaign) => campaign.id === migrated.data.currentCampaignId)
          ? migrated.data.currentCampaignId
          : this.campaigns[0]?.id;
      if (!startId) {
        this.setErrorAndThrow("Archive loaded but no campaign remains");
      }
      this.markDirty();
      await this.loadCampaign(startId);
      if (
        migrated.data.currentSessionId &&
        this.sessions.some((session) => session.id === migrated.data.currentSessionId)
      ) {
        await this.selectSession(asSessionId(migrated.data.currentSessionId));
      }
      this.emit();
  }

  mediaUrl(id: MediaId): string | null {
    return this.objectUrls.get(id) ?? null;
  }

  private setErrorAndThrow(message: string): never {
    this.error = message;
    this.emit();
    throw new Error(message);
  }

  private requireDb(): GmDb {
    if (!this.db) {
      this.setErrorAndThrow("Database is not open");
    }
    return this.db;
  }

  private requireCampaignId(): CampaignId {
    if (!this.currentCampaignId) {
      this.setErrorAndThrow("No campaign selected");
    }
    return this.currentCampaignId;
  }

  private requireCampaign(): Campaign {
    const campaign = this.campaigns.find((item) => item.id === this.currentCampaignId);
    if (!campaign) {
      this.setErrorAndThrow("Current campaign is missing");
    }
    return campaign;
  }

  private requireSessionId(): SessionId {
    if (!this.currentSessionId) {
      this.setErrorAndThrow("No session selected");
    }
    return this.currentSessionId;
  }

  private requireSession(): Session {
    const session = this.sessions.find((item) => item.id === this.currentSessionId);
    if (!session) {
      this.setErrorAndThrow("No session selected");
    }
    return session;
  }

  private requireEntity(id: EntityId): Entity {
    const entity = this.entities.find((item) => item.id === id);
    if (!entity) {
      this.setErrorAndThrow(`Entity ${id} is missing`);
    }
    return entity;
  }

  private requireChunk(id: ChunkId): SourceChunk {
    const chunk = this.chunks.find((item) => item.id === id);
    if (!chunk) {
      this.setErrorAndThrow(`Chunk ${id} is missing`);
    }
    return chunk;
  }

  private requireEncounter(): EncounterState {
    if (!this.encounter) {
      this.setErrorAndThrow("No encounter is running");
    }
    return this.encounter;
  }

  private encounterTarget(): EncounterTarget {
    if (this.surface === "table" && this.openedEncounterEntityId !== null) {
      return { kind: "card", entityId: this.openedEncounterEntityId };
    }
    return { kind: "session" };
  }

  private encounterStateFromCard(entity: Entity): EncounterState {
    const board = encounterFromCard(entity);
    if (board === null) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” has no encounter`);
    }
    const sessionId = entity.sessionId ?? this.requireSessionId();
    return { ...board, sessionId };
  }

  private requireTargetEncounter(): EncounterState {
    const target = this.encounterTarget();
    if (target.kind === "session") {
      return this.requireEncounter();
    }
    return this.encounterStateFromCard(this.requireEntity(target.entityId));
  }

  private async ensureTargetEncounter(): Promise<EncounterState> {
    const target = this.encounterTarget();
    if (target.kind === "session") {
      return this.ensureEncounter();
    }
    return this.requireTargetEncounter();
  }

  private liveBoard(encounter: EncounterState): EncounterState {
    let mapMediaId = encounter.mapMediaId;
    const fighters: EncounterParticipant[] = [];
    for (const participant of encounter.participants) {
      const entity = this.entities.find((item) => item.id === participant.entityId) ?? null;
      if (entity !== null && isMapCard(entity)) {
        const mediaId = mapMediaIdFromCard(entity);
        if (mediaId !== null) {
          mapMediaId = mediaId;
        }
        continue;
      }
      fighters.push(participant);
    }
    if (fighters.length === 0) {
      return { ...encounter, participants: [], mapMediaId };
    }
    const fighterEntityIds = new Set(fighters.map((fighter) => fighter.entityId));
    const kept = encounter.tokens.filter(
      (token) =>
        token.entityId === null ||
        (token.participantId === null &&
          token.entityId !== null &&
          !fighterEntityIds.has(token.entityId)),
    );
    const gridSize = encounter.gridSize ?? GRID_SIZE_DEFAULT;
    const tokenSize = encounter.live ? encounter.tokenSize : tokenSizeFittingGrid(gridSize);
    return {
      ...encounter,
      participants: fighters,
      mapMediaId,
      live: true,
      tokenSize,
      tokens: [...this.tokensFromRoster(encounter, fighters, true), ...kept],
    };
  }

  private async ensureEncounterCategory(): Promise<void> {
    const campaign = this.requireCampaign();
    if (campaign.cardCategories.includes(ENCOUNTER_CATEGORY)) {
      return;
    }
    const next: Campaign = {
      ...campaign,
      cardCategories: [...campaign.cardCategories, ENCOUNTER_CATEGORY],
    };
    await this.requireDb().put("campaigns", next);
    this.markDirty();
    this.campaigns = this.campaigns.map((item) => (item.id === next.id ? next : item));
    if (!this.categoryFilters.includes(ENCOUNTER_CATEGORY)) {
      this.categoryFilters = [...this.categoryFilters, ENCOUNTER_CATEGORY];
    }
  }

  private tableEncounterBoard(): EncounterBoard | null {
    if (this.openedEncounterEntityId !== null) {
      const entity = this.entities.find((item) => item.id === this.openedEncounterEntityId);
      if (!entity) {
        return this.encounter;
      }
      return encounterFromCard(entity) ?? this.encounter;
    }
    return this.encounter;
  }

  private requireOpenRouter(): OpenRouterConfig {
    const key = this.settings.openRouterApiKey;
    if (key === null) {
      this.setErrorAndThrow("OpenRouter API key is not set");
    }
    return {
      apiKey: key,
      chatModel: this.settings.openRouterModelChat,
      imageModel: this.settings.openRouterModelImage,
    };
  }

  private async ensureWebSource(): Promise<Source> {
    const existing = this.sources.find((source) => source.kind === "manual" && source.title === "Web");
    if (existing) {
      return existing;
    }
    const source: Source = {
      id: newSourceId(),
      campaignId: this.requireCampaignId(),
      title: "Web",
      kind: "manual",
      createdAt: nowIso(),
      mimeType: null,
      bytes: null,
    };
    await this.requireDb().put("sources", source);
    this.sources = [...this.sources, source];
    return source;
  }

  private async ensureEncounter(): Promise<EncounterState> {
    if (this.encounter) {
      return this.encounter;
    }
    const encounter = emptyEncounter(this.requireSessionId());
    await this.putEncounter(encounter, { kind: "session" });
    return encounter;
  }

  private participantFromEntity(entityId: EntityId): EncounterParticipant {
    const entity = this.requireEntity(entityId);
    return {
      id: newParticipantId(),
      entityId,
      label: entity.runCard.title,
      tracks: cloneTracks(tracksFrom(entity.runCard)),
      conditions: [],
      currentHp: instanceCurrentHpFor(entity, null),
    };
  }

  private mapEncounterToken(
    encounter: EncounterState,
    tokenId: TokenId,
    update: (token: BattlegroundToken) => BattlegroundToken,
  ): BattlegroundToken[] {
    let found = false;
    const tokens = encounter.tokens.map((token) => {
      if (token.id !== tokenId) {
        return token;
      }
      found = true;
      return update(token);
    });
    if (!found) {
      this.setErrorAndThrow(`Encounter has no token ${tokenId}`);
    }
    return tokens;
  }

  private tokensFromRoster(
    encounter: EncounterState,
    participants: ReadonlyArray<EncounterParticipant>,
    reuseLayout: boolean,
  ): BattlegroundToken[] {
    const pool = new Map<EntityId, BattlegroundToken[]>();
    if (reuseLayout) {
      for (const token of encounter.tokens) {
        if (token.entityId === null) {
          continue;
        }
        const list = pool.get(token.entityId) ?? [];
        list.push(token);
        pool.set(token.entityId, list);
      }
    }
    return participants.map((participant, index) => {
      const reused = pool.get(participant.entityId)?.shift();
      return this.tokenForParticipant(participant, index, reused ?? null);
    });
  }

  private tokenForParticipant(
    participant: EncounterParticipant,
    index: number,
    reused: BattlegroundToken | null = null,
  ): BattlegroundToken {
    return {
      id: newTokenId(),
      entityId: participant.entityId,
      participantId: participant.id,
      x: reused?.x ?? 0.18 + (index % 5) * 0.14,
      y: reused?.y ?? 0.22 + Math.floor(index / 5) * 0.16,
      visible: true,
      label: participant.label,
      scale: reused?.scale ?? 1,
      shape: reused?.shape ?? "portrait",
      color: reused?.color ?? null,
    };
  }

  private async insertEntity(runCard: RunCard, lifecycle: Entity["lifecycle"]): Promise<Entity> {
    const category =
      runCard.category.trim().length > 0 ? runCard.category.trim() : this.addCategory.trim();
    const entity: Entity = {
      id: newEntityId(),
      campaignId: this.requireCampaignId(),
      sessionId: this.currentSessionId,
      runCard: syncCombatStatsForCategory({ ...runCard, category }),
      lifecycle,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.putEntity(entity);
    this.reindex();
    this.focusEntityId = entity.id;
    this.openedEntityId = entity.id;
    this.placeOnTable(entity.id);
    await this.persistTableCards();
    this.emit();
    return entity;
  }

  private placeOnTable(id: EntityId): boolean {
    if (this.tableCardIds.includes(id)) {
      return false;
    }
    this.tableCardIds = [id, ...this.tableCardIds];
    return true;
  }

  private async persistTableCards(): Promise<void> {
    const campaignId = this.currentCampaignId;
    if (campaignId === null) {
      this.setErrorAndThrow("No campaign selected");
    }
    await this.requireDb().put("meta", JSON.stringify(this.tableCardIds), tableCardsMetaKey(campaignId));
    this.markDirty();
  }

  private async putEntity(entity: Entity): Promise<void> {
    await this.requireDb().put("entities", entity);
    this.markDirty();
    const index = this.entities.findIndex((item) => item.id === entity.id);
    if (index === -1) {
      this.entities = [...this.entities, entity];
      return;
    }
    const next = [...this.entities];
    next[index] = entity;
    this.entities = next;
  }

  private async syncParticipantHpOwnership(
    entityId: EntityId,
    previousCardCurrentHp: number | null,
  ): Promise<void> {
    const entity = this.requireEntity(entityId);
    if (this.encounter) {
      const next = withParticipantHpOwnership(this.encounter, entity, previousCardCurrentHp);
      if (next !== this.encounter) {
        await this.putEncounter(
          { ...next, sessionId: this.encounter.sessionId },
          { kind: "session" },
        );
      }
    }
    const cards = [...this.entities];
    for (const card of cards) {
      const board = encounterFromCard(card);
      if (board === null) {
        continue;
      }
      const next = withParticipantHpOwnership(board, entity, previousCardCurrentHp);
      if (next === board) {
        continue;
      }
      await this.putEntity({
        ...card,
        runCard: withEncounterBlock(card.runCard, next),
        updatedAt: nowIso(),
      });
    }
  }

  private async putEncounter(
    encounter: EncounterState,
    target: EncounterTarget = this.encounterTarget(),
  ): Promise<void> {
    if (target.kind === "session") {
      await this.requireDb().put("encounters", encounter);
      this.markDirty();
      this.encounter = encounter;
      return;
    }
    const entity = this.requireEntity(target.entityId);
    if (!isEncounterCard(entity)) {
      this.setErrorAndThrow(`Card “${entity.runCard.title}” is not an encounter`);
    }
    await this.putEntity({
      ...entity,
      runCard: withEncounterBlock(entity.runCard, boardOf(encounter)),
      updatedAt: nowIso(),
    });
  }

  private async putMedia(media: MediaRecord): Promise<void> {
    await this.requireDb().put("media", media);
    this.markDirty();
    this.media = [...this.media.filter((item) => item.id !== media.id), media];
    this.rememberMediaUrl(media);
  }

  private async deleteMedia(mediaId: MediaId): Promise<void> {
    await this.requireDb().delete("media", mediaId);
    this.markDirty();
    this.media = this.media.filter((item) => item.id !== mediaId);
    const url = this.objectUrls.get(mediaId);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(mediaId);
    }
  }

  private rememberMediaUrl(media: MediaRecord): void {
    const previous = this.objectUrls.get(media.id);
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.objectUrls.set(media.id, URL.createObjectURL(media.bytes));
  }

  private reindex(): void {
    rebuildCatalog(this.catalog, this.entities, this.chunks);
  }

  private ensureSessionSelection(): void {
    if (this.currentSessionId === null) {
      return;
    }
    if (this.sessions.some((session) => session.id === this.currentSessionId)) {
      return;
    }
    this.currentSessionId = this.sessions[0]?.id ?? null;
  }

  private async loadCampaign(id: CampaignId): Promise<void> {
    const db = this.requireDb();
    this.currentCampaignId = id;
    this.openedEncounterEntityId = null;
    if (this.surface === "table") {
      this.surface = "gm";
    }
    await db.put("meta", id, META_CAMPAIGN);
    const warnings: MigrationWarning[] = [];
    this.entities = readStored(await db.getAllFromIndex("entities", "campaignId", id), readEntity, warnings);
    this.sessions = readStored(await db.getAllFromIndex("sessions", "campaignId", id), readSession, warnings);
    this.sources = readStored(await db.getAllFromIndex("sources", "campaignId", id), readSource, warnings);
    this.chunks = readStored(await db.getAllFromIndex("chunks", "campaignId", id), readChunk, warnings);
    this.media = readStored(await db.getAllFromIndex("media", "campaignId", id), readMedia, warnings);
    for (const record of this.media) {
      this.rememberMediaUrl(record);
    }
    const metaSession = await db.get("meta", META_SESSION);
    if (metaSession === "") {
      this.currentSessionId = null;
      this.encounter = null;
    } else if (
      typeof metaSession === "string" &&
      metaSession.length > 0 &&
      this.sessions.some((session) => session.id === metaSession)
    ) {
      this.currentSessionId = asSessionId(metaSession);
      this.encounter = readEncounter(await db.get("encounters", this.currentSessionId), warnings);
      if (
        this.encounter?.live &&
        this.encounter.tokens.length === 0 &&
        this.encounter.participants.length > 0
      ) {
        this.encounter = {
          ...this.encounter,
          tokens: this.tokensFromRoster(this.encounter, this.encounter.participants, false),
        };
        await this.putEncounter(this.encounter);
      }
      readStored(
        await db.getAllFromIndex("logEntries", "sessionId", this.currentSessionId),
        readLogEntry,
        warnings,
      );
    } else {
      this.currentSessionId = this.sessions[0]?.id ?? null;
      if (this.currentSessionId) {
        this.encounter = readEncounter(await db.get("encounters", this.currentSessionId), warnings);
        if (
          this.encounter?.live &&
          this.encounter.tokens.length === 0 &&
          this.encounter.participants.length > 0
        ) {
          this.encounter = {
            ...this.encounter,
            tokens: this.tokensFromRoster(this.encounter, this.encounter.participants, false),
          };
          await this.putEncounter(this.encounter);
        }
        readStored(
          await db.getAllFromIndex("logEntries", "sessionId", this.currentSessionId),
          readLogEntry,
          warnings,
        );
        await db.put("meta", this.currentSessionId, META_SESSION);
      } else {
        this.encounter = null;
        await db.put("meta", "", META_SESSION);
      }
    }
    if (warnings.length > 0) {
      this.note(formatMigrationWarnings(warnings));
    }
    this.ensureSessionSelection();
    await this.loadTableCards(id);
    await this.ensureDefaultCardCategories();
    this.syncCategoryFiltersToCampaign();
    this.reindex();
  }

  private async ensureDefaultCardCategories(): Promise<void> {
    const campaign = this.campaigns.find((item) => item.id === this.currentCampaignId);
    if (!campaign) {
      return;
    }
    const current = campaign.cardCategories;
    const needsDefaults = current.length === 0;
    const needsReorder =
      current.length === DEFAULT_CARD_CATEGORIES.length &&
      DEFAULT_CARD_CATEGORIES.every((name) => current.includes(name)) &&
      current.some((name, index) => name !== DEFAULT_CARD_CATEGORIES[index]);
    if (!needsDefaults && !needsReorder) {
      return;
    }
    const next: Campaign = {
      ...campaign,
      cardCategories: [...DEFAULT_CARD_CATEGORIES],
    };
    await this.requireDb().put("campaigns", next);
    this.markDirty();
    this.campaigns = this.campaigns.map((item) => (item.id === next.id ? next : item));
  }

  private syncCategoryFiltersToCampaign(): void {
    const campaign = this.campaigns.find((item) => item.id === this.currentCampaignId);
    const categories = campaign?.cardCategories ?? [];
    this.categoryFilters = [...categories];
    if (this.addCategory.length > 0 && !categories.includes(this.addCategory)) {
      this.addCategory = categories[0] ?? "";
    }
    if (this.addCategory.length === 0 && categories.length > 0) {
      this.addCategory = categories[0] ?? "";
    }
  }

  setAddCategory(category: string): void {
    const campaign = this.requireCampaign();
    if (category.length > 0 && !campaign.cardCategories.includes(category)) {
      this.setErrorAndThrow(`Unknown category “${category}”`);
    }
    this.addCategory = category;
    this.emit();
  }

  async createCardCategory(raw: string): Promise<void> {
    const name = raw.trim();
    if (name.length === 0) {
      this.setErrorAndThrow("Category name is empty");
    }
    const campaign = this.requireCampaign();
    if (campaign.cardCategories.includes(name)) {
      this.setErrorAndThrow(`Category “${name}” already exists`);
    }
    const next: Campaign = {
      ...campaign,
      cardCategories: [...campaign.cardCategories, name],
    };
    await this.requireDb().put("campaigns", next);
    this.markDirty();
    this.campaigns = this.campaigns.map((item) => (item.id === next.id ? next : item));
    this.addCategory = name;
    if (!this.categoryFilters.includes(name)) {
      this.categoryFilters = [...this.categoryFilters, name];
    }
    this.emit();
  }

  toggleCategoryFilter(category: string): void {
    const campaign = this.requireCampaign();
    if (!campaign.cardCategories.includes(category)) {
      this.setErrorAndThrow(`Unknown category “${category}”`);
    }
    if (this.categoryFilters.includes(category)) {
      this.categoryFilters = this.categoryFilters.filter((item) => item !== category);
    } else {
      this.categoryFilters = [...this.categoryFilters, category];
    }
    this.emit();
  }

  toggleAllCategoryFilters(): void {
    const campaign = this.requireCampaign();
    const categories = campaign.cardCategories;
    const allSelected =
      categories.length > 0 && categories.every((name) => this.categoryFilters.includes(name));
    this.categoryFilters = allSelected ? [] : [...categories];
    this.emit();
  }

  private note(message: string): void {
    this.error = this.error === null ? message : `${this.error} — ${message}`;
  }

  private async loadTableCards(campaignId: CampaignId): Promise<void> {
    const raw = await this.requireDb().get("meta", tableCardsMetaKey(campaignId));
    const known = new Set(this.entities.map((entity) => entity.id));
    if (raw === undefined) {
      this.tableCardIds = [];
    } else {
      this.tableCardIds = parseTableCardIds(raw, known);
    }
    this.openedEntityId = null;
  }

  private async writeEmptyCampaign(): Promise<void> {
    const campaign: Campaign = {
      id: newCampaignId(),
      name: "Campaign",
      createdAt: nowIso(),
      cardCategories: [...DEFAULT_CARD_CATEGORIES],
    };
    await this.requireDb().put("campaigns", campaign);
    this.campaigns = [campaign];
  }

  private async readSettings(): Promise<void> {
    const stored: unknown = await this.requireDb().get("settings", "app");
    if (stored === undefined) {
      this.settings = DEFAULT_SETTINGS;
      return;
    }
    try {
      this.settings = parseAppSettings(stored);
    } catch (error: unknown) {
      this.settings = DEFAULT_SETTINGS;
      this.error = `Settings could not be read (${errorMessage(error)}). Campaign files were not touched.`;
      return;
    }
    await this.requireDb().put("settings", this.settings, "app");
  }

  private async recoverMissingCampaigns(metaCampaign: string | undefined): Promise<void> {
    const backups = await this.requireDb().getAll("backups");
    if (backups.length > 0) {
      const forRemembered =
        metaCampaign === undefined ? backups : backups.filter((item) => item.campaignId === metaCampaign);
      const pick = newestBackup(forRemembered.length > 0 ? forRemembered : backups);
      await this.restoreBackup(pick);
      this.error = `Campaign index was empty. Restored “${pick.campaign.name}” from the backup saved ${pick.savedAt}.`;
      return;
    }
    if (await this.restoreOrphanedCampaigns()) {
      return;
    }
    if (metaCampaign !== undefined) {
      this.setErrorAndThrow(
        `Saved campaign ${metaCampaign} is gone, no backup exists, and the index is empty. Refusing to start a blank campaign over it.`,
      );
    }
    await this.writeEmptyCampaign();
  }

  private async restoreOrphanedCampaigns(): Promise<boolean> {
    const db = this.requireDb();
    const leftover =
      (await db.count("entities")) +
      (await db.count("sessions")) +
      (await db.count("scenes")) +
      (await db.count("sources")) +
      (await db.count("media"));
    if (leftover === 0) {
      return false;
    }
    const [entities, sessions, scenes, sources, media] = await Promise.all([
      db.getAll("entities"),
      db.getAll("sessions"),
      db.getAll("scenes"),
      db.getAll("sources"),
      db.getAll("media"),
    ]);
    const ids = new Set<string>();
    for (const row of [...entities, ...sessions, ...scenes, ...sources, ...media]) {
      ids.add(row.campaignId);
    }
    if (ids.size === 0) {
      this.setErrorAndThrow(
        `The database still has ${String(leftover)} stored records but no campaign id. Refusing to wipe them.`,
      );
    }
    for (const id of ids) {
      const campaign: Campaign = {
        id: asCampaignId(id),
        name: `Recovered campaign ${id.slice(0, 8)}`,
        createdAt: nowIso(),
        cardCategories: [...DEFAULT_CARD_CATEGORIES],
      };
      await db.put("campaigns", campaign);
      this.campaigns = [...this.campaigns, campaign];
    }
    this.error = `Campaign index was empty. Recovered ${String(ids.size)} campaign(s) from stored files and cards.`;
    return true;
  }

  private async restoreBackup(backup: CampaignBackup): Promise<void> {
    const warnings: MigrationWarning[] = [];
    const campaign = readCampaign(backup.campaign, warnings);
    if (!campaign) {
      this.setErrorAndThrow("Backup campaign record could not be read");
    }
    const db = this.requireDb();
    await db.put("campaigns", campaign);
    for (const entity of readStored(backup.entities, readEntity, warnings)) {
      await db.put("entities", entity);
    }
    for (const session of readStored(backup.sessions, readSession, warnings)) {
      await db.put("sessions", session);
    }
    const backupScenes = readStored(backup.scenes, readScene, warnings);
    const backupEncounter = readEncounter(backup.encounter, warnings);
    if (backupScenes.length > 0) {
      const folded = foldScenesIntoEncounters(
        backupScenes,
        backupEncounter ? [backupEncounter] : [],
      );
      for (const encounter of folded) {
        await db.put("encounters", encounter);
      }
    } else if (backupEncounter) {
      await db.put("encounters", backupEncounter);
    }
    for (const source of readStored(backup.sources, readSource, warnings)) {
      await db.put("sources", source);
    }
    for (const chunk of readStored(backup.chunks, readChunk, warnings)) {
      await db.put("chunks", chunk);
    }
    for (const record of readStored(backup.media, readMedia, warnings)) {
      await db.put("media", record);
    }
    for (const entry of readStored(backup.logEntries, readLogEntry, warnings)) {
      await db.put("logEntries", entry);
    }
    await db.put("meta", JSON.stringify(backup.tableCardIds), tableCardsMetaKey(backup.campaignId));
    if (!this.campaigns.some((item) => item.id === campaign.id)) {
      this.campaigns = [...this.campaigns, campaign];
    }
    if (warnings.length > 0) {
      this.note(formatMigrationWarnings(warnings));
    }
  }

  private markDirty(): void {
    // Persistence is explicit; campaign backups are user-triggered.
  }

  private createSnapshot(): HostSnapshot {
    const campaign = this.campaigns.find((item) => item.id === this.currentCampaignId) ?? null;
    const session = this.sessions.find((item) => item.id === this.currentSessionId) ?? null;
    const focus = this.entities.find((item) => item.id === this.focusEntityId) ?? null;
    const tableCards: Entity[] = [];
    const missingCards: EntityId[] = [];
    for (const cardId of this.tableCardIds) {
      const entity = this.entities.find((item) => item.id === cardId);
      if (!entity) {
        missingCards.push(cardId);
        continue;
      }
      tableCards.push(entity);
    }
    if (missingCards.length > 0) {
      this.tableCardIds = tableCards.map((entity) => entity.id);
      this.error = `Table cards were missing and dropped: ${missingCards.join(", ")}`;
      this.markDirty();
    }
    const mediaUrls: Record<string, string> = {};
    for (const [id, url] of this.objectUrls) {
      mediaUrls[id] = url;
    }
    return {
      ready: this.ready,
      error: this.error,
      campaigns: this.campaigns,
      campaign,
      entities: this.entities,
      tableCards,
      openedEntityId: this.openedEntityId,
      sessions: this.sessions,
      session,
      focus,
      sources: this.sources,
      chunks: this.chunks,
      encounter: this.encounter,
      tableEncounter: this.tableEncounterBoard(),
      openedEncounterEntityId: this.openedEncounterEntityId,
      settings: this.settings,
      mode: this.mode,
      surface: this.surface,
      now: {
        campaignId: this.currentCampaignId,
        sessionId: this.currentSessionId,
        focusEntityId: this.focusEntityId,
        surface: this.surface,
      },
      mediaUrls,
      sourceView: this.sourceView,
      mediaViewEntityId: this.mediaViewEntityId,
      urlView: this.urlView,
      busy: this.busy,
      categoryFilters: this.categoryFilters,
      addCategory: this.addCategory,
    };
  }

  private emit(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function remapCardRefs(
  card: RunCard,
  mediaIdMap: ReadonlyMap<MediaId, MediaId>,
  sourceIdMap: ReadonlyMap<SourceId, SourceId>,
): RunCard {
  const blocks = [];
  for (const block of card.blocks) {
    if (block.kind === "media") {
      const nextId = mediaIdMap.get(block.mediaId);
      if (!nextId) {
        throw new Error(`Card references missing image ${block.mediaId}`);
      }
      blocks.push({ ...block, mediaId: nextId });
      continue;
    }
    if (block.kind === "provenance") {
      const nextId = sourceIdMap.get(block.sourceId);
      if (!nextId) {
        continue;
      }
      blocks.push({ ...block, sourceId: nextId });
      continue;
    }
    if (block.kind === "encounter") {
      if (block.mapMediaId === null) {
        blocks.push(block);
        continue;
      }
      const nextId = mediaIdMap.get(block.mapMediaId);
      if (!nextId) {
        throw new Error(`Card references missing image ${block.mapMediaId}`);
      }
      blocks.push({ ...block, mapMediaId: nextId });
      continue;
    }
    blocks.push(block);
  }
  return { ...card, blocks };
}

function isMapCard(entity: Entity): boolean {
  if (isEncounterCard(entity)) {
    return false;
  }
  if (entity.runCard.category === "Battlemap") {
    return true;
  }
  if (
    entity.runCard.tags.includes("image") ||
    entity.runCard.tags.includes("map") ||
    entity.runCard.tags.includes("battlemap")
  ) {
    return true;
  }
  return mediaFrom(entity.runCard, "map") !== null;
}

function mapMediaIdFromCard(entity: Entity): MediaId | null {
  return (
    mediaFrom(entity.runCard, "map")?.mediaId ??
    mediaFrom(entity.runCard, "other")?.mediaId ??
    mediaFrom(entity.runCard, "portrait")?.mediaId ??
    mediaFrom(entity.runCard, "token")?.mediaId ??
    null
  );
}

export const hostStore = new HostStore();
