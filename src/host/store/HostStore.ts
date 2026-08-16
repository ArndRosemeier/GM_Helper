import MiniSearch from "minisearch";
import {
  asCampaignId,
  asSessionId,
  newCampaignId,
  newEntityId,
  newFactPinId,
  newLogEntryId,
  newMediaId,
  newParticipantId,
  newSceneId,
  newSessionId,
  newSourceId,
  newTokenId,
  type CampaignId,
  type ChunkId,
  type EntityId,
  type MediaId,
  type ParticipantId,
  type SceneId,
  type SessionId,
  type SourceId,
  type TokenId,
  type TrackId,
} from "../ids";
import {
  nowIso,
  type AppMode,
  emptyBattleground,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  type BattlegroundToken,
  type BusyStatus,
  type Campaign,
  type CampaignExport,
  type EncounterParticipant,
  type EncounterState,
  type Entity,
  type IsoDateTime,
  type LogEntry,
  type MediaRecord,
  type NowContext,
  type RunCard,
  type Scene,
  type SearchHit,
  type Session,
  type Source,
  type SourceChunk,
  type SourceView,
  type Surface,
  type UrlView,
  type WebSearchView,
} from "../types";
import { migrateImportedCampaign, migrateOpenDatabase, migrationBanner, SCHEMA_VERSION } from "../persist";
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
  type SurfaceLock,
} from "../settings";
import { createCatalog, rebuildCatalog, searchCatalog } from "../search/catalog";
import {
  adjustTrackInCard,
  cloneTracks,
  mediaFrom,
  newTrack,
  replaceTracks,
  tracksFrom,
  pdfBookmarkForPage,
  withFacts,
  withMedia,
  withProvenance,
  withSecret,
  withText,
} from "../runCard";
import { ingestFile } from "../../lib/ingest";
import { parseEntityUrl, titleFromEntityUrl } from "../../lib/entityUrl";
import { openExternalTab } from "../../lib/iframeEmbed";
import { googleSearchUrl, webSearchQuery } from "../../lib/webSearch";
import { localNpcCard } from "../../lib/names";
import {
  completeJson,
  generateImagePng,
  parseGeneratedNpc,
  parseLiftedCard,
  type OpenRouterConfig,
} from "../../lib/openrouter";
import { errorMessage, isDeadPdfTextLayer, isRenderCancelled } from "../errors";
import { backupSlotId, newestBackup, type CampaignBackup } from "./backup";
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
  scenes: ReadonlyArray<Scene>;
  scene: Scene | null;
  focus: Entity | null;
  sources: ReadonlyArray<Source>;
  chunks: ReadonlyArray<SourceChunk>;
  logEntries: ReadonlyArray<LogEntry>;
  encounter: EncounterState | null;
  settings: AppSettings;
  mode: AppMode;
  surface: Surface;
  now: NowContext;
  mediaUrls: Readonly<Record<string, string>>;
  sourceView: SourceView | null;
  mediaViewId: MediaId | null;
  webSearchView: WebSearchView | null;
  urlView: UrlView | null;
  busy: BusyStatus | null;
  lastBackupAt: IsoDateTime | null;
};

