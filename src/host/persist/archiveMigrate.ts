import type { AppSettings } from "../settings";
import { DEFAULT_SETTINGS, parseAppSettings } from "../settings";
import { asCampaignId, asEntityId, asMediaId, asSessionId, type CampaignId, type EntityId } from "../ids";
import type { Campaign, EncounterState, MediaRecord, Session, Source } from "../types";
import {
  ARCHIVE_FORMAT,
  type ArchiveData,
  type ArchiveManifest,
  type ArchiveMediaMeta,
  type ArchiveSourceMeta,
  uint8ArrayToBlob,
} from "../../lib/archive";
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
} from "./readRecord";
import { parseStoredSchemaVersion, SCHEMA_VERSION } from "./schema";
import type { MigrationWarning } from "./warnings";

export type MigratedArchive = {
  manifest: ArchiveManifest;
  data: ArchiveData;
  media: ReadonlyArray<MediaRecord>;
  sources: ReadonlyArray<Source>;
  warnings: ReadonlyArray<MigrationWarning>;
};

export function parseArchiveManifest(value: unknown): ArchiveManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Archive manifest is not an object");
  }
  const record = value as Record<string, unknown>;
  if (record.format !== ARCHIVE_FORMAT) {
    throw new Error(`Archive format is not ${ARCHIVE_FORMAT}`);
  }
  const schemaVersion = parseStoredSchemaVersion(record.schemaVersion);
  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Archive schema ${String(schemaVersion)} is newer than this build (${String(SCHEMA_VERSION)}). Update the app.`,
    );
  }
  const exportedAt = record.exportedAt;
  if (typeof exportedAt !== "string" || exportedAt.length === 0) {
    throw new Error("Archive manifest has no exportedAt");
  }
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion,
    exportedAt: exportedAt as ArchiveManifest["exportedAt"],
  };
}

export function migrateArchivePayload(
  dataValue: unknown,
  mediaFiles: ReadonlyMap<string, Uint8Array>,
  sourceFiles: ReadonlyMap<string, Uint8Array>,
  schemaVersion: number,
): {
  data: ArchiveData;
  media: ReadonlyArray<MediaRecord>;
  sources: ReadonlyArray<Source>;
  warnings: ReadonlyArray<MigrationWarning>;
} {
  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Archive schema ${String(schemaVersion)} is newer than this build (${String(SCHEMA_VERSION)}). Update the app.`,
    );
  }
  if (typeof dataValue !== "object" || dataValue === null) {
    throw new Error("Archive data.json is not an object");
  }
  const record = dataValue as Record<string, unknown>;
  const warnings: MigrationWarning[] = [];

  const campaigns = readList(record.campaigns, readCampaign, warnings);
  if (campaigns.length === 0) {
    throw new Error("Archive has no readable campaigns");
  }

  const entities = readList(record.entities, readEntity, warnings);
  const sessions = readList(record.sessions, readSession, warnings);
  const scenes = readList(record.scenes, readScene, warnings);
  const chunks = readList(record.chunks, readChunk, warnings);
  const logEntries = readList(record.logEntries, readLogEntry, warnings);
  const encounters = readEncounterList(record.encounters, warnings);

  const sourceMetas = readArchiveSources(record.sources, warnings);
  const sources: Source[] = [];
  for (const meta of sourceMetas) {
    const file = sourceFiles.get(meta.id);
    let bytes: Blob | null = null;
    if (meta.hasFile) {
      if (!file) {
        warnings.push({
          store: "sources",
          id: meta.id,
          message: "Source file was listed but missing from the ZIP; bytes cleared",
        });
      } else {
        bytes = uint8ArrayToBlob(file, meta.mimeType ?? "application/octet-stream");
      }
    }
    const rebuilt = readSource({ ...meta, bytes }, warnings);
    if (rebuilt) {
      sources.push(rebuilt);
    }
  }

  const mediaMetas = readArchiveMedia(record.media, warnings);
  const media: MediaRecord[] = [];
  for (const meta of mediaMetas) {
    const file = mediaFiles.get(meta.id);
    if (!file) {
      warnings.push({
        store: "media",
        id: meta.id,
        message: "Media file missing from the ZIP; record skipped",
      });
      continue;
    }
    const rebuilt = readMedia(
      {
        ...meta,
        bytes: uint8ArrayToBlob(file, meta.mimeType),
      },
      warnings,
    );
    if (rebuilt) {
      media.push(rebuilt);
    }
  }

  const tableCardsByCampaign = readTableCardsByCampaign(record.tableCardsByCampaign, warnings);
  const settings = readArchiveSettings(record.settings, warnings);
  const currentCampaignId = readOptionalCampaignId(record.currentCampaignId, campaigns, warnings);
  const currentSessionId = readOptionalSessionId(record.currentSessionId, sessions, warnings);

  const data: ArchiveData = {
    schemaVersion: SCHEMA_VERSION,
    campaigns,
    entities,
    sessions,
    scenes,
    sources: sources.map((source) => ({
      id: source.id,
      campaignId: source.campaignId,
      title: source.title,
      kind: source.kind,
      createdAt: source.createdAt,
      mimeType: source.mimeType,
      hasFile: source.bytes !== null,
    })),
    chunks,
    media: media.map((item) => ({
      id: item.id,
      campaignId: item.campaignId,
      mimeType: item.mimeType,
      role: item.role,
    })),
    logEntries,
    encounters,
    tableCardsByCampaign,
    settings,
    currentCampaignId,
    currentSessionId,
  };

  return { data, media, sources, warnings };
}

function readList<T>(
  value: unknown,
  read: (item: unknown, warnings: MigrationWarning[]) => T | null,
  warnings: MigrationWarning[],
): T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store: "archive", id: "list", message: "A collection was not a list and was dropped" });
    return [];
  }
  const items: T[] = [];
  for (const item of value) {
    const next = read(item, warnings);
    if (next) {
      items.push(next);
    }
  }
  return items;
}

function readEncounterList(value: unknown, warnings: MigrationWarning[]): EncounterState[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store: "encounters", id: "list", message: "Encounters were not a list and were dropped" });
    return [];
  }
  const items: EncounterState[] = [];
  for (const item of value) {
    const next = readEncounter(item, warnings);
    if (next) {
      items.push(next);
    }
  }
  return items;
}

function readArchiveSources(value: unknown, warnings: MigrationWarning[]): ArchiveSourceMeta[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store: "sources", id: "list", message: "Sources were not a list and were dropped" });
    return [];
  }
  const items: ArchiveSourceMeta[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store: "sources", id: "?", message: "A source row was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    const withoutBytes = { ...record, bytes: null };
    const parsed = readSource(withoutBytes, warnings);
    if (!parsed) {
      continue;
    }
    items.push({
      id: parsed.id,
      campaignId: parsed.campaignId,
      title: parsed.title,
      kind: parsed.kind,
      createdAt: parsed.createdAt,
      mimeType: parsed.mimeType,
      hasFile: record.hasFile === true,
    });
  }
  return items;
}

function readArchiveMedia(value: unknown, warnings: MigrationWarning[]): ArchiveMediaMeta[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push({ store: "media", id: "list", message: "Media were not a list and were dropped" });
    return [];
  }
  const items: ArchiveMediaMeta[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      warnings.push({ store: "media", id: "?", message: "A media row was not an object and was dropped" });
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const campaignId = typeof record.campaignId === "string" ? record.campaignId : null;
    if (id === null || campaignId === null) {
      warnings.push({ store: "media", id: id ?? "?", message: "Media meta missing id or campaignId" });
      continue;
    }
    items.push({
      id: asMediaId(id),
      campaignId: asCampaignId(campaignId),
      mimeType: typeof record.mimeType === "string" ? record.mimeType : "application/octet-stream",
      role:
        record.role === "portrait" ||
        record.role === "token" ||
        record.role === "map" ||
        record.role === "other"
          ? record.role
          : "other",
    });
  }
  return items;
}

function readTableCardsByCampaign(
  value: unknown,
  warnings: MigrationWarning[],
): Record<string, EntityId[]> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    warnings.push({
      store: "meta",
      id: "tableCards",
      message: "tableCardsByCampaign was not an object and was dropped",
    });
    return {};
  }
  const out: Record<string, EntityId[]> = {};
  for (const [campaignId, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) {
      warnings.push({
        store: "meta",
        id: campaignId,
        message: "Table card list was not an array and was dropped",
      });
      continue;
    }
    const ids: EntityId[] = [];
    for (const item of list) {
      if (typeof item === "string") {
        ids.push(asEntityId(item));
      }
    }
    out[campaignId] = ids;
  }
  return out;
}

function readArchiveSettings(value: unknown, warnings: MigrationWarning[]): AppSettings {
  if (value === undefined) {
    return { ...DEFAULT_SETTINGS, openRouterApiKey: null };
  }
  try {
    const parsed = parseAppSettings({
      ...(typeof value === "object" && value !== null ? value : {}),
      openRouterApiKey: null,
    });
    return { ...parsed, openRouterApiKey: null };
  } catch (error: unknown) {
    warnings.push({
      store: "settings",
      id: "app",
      message: error instanceof Error ? error.message : "Settings could not be read; defaults used",
    });
    return { ...DEFAULT_SETTINGS, openRouterApiKey: null };
  }
}

function readOptionalCampaignId(
  value: unknown,
  campaigns: ReadonlyArray<Campaign>,
  warnings: MigrationWarning[],
): CampaignId | null {
  if (value === undefined || value === null) {
    return campaigns[0]?.id ?? null;
  }
  if (typeof value !== "string") {
    warnings.push({ store: "meta", id: "currentCampaignId", message: "currentCampaignId was invalid" });
    return campaigns[0]?.id ?? null;
  }
  const id = asCampaignId(value);
  if (!campaigns.some((campaign) => campaign.id === id)) {
    warnings.push({
      store: "meta",
      id: value,
      message: "currentCampaignId was not in the archive; using first campaign",
    });
    return campaigns[0]?.id ?? null;
  }
  return id;
}

function readOptionalSessionId(
  value: unknown,
  sessions: ReadonlyArray<Session>,
  warnings: MigrationWarning[],
): string | null {
  if (value === undefined || value === null) {
    return sessions[0]?.id ?? null;
  }
  if (typeof value !== "string") {
    warnings.push({ store: "meta", id: "currentSessionId", message: "currentSessionId was invalid" });
    return sessions[0]?.id ?? null;
  }
  if (!sessions.some((session) => session.id === value)) {
    return sessions[0]?.id ?? null;
  }
  return asSessionId(value);
}