const META_CAMPAIGN = "currentCampaignId";
const META_SESSION = "currentSessionId";

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
  private scenes: Scene[] = [];
  private sources: Source[] = [];
  private chunks: SourceChunk[] = [];
  private logEntries: LogEntry[] = [];
  private media: MediaRecord[] = [];
  private encounter: EncounterState | null = null;
  private settings: AppSettings = DEFAULT_SETTINGS;
  private currentCampaignId: CampaignId | null = null;
  private currentSessionId: SessionId | null = null;
  private currentSceneId: SceneId | null = null;
  private focusEntityId: EntityId | null = null;
  private tableCardIds: EntityId[] = [];
  private openedEntityId: EntityId | null = null;
  private mode: AppMode = "run";
  private surface: Surface = "gm";
  private ready = false;
  private error: string | null = null;
  private sourceView: SourceView | null = null;
  private mediaViewId: MediaId | null = null;
  private webSearchView: WebSearchView | null = null;
  private urlView: UrlView | null = null;
  private busy: BusyStatus | null = null;
  private snapshot: HostSnapshot = this.createSnapshot();
  private booting: Promise<void> | null = null;
  private dataDirty = false;
  private backupTimer: number | null = null;
  private lastBackupAt: IsoDateTime | null = null;

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
    const metaSession = await this.db.get("meta", META_SESSION);
    if (metaSession) {
      const sessionId = asSessionId(metaSession);
      if (this.sessions.some((session) => session.id === sessionId)) {
        this.currentSessionId = sessionId;
      }
    }
    this.ensureSessionSelection();
    this.ready = true;
    await this.persistCampaignBackup();
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

  applyPosture(posture: "flat" | "tilted"): void {
    if (
      posture === "flat" &&
      this.settings.startEncounterOnFlat &&
      this.encounter !== null &&
      this.encounter.participants.length > 0
    ) {
      this.run(this.beginEncounter());
      return;
    }
    switch (this.settings.surfaceLock) {
      case "hold-gm":
        this.setSurface("gm");
        return;
      case "hold-table":
        this.setSurface("table");
        return;
      case "auto":
        this.setSurface(posture === "flat" ? "table" : "gm");
        return;
      default: {
        const exhausted: never = this.settings.surfaceLock;
        this.setErrorAndThrow(`Unknown surface lock: ${String(exhausted)}`);
      }
    }
  }

  setSurfaceLock(lock: SurfaceLock): void {
    this.run(this.applySettingsPatch({ field: "surfaceLock", value: lock }));
    switch (lock) {
      case "hold-gm":
        this.setSurface("gm");
        return;
      case "hold-table":
        this.setSurface("table");
        return;
      case "auto":
        return;
      default: {
        const exhausted: never = lock;
        this.setErrorAndThrow(`Unknown surface lock: ${String(exhausted)}`);
      }
    }
  }

  setSurface(surface: Surface): void {
    if (this.surface === surface) {
      return;
    }
    this.surface = surface;
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
      pinnedFacts: [],
      createdAt: nowIso(),
    };
    await this.requireDb().put("campaigns", campaign);
    this.markDirty();
    this.campaigns = [...this.campaigns, campaign];
    await this.loadCampaign(campaign.id);
    this.emit();
  }

  async selectSession(id: SessionId): Promise<void> {
    this.currentSessionId = id;
    await this.requireDb().put("meta", id, META_SESSION);
    this.encounter = (await this.requireDb().get("encounters", id)) ?? null;
    this.logEntries = await this.requireDb().getAllFromIndex("logEntries", "sessionId", id);
    this.ensureSceneSelection();
    this.emit();
  }

  async createSession(title: string): Promise<Session> {
    const campaignId = this.requireCampaignId();
    const session: Session = {
      id: newSessionId(),
      campaignId,
      title,
      createdAt: nowIso(),
    };
    await this.requireDb().put("sessions", session);
    this.markDirty();
    this.sessions = [...this.sessions, session];
    await this.selectSession(session.id);
    return session;
  }

  selectScene(id: SceneId): void {
    this.currentSceneId = id;
    const scene = this.scenes.find((item) => item.id === id);
    const first = scene?.entityIds[0];
    if (first) {
      this.focusEntityId = first;
    }
    this.emit();
  }

  async deleteSession(id: SessionId): Promise<void> {
    const db = this.requireDb();
    const scenes = this.scenes.filter((scene) => scene.sessionId === id);
    for (const scene of scenes) {
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
    this.scenes = this.scenes.filter((scene) => scene.sessionId !== id);
    if (this.currentSessionId !== id) {
      this.emit();
      return;
    }
    const next = this.sessions[0];
    if (next) {
      await this.selectSession(next.id);
      return;
    }
    this.currentSessionId = null;
    this.currentSceneId = null;
    this.encounter = null;
    this.logEntries = [];
    this.emit();
  }

  async deleteScene(id: SceneId): Promise<void> {
    await this.requireDb().delete("scenes", id);
    this.markDirty();
    this.scenes = this.scenes.filter((scene) => scene.id !== id);
    if (this.currentSceneId === id) {
      this.ensureSceneSelection();
    }
    this.emit();
  }

  async createScene(title: string, sessionId = this.requireSessionId()): Promise<Scene> {
    const scene: Scene = {
      id: newSceneId(),
      sessionId,
      campaignId: this.requireCampaignId(),
      title,
      description: "",
      entityIds: [],
      battleground: emptyBattleground(),
      order: this.scenes.filter((item) => item.sessionId === sessionId).length,
    };
    await this.requireDb().put("scenes", scene);
    this.markDirty();
    this.scenes = [...this.scenes, scene];
    this.currentSceneId = scene.id;
    this.emit();
    return scene;
  }

  async setSceneDescription(id: SceneId, raw: string): Promise<void> {
    const scene = this.requireScene(id);
    const description = raw.trim();
    if (scene.description === description) {
      return;
    }
    await this.putScene({ ...scene, description });
    this.emit();
  }

  setFocus(id: EntityId | null): void {
    this.focusEntityId = id;
    this.sourceView = null;
    this.mediaViewId = null;
    this.webSearchView = null;
    this.urlView = null;
    if (id !== null && this.placeOnTable(id)) {
      this.run(this.persistTableCards());
    }
    this.emit();
  }

  openCard(id: EntityId): void {
    this.mode = "run";
    this.focusEntityId = id;
    this.openedEntityId = id;
    this.sourceView = null;
    this.mediaViewId = null;
    this.webSearchView = null;
    this.urlView = null;
    if (this.placeOnTable(id)) {
      this.run(this.persistTableCards());
    }
    this.emit();
  }

  async createEntity(runCard: RunCard, lifecycle: Entity["lifecycle"]): Promise<Entity> {
    return this.insertEntity(runCard, lifecycle);
  }

  async createEntityFromUrl(raw: string): Promise<Entity> {
    const url = parseEntityUrl(raw);
    const href = url.toString();
    const source = await this.ensureWebSource();
    const entity = await this.createEntity(
      withProvenance(
        withText({ title: titleFromEntityUrl(url), tags: ["web"], blocks: [] }, href),
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
    this.mediaViewId = null;
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

  async promoteEntity(id: EntityId): Promise<void> {
    const entity = this.requireEntity(id);
    await this.putEntity({ ...entity, lifecycle: "recurring", updatedAt: nowIso() });
    this.emit();
  }

  async deleteEntity(id: EntityId): Promise<void> {
    await this.requireDb().delete("entities", id);
    this.markDirty();
    this.entities = this.entities.filter((entity) => entity.id !== id);
    const campaign = this.requireCampaign();
    const nextCampaign: Campaign = {
      ...campaign,
      pinnedFacts: campaign.pinnedFacts.filter((pin) => pin.entityId !== id),
    };
    if (nextCampaign.pinnedFacts.length !== campaign.pinnedFacts.length) {
      await this.requireDb().put("campaigns", nextCampaign);
      this.campaigns = this.campaigns.map((item) => (item.id === nextCampaign.id ? nextCampaign : item));
    }
    for (const scene of this.scenes) {
      const entityIds = scene.entityIds.filter((entityId) => entityId !== id);
      const tokens = scene.battleground.tokens.filter((token) => token.entityId !== id);
      if (entityIds.length === scene.entityIds.length && tokens.length === scene.battleground.tokens.length) {
        continue;
      }
      await this.putScene({
        ...scene,
        entityIds,
        battleground: { ...scene.battleground, tokens },
      });
    }
    if (this.encounter) {
      const participants = this.encounter.participants.filter((participant) => participant.entityId !== id);
      if (participants.length === 0) {
        await this.endEncounter();
      } else if (participants.length !== this.encounter.participants.length) {
        await this.putEncounter({
          ...this.encounter,
          participants,
          activeIndex: Math.min(this.encounter.activeIndex, participants.length - 1),
          tokens: this.encounter.tokens.filter((token) => token.entityId !== id),
        });
      }
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

  async attachEntityToScene(entityId: EntityId, sceneId = this.requireSceneId()): Promise<void> {
    const scene = this.requireScene(sceneId);
    if (scene.entityIds.includes(entityId)) {
      this.focusEntityId = entityId;
      this.emit();
      return;
    }
    const next: Scene = { ...scene, entityIds: [...scene.entityIds, entityId] };
    await this.putScene(next);
    this.focusEntityId = entityId;
    this.emit();
  }

  async adjustEntityTrack(entityId: EntityId, trackId: TrackId, delta: number): Promise<void> {
    const entity = this.requireEntity(entityId);
    await this.updateRunCard(entityId, adjustTrackInCard(entity.runCard, trackId, delta));
  }

  async pinFact(entityId: EntityId, label: string): Promise<void> {
    const campaign = this.requireCampaign();
    if (campaign.pinnedFacts.some((pin) => pin.entityId === entityId && pin.label === label)) {
      return;
    }
    const next: Campaign = {
      ...campaign,
      pinnedFacts: [...campaign.pinnedFacts, { id: newFactPinId(), entityId, label }],
    };
    await this.requireDb().put("campaigns", next);
    this.markDirty();
    this.campaigns = this.campaigns.map((item) => (item.id === next.id ? next : item));
    this.emit();
  }

  async unpinFact(pinId: string): Promise<void> {
    const campaign = this.requireCampaign();
    const next: Campaign = {
      ...campaign,
      pinnedFacts: campaign.pinnedFacts.filter((pin) => pin.id !== pinId),
    };
    await this.requireDb().put("campaigns", next);
    this.markDirty();
    this.campaigns = this.campaigns.map((item) => (item.id === next.id ? next : item));
    this.emit();
  }

  async addLog(body: string): Promise<void> {
    const entry: LogEntry = {
      id: newLogEntryId(),
      sessionId: this.requireSessionId(),
      sceneId: this.currentSceneId,
      body,
      createdAt: nowIso(),
    };
    await this.requireDb().put("logEntries", entry);
    this.markDirty();
    this.logEntries = [...this.logEntries, entry];
    this.emit();
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
        role: "map",
        bytes: file,
      };
      await this.putMedia(media);
      if (this.currentSceneId) {
        await this.setBattlegroundMap(media.id);
      }
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
    if (this.sourceView?.sourceId === id) {
      this.sourceView = null;
    }
    this.reindex();
    this.emit();
  }

  openSourceView(sourceId: SourceId, page: number | null): void {
    this.sourceView = { sourceId, page };
    this.mediaViewId = null;
    this.webSearchView = null;
    this.urlView = null;
    this.emit();
  }

  openMediaView(mediaId: MediaId): void {
    if (!this.objectUrls.has(mediaId)) {
      this.setErrorAndThrow("That picture is missing");
    }
    this.mediaViewId = mediaId;
    this.sourceView = null;
    this.webSearchView = null;
    this.urlView = null;
    this.emit();
  }

  openUrlView(raw: string): void {
    const url = parseEntityUrl(raw);
    this.urlView = { href: url.toString() };
    this.sourceView = null;
    this.mediaViewId = null;
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

  openWebSearch(find: string): void {
    let query: string;
    try {
      query = webSearchQuery(this.settings.webSearchPrefix, find);
    } catch (error: unknown) {
      this.setErrorAndThrow(error instanceof Error ? error.message : "Find is empty");
    }
    this.webSearchView = { query };
    this.openUrlView(googleSearchUrl(query));
  }

  closeWebSearch(): void {
    this.webSearchView = null;
    this.emit();
  }

  closeMediaView(): void {
    this.mediaViewId = null;
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
    this.sourceView = { ...this.sourceView, page };
    this.emit();
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
        withText({ title, tags: ["image"], blocks: [] }, title),
        { kind: "media", mediaId: media.id, role },
      ),
      "recurring",
    );
    if (role === "map" && this.currentSceneId) {
      await this.setBattlegroundMap(media.id);
    }
    this.sourceView = null;
    this.mediaViewId = null;
    this.emit();
    return entity;
  }

  async saveChunkAsCard(chunkId: ChunkId): Promise<Entity> {
    const chunk = this.requireChunk(chunkId);
    const source = this.sources.find((item) => item.id === chunk.sourceId);
    const tags = source?.kind === "pdf" ? ["pdf"] : [];
    return this.createEntity(
      withProvenance(
        withText(
          { title: chunk.heading, tags, blocks: [] },
          chunk.text.slice(0, 600),
        ),
        {
          kind: "provenance",
          sourceId: chunk.sourceId,
          page: chunk.page,
          url: null,
          excerpt: chunk.text.slice(0, 240),
        },
      ),
      "recurring",
    );
  }

  async bookmarkPdfPage(sourceId: SourceId, page: number): Promise<Entity> {
    this.sourceView = null;
    const existing = pdfBookmarkForPage(this.entities, sourceId, page);
    if (existing) {
      this.openCard(existing.id);
      return existing;
    }
    const source = this.sources.find((item) => item.id === sourceId);
    if (!source || source.kind !== "pdf") {
      this.setErrorAndThrow("That source is not a PDF");
    }
    const chunk = this.chunks.find((item) => item.sourceId === sourceId && item.page === page);
    const heading = chunk?.heading ?? source.title;
    const title = `${heading} p.${String(page)}`;
    const text = chunk?.text ?? title;
    return this.createEntity(
      withProvenance(
        withText({ title, tags: ["pdf"], blocks: [] }, text.slice(0, 600)),
        {
          kind: "provenance",
          sourceId,
          page,
          url: null,
          excerpt: text.slice(0, 240),
        },
      ),
      "recurring",
    );
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
    let card: RunCard = { title: lifted.title, tags, blocks: [] };
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
                ? `Writing someone who matches “${ask}” and the scene notes. The card appears when the text is ready.`
                : "Writing someone who fits the scene notes. The card appears when the text is ready.",
          }
        : {
            title: "Making someone here",
            detail: "Picking a name from the local tables.",
          },
    );
    try {
    let card = localNpcCard();
    if (useAi) {
      const scene = this.scenePromptContext();
      const raw = await completeJson(this.requireOpenRouter(), [
        {
          role: "system",
          content:
            "Create a brief NPC for a live RPG table. Return JSON: {title, look, want, secret, firstLine}. No stats unless implied by the ask. Fit the person to the scene notes. If the GM gave a hint, follow it.",
        },
        {
          role: "user",
          content:
            ask.length > 0
              ? `Someone the party just stopped to talk to. The GM wants: ${ask}.\n\nCurrent scene:\n${scene}`
              : `Someone the party just stopped to talk to.\n\nCurrent scene:\n${scene}`,
        },
      ]);
      const npc = parseGeneratedNpc(raw);
      card = withSecret(
        withFacts(
          withText({ title: npc.title, tags: ["npc"], blocks: [] }, npc.look),
          [
            { label: "Want", value: npc.want },
            { label: "First line", value: npc.firstLine },
          ],
        ),
        npc.secret,
      );
    }
    const entity = await this.createEntity(card, "ephemeral");
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
      `Tabletop RPG portrait, no text, of ${entity.runCard.title}. ${entity.runCard.blocks
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
      detail: "The image model is drawing the battleground. This can take a minute.",
    });
    try {
    const scene = this.requireScene(this.requireSceneId());
    const blob = await generateImagePng(
      this.requireOpenRouter(),
      `Top-down battle map sketch, no text labels, for a scene called ${scene.title}. ${scene.description.trim()} Clear floor space for tokens.`,
      "16:9",
    );
    const media: MediaRecord = {
      id: newMediaId(),
      campaignId: scene.campaignId,
      mimeType: blob.type || "image/png",
      role: "map",
      bytes: blob,
    };
    await this.putMedia(media);
    await this.setBattlegroundMap(media.id);
    } finally {
      this.setBusy(null);
    }
  }

  async setBattlegroundMap(mediaId: MediaId | null): Promise<void> {
    const scene = this.requireScene(this.requireSceneId());
    await this.putScene({
      ...scene,
      battleground: { ...scene.battleground, mapMediaId: mediaId },
    });
    this.emit();
  }

  async generateTokenArt(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    this.setBusy({
      title: "Drawing a token",
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
        `Tabletop RPG character or object, no text, centered, suitable for a circular miniature token, of ${entity.runCard.title}. ${text} ${facts}`,
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

  async addToken(entityId: EntityId, visible: boolean): Promise<void> {
    const scene = this.requireScene(this.requireSceneId());
    const entity = this.requireEntity(entityId);
    const token = {
      id: newTokenId(),
      entityId,
      participantId: null,
      x: 0.35 + Math.random() * 0.3,
      y: 0.35 + Math.random() * 0.3,
      visible,
      label: entity.runCard.title,
    };
    await this.putScene({
      ...scene,
      battleground: { ...scene.battleground, tokens: [...scene.battleground.tokens, token] },
    });
    this.emit();
  }

  private async placeVisibleToken(entityId: EntityId): Promise<void> {
    if (this.currentSceneId === null) {
      return;
    }
    const scene = this.requireScene(this.currentSceneId);
    if (scene.battleground.tokens.some((token) => token.entityId === entityId)) {
      const tokens = scene.battleground.tokens.map((token) =>
        token.entityId === entityId ? { ...token, visible: true } : token,
      );
      await this.putScene({
        ...scene,
        battleground: { ...scene.battleground, tokens },
      });
      this.emit();
      return;
    }
    await this.addToken(entityId, true);
  }

  async moveToken(tokenId: TokenId, x: number, y: number): Promise<void> {
    if (this.encounter?.live) {
      await this.putEncounter({
        ...this.encounter,
        tokens: this.mapEncounterToken(this.encounter, tokenId, (token) => ({ ...token, x, y })),
      });
      this.emit();
      return;
    }
    const scene = this.requireScene(this.requireSceneId());
    await this.putScene({
      ...scene,
      battleground: {
        ...scene.battleground,
        tokens: scene.battleground.tokens.map((token) =>
          token.id === tokenId ? { ...token, x, y } : token,
        ),
      },
    });
    this.emit();
  }

  async setGridSize(size: number | null): Promise<void> {
    if (size !== null && (!Number.isInteger(size) || size < GRID_SIZE_MIN || size > GRID_SIZE_MAX)) {
      this.setErrorAndThrow(
        `Grid scale must be off, or an integer from ${String(GRID_SIZE_MIN)} to ${String(GRID_SIZE_MAX)}`,
      );
    }
    const scene = this.requireScene(this.requireSceneId());
    if (scene.battleground.gridSize === size) {
      return;
    }
    await this.putScene({
      ...scene,
      battleground: { ...scene.battleground, gridSize: size },
    });
    this.emit();
  }

  async setTokenSize(size: number): Promise<void> {
    if (!Number.isInteger(size) || size < GRID_SIZE_MIN || size > GRID_SIZE_MAX) {
      this.setErrorAndThrow(
        `Token scale must be an integer from ${String(GRID_SIZE_MIN)} to ${String(GRID_SIZE_MAX)}`,
      );
    }
    const scene = this.requireScene(this.requireSceneId());
    if (scene.battleground.tokenSize === size) {
      return;
    }
    await this.putScene({
      ...scene,
      battleground: { ...scene.battleground, tokenSize: size },
    });
    this.emit();
  }

  async setTokenVisible(tokenId: TokenId, visible: boolean): Promise<void> {
    if (this.encounter?.live) {
      await this.putEncounter({
        ...this.encounter,
        tokens: this.mapEncounterToken(this.encounter, tokenId, (token) => ({ ...token, visible })),
      });
      this.emit();
      return;
    }
    const scene = this.requireScene(this.requireSceneId());
    await this.putScene({
      ...scene,
      battleground: {
        ...scene.battleground,
        tokens: scene.battleground.tokens.map((token) =>
          token.id === tokenId ? { ...token, visible } : token,
        ),
      },
    });
    this.emit();
  }

  async addParticipant(entityId: EntityId): Promise<void> {
    const extra = this.participantFromEntity(entityId);
    const existing = this.encounter;
    if (!existing) {
      await this.putEncounter({
        sessionId: this.requireSessionId(),
        participants: [extra],
        activeIndex: 0,
        mapMediaId: null,
        live: false,
        tokens: [],
      });
      this.emit();
      return;
    }
    await this.putEncounter({
      ...existing,
      participants: [...existing.participants, extra],
      tokens: existing.live
        ? [...existing.tokens, this.tokenForParticipant(extra, existing.tokens.length)]
        : existing.tokens,
    });
    this.emit();
  }

  async beginEncounter(): Promise<void> {
    const encounter = this.encounter;
    if (!encounter || encounter.participants.length === 0) {
      this.setErrorAndThrow("Encounter has no one in it");
    }
    await this.putEncounter({
      ...encounter,
      live: true,
      tokens: this.tokensFromRoster(encounter.participants),
    });
    this.setSurface("table");
  }

  async dropOnEncounter(entityId: EntityId): Promise<void> {
    const entity = this.requireEntity(entityId);
    const map = mediaFrom(entity.runCard, "map");
    if (map) {
      await this.setEncounterMap(map.mediaId);
      return;
    }
    await this.addParticipant(entityId);
  }

  async setEncounterMap(mapMediaId: MediaId | null): Promise<void> {
    const existing = this.encounter;
    if (!existing) {
      await this.putEncounter({
        sessionId: this.requireSessionId(),
        participants: [],
        activeIndex: 0,
        mapMediaId,
        live: false,
        tokens: [],
      });
      this.emit();
      return;
    }
    if (existing.mapMediaId === mapMediaId) {
      return;
    }
    await this.putEncounter({ ...existing, mapMediaId });
    this.emit();
  }

  async removeParticipant(participantId: ParticipantId): Promise<void> {
    const existing = this.requireEncounter();
    const participants = existing.participants.filter((item) => item.id !== participantId);
    if (participants.length === 0) {
      await this.endEncounter();
      return;
    }
    await this.putEncounter({
      ...existing,
      participants,
      activeIndex: Math.min(existing.activeIndex, participants.length - 1),
      tokens: existing.tokens.filter((token) => token.participantId !== participantId),
    });
    this.emit();
  }

  async nextTurn(): Promise<void> {
    const existing = this.requireEncounter();
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
    const existing = this.requireEncounter();
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
    const existing = this.requireEncounter();
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

  async addCondition(participantId: ParticipantId, tag: string): Promise<void> {
    const existing = this.requireEncounter();
    const trimmed = tag.trim();
    if (trimmed.length === 0) {
      this.setErrorAndThrow("Condition tag is empty");
    }
    await this.putEncounter({
      ...existing,
      participants: existing.participants.map((participant) =>
        participant.id === participantId && !participant.conditions.includes(trimmed)
          ? { ...participant, conditions: [...participant.conditions, trimmed] }
          : participant,
      ),
    });
    this.emit();
  }

  async removeCondition(participantId: ParticipantId, tag: string): Promise<void> {
    const existing = this.requireEncounter();
    await this.putEncounter({
      ...existing,
      participants: existing.participants.map((participant) =>
        participant.id === participantId
          ? { ...participant, conditions: participant.conditions.filter((item) => item !== tag) }
          : participant,
      ),
    });
    this.emit();
  }

  async endEncounter(): Promise<void> {
    const sessionId = this.requireSessionId();
    await this.requireDb().delete("encounters", sessionId);
    this.markDirty();
    this.encounter = null;
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

  exportCampaign(): string {
    const payload: CampaignExport = {
      version: SCHEMA_VERSION,
      campaign: this.requireCampaign(),
      entities: this.entities,
      sessions: this.sessions,
      scenes: this.scenes,
      sources: this.sources.map((source) => ({ ...source, bytes: null })),
      chunks: this.chunks,
      logEntries: this.logEntries,
      encounter: this.encounter,
    };
    return JSON.stringify(payload, null, 2);
  }

  async importCampaign(json: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error: unknown) {
      this.setErrorAndThrow(errorMessage(error));
    }
    const migrated = migrateImportedCampaign(parsed);
    if (migrated.warnings.length > 0) {
      this.error = formatMigrationWarnings(migrated.warnings);
    }
    const payload = migrated.payload;
    const db = this.requireDb();
    await db.put("campaigns", payload.campaign);
    for (const entity of payload.entities) {
      await db.put("entities", entity);
    }
    for (const session of payload.sessions) {
      await db.put("sessions", session);
    }
    for (const scene of payload.scenes) {
      await db.put("scenes", scene);
    }
    for (const source of payload.sources) {
      await db.put("sources", source);
    }
    for (const chunk of payload.chunks) {
      await db.put("chunks", chunk);
    }
    for (const entry of payload.logEntries) {
      await db.put("logEntries", entry);
    }
    if (payload.encounter) {
      await db.put("encounters", payload.encounter);
    }
    this.campaigns = await db.getAll("campaigns");
    this.markDirty();
    await this.loadCampaign(payload.campaign.id);
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

  private requireSceneId(): SceneId {
    if (!this.currentSceneId) {
      this.setErrorAndThrow("No scene selected");
    }
    return this.currentSceneId;
  }

  private requireEntity(id: EntityId): Entity {
    const entity = this.entities.find((item) => item.id === id);
    if (!entity) {
      this.setErrorAndThrow(`Entity ${id} is missing`);
    }
    return entity;
  }

  private requireScene(id: SceneId): Scene {
    const scene = this.scenes.find((item) => item.id === id);
    if (!scene) {
      this.setErrorAndThrow(`Scene ${id} is missing`);
    }
    return scene;
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

  private scenePromptContext(): string {
    const scene = this.scenes.find((item) => item.id === this.currentSceneId);
    if (!scene) {
      return "unknown place";
    }
    if (scene.description.length === 0) {
      return scene.title;
    }
    return `${scene.title}\n${scene.description}`;
  }

  private participantFromEntity(entityId: EntityId): EncounterParticipant {
    const entity = this.requireEntity(entityId);
    return {
      id: newParticipantId(),
      entityId,
      label: entity.runCard.title,
      tracks: cloneTracks(tracksFrom(entity.runCard)),
      conditions: [],
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
    participants: ReadonlyArray<EncounterParticipant>,
  ): BattlegroundToken[] {
    const scene = this.currentSceneId === null ? null : this.scenes.find((item) => item.id === this.currentSceneId);
    const pool = new Map<EntityId, BattlegroundToken[]>();
    if (scene) {
      for (const token of scene.battleground.tokens) {
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
    };
  }

  private async insertEntity(runCard: RunCard, lifecycle: Entity["lifecycle"]): Promise<Entity> {
    const entity: Entity = {
      id: newEntityId(),
      campaignId: this.requireCampaignId(),
      runCard,
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
    this.tableCardIds = [...this.tableCardIds, id];
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

  private async putScene(scene: Scene): Promise<void> {
    await this.requireDb().put("scenes", scene);
    this.markDirty();
    this.scenes = this.scenes.map((item) => (item.id === scene.id ? scene : item));
  }

  private async putEncounter(encounter: EncounterState): Promise<void> {
    await this.requireDb().put("encounters", encounter);
    this.markDirty();
    this.encounter = encounter;
  }

  private async putMedia(media: MediaRecord): Promise<void> {
    await this.requireDb().put("media", media);
    this.markDirty();
    this.media = [...this.media.filter((item) => item.id !== media.id), media];
    this.rememberMediaUrl(media);
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
    if (this.currentSessionId && this.sessions.some((session) => session.id === this.currentSessionId)) {
      this.ensureSceneSelection();
      return;
    }
    const first = this.sessions[0];
    this.currentSessionId = first?.id ?? null;
    this.ensureSceneSelection();
  }

  private ensureSceneSelection(): void {
    const inSession = this.scenes.filter((scene) => scene.sessionId === this.currentSessionId);
    if (this.currentSceneId && inSession.some((scene) => scene.id === this.currentSceneId)) {
      return;
    }
    const first = [...inSession].sort((a, b) => a.order - b.order)[0];
    this.currentSceneId = first?.id ?? null;
    const focus = first?.entityIds[0];
    this.focusEntityId = focus ?? this.entities[0]?.id ?? null;
  }

  private async loadCampaign(id: CampaignId): Promise<void> {
    const db = this.requireDb();
    this.currentCampaignId = id;
    await db.put("meta", id, META_CAMPAIGN);
    const warnings: MigrationWarning[] = [];
    this.entities = readStored(await db.getAllFromIndex("entities", "campaignId", id), readEntity, warnings);
    this.sessions = readStored(await db.getAllFromIndex("sessions", "campaignId", id), readSession, warnings);
    this.scenes = readStored(await db.getAllFromIndex("scenes", "campaignId", id), readScene, warnings);
    this.sources = readStored(await db.getAllFromIndex("sources", "campaignId", id), readSource, warnings);
    this.chunks = readStored(await db.getAllFromIndex("chunks", "campaignId", id), readChunk, warnings);
    this.media = readStored(await db.getAllFromIndex("media", "campaignId", id), readMedia, warnings);
    for (const record of this.media) {
      this.rememberMediaUrl(record);
    }
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
          tokens: this.tokensFromRoster(this.encounter.participants),
        };
        await this.putEncounter(this.encounter);
      }
      this.logEntries = readStored(
        await db.getAllFromIndex("logEntries", "sessionId", this.currentSessionId),
        readLogEntry,
        warnings,
      );
      await db.put("meta", this.currentSessionId, META_SESSION);
    } else {
      this.encounter = null;
      this.logEntries = [];
    }
    if (warnings.length > 0) {
      this.note(formatMigrationWarnings(warnings));
    }
    this.ensureSessionSelection();
    await this.loadTableCards(id);
    this.reindex();
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
      pinnedFacts: [],
      createdAt: nowIso(),
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
        pinnedFacts: [],
        createdAt: nowIso(),
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
    for (const scene of readStored(backup.scenes, readScene, warnings)) {
      await db.put("scenes", scene);
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
    const encounter = readEncounter(backup.encounter, warnings);
    if (encounter) {
      await db.put("encounters", encounter);
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
    this.dataDirty = true;
  }

  private scheduleBackup(): void {
    if (this.backupTimer !== null) {
      window.clearTimeout(this.backupTimer);
    }
    this.backupTimer = window.setTimeout(() => {
      this.backupTimer = null;
      this.run(this.persistCampaignBackup());
    }, 1500);
  }

  private async persistCampaignBackup(): Promise<void> {
    const campaignId = this.currentCampaignId;
    if (campaignId === null || !this.ready) {
      return;
    }
    const campaign = this.campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      this.setErrorAndThrow("Cannot back up: the open campaign is missing from the index");
    }
    const db = this.requireDb();
    const latestId = backupSlotId(campaignId, "latest");
    const prevId = backupSlotId(campaignId, "prev");
    const existing = await db.get("backups", latestId);
    if (existing) {
      await db.put("backups", { ...existing, id: prevId });
    }
    const backup: CampaignBackup = {
      id: latestId,
      schemaVersion: SCHEMA_VERSION,
      campaignId,
      savedAt: nowIso(),
      campaign,
      entities: this.entities,
      sessions: this.sessions,
      scenes: this.scenes,
      sources: this.sources,
      chunks: this.chunks,
      media: this.media,
      logEntries: this.logEntries,
      encounter: this.encounter,
      tableCardIds: this.tableCardIds,
    };
    await db.put("backups", backup);
    this.dataDirty = false;
    this.lastBackupAt = backup.savedAt;
  }

  private createSnapshot(): HostSnapshot {
    const campaign = this.campaigns.find((item) => item.id === this.currentCampaignId) ?? null;
    const session = this.sessions.find((item) => item.id === this.currentSessionId) ?? null;
    const scene = this.scenes.find((item) => item.id === this.currentSceneId) ?? null;
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
      scenes: this.scenes,
      scene,
      focus,
      sources: this.sources,
      chunks: this.chunks,
      logEntries: this.logEntries,
      encounter: this.encounter,
      settings: this.settings,
      mode: this.mode,
      surface: this.surface,
      now: {
        campaignId: this.currentCampaignId,
        sessionId: this.currentSessionId,
        sceneId: this.currentSceneId,
        focusEntityId: this.focusEntityId,
        surface: this.surface,
      },
      mediaUrls,
      sourceView: this.sourceView,
      mediaViewId: this.mediaViewId,
      webSearchView: this.webSearchView,
      urlView: this.urlView,
      busy: this.busy,
      lastBackupAt: this.lastBackupAt,
    };
  }

  private emit(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
    if (this.ready && this.dataDirty) {
      this.scheduleBackup();
    }
  }
}

export const hostStore = new HostStore();
