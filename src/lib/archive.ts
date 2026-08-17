import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AppSettings } from "../host/settings";
import type {
  Campaign,
  EncounterState,
  Entity,
  IsoDateTime,
  LogEntry,
  MediaRole,
  Scene,
  Session,
  Source,
  SourceChunk,
} from "../host/types";
import type { CampaignId, EntityId, MediaId, SourceId } from "../host/ids";

export const ARCHIVE_FORMAT = "gm-helper-archive";
export const CARD_ARCHIVE_FORMAT = "gm-helper-card";
export const ARCHIVE_MANIFEST_PATH = "manifest.json";
export const ARCHIVE_DATA_PATH = "data.json";
export const ARCHIVE_MEDIA_DIR = "media/";
export const ARCHIVE_SOURCES_DIR = "sources/";

export type ArchiveManifest = {
  format: typeof ARCHIVE_FORMAT;
  schemaVersion: number;
  exportedAt: IsoDateTime;
};

export type CardArchiveManifest = {
  format: typeof CARD_ARCHIVE_FORMAT;
  schemaVersion: number;
  exportedAt: IsoDateTime;
};

export type AnyArchiveManifest = ArchiveManifest | CardArchiveManifest;

/** Media metadata in data.json — bytes live under media/<id>. */
export type ArchiveMediaMeta = {
  id: MediaId;
  campaignId: CampaignId;
  mimeType: string;
  role: MediaRole;
};

/** Source row without Blob; bytes restored from sources/<id> when hasFile is true. */
export type ArchiveSourceMeta = Omit<Source, "bytes"> & {
  hasFile: boolean;
};

export type ArchiveData = {
  schemaVersion: number;
  campaigns: ReadonlyArray<Campaign>;
  entities: ReadonlyArray<Entity>;
  sessions: ReadonlyArray<Session>;
  scenes: ReadonlyArray<Scene>;
  sources: ReadonlyArray<ArchiveSourceMeta>;
  chunks: ReadonlyArray<SourceChunk>;
  media: ReadonlyArray<ArchiveMediaMeta>;
  logEntries: ReadonlyArray<LogEntry>;
  encounters: ReadonlyArray<EncounterState>;
  tableCardsByCampaign: Readonly<Record<string, ReadonlyArray<EntityId>>>;
  settings: AppSettings;
  currentCampaignId: CampaignId | null;
  currentSessionId: string | null;
};

export type PackedArchive = {
  manifest: ArchiveManifest;
  data: ArchiveData;
  mediaBytes: ReadonlyMap<MediaId, Uint8Array>;
  sourceBytes: ReadonlyMap<SourceId, Uint8Array>;
};

/** One card plus its attached images/docs — no campaign/session binding on import. */
export type CardArchiveData = {
  schemaVersion: number;
  entity: Entity;
  media: ReadonlyArray<ArchiveMediaMeta>;
  sources: ReadonlyArray<ArchiveSourceMeta>;
  chunks: ReadonlyArray<SourceChunk>;
};

export type PackedCardArchive = {
  manifest: CardArchiveManifest;
  data: CardArchiveData;
  mediaBytes: ReadonlyMap<MediaId, Uint8Array>;
  sourceBytes: ReadonlyMap<SourceId, Uint8Array>;
};

export function packArchiveZip(archive: PackedArchive | PackedCardArchive): Blob {
  const files: Record<string, Uint8Array> = {
    [ARCHIVE_MANIFEST_PATH]: strToU8(JSON.stringify(archive.manifest, null, 2)),
    [ARCHIVE_DATA_PATH]: strToU8(JSON.stringify(archive.data, null, 2)),
  };
  for (const [id, bytes] of archive.mediaBytes) {
    files[`${ARCHIVE_MEDIA_DIR}${id}`] = bytes;
  }
  for (const [id, bytes] of archive.sourceBytes) {
    files[`${ARCHIVE_SOURCES_DIR}${id}`] = bytes;
  }
  const zipped = zipSync(files, { level: 6 });
  const copy = new Uint8Array(zipped.byteLength);
  copy.set(zipped);
  return new Blob([copy], { type: "application/zip" });
}

export function unpackArchiveZip(buffer: ArrayBuffer): {
  manifest: unknown;
  data: unknown;
  mediaFiles: Map<string, Uint8Array>;
  sourceFiles: Map<string, Uint8Array>;
} {
  const entries = unzipSync(new Uint8Array(buffer));
  const manifestRaw = entries[ARCHIVE_MANIFEST_PATH];
  const dataRaw = entries[ARCHIVE_DATA_PATH];
  if (!manifestRaw) {
    throw new Error("Archive is missing manifest.json");
  }
  if (!dataRaw) {
    throw new Error("Archive is missing data.json");
  }
  const mediaFiles = new Map<string, Uint8Array>();
  const sourceFiles = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith(ARCHIVE_MEDIA_DIR) && path.length > ARCHIVE_MEDIA_DIR.length) {
      mediaFiles.set(path.slice(ARCHIVE_MEDIA_DIR.length), bytes);
      continue;
    }
    if (path.startsWith(ARCHIVE_SOURCES_DIR) && path.length > ARCHIVE_SOURCES_DIR.length) {
      sourceFiles.set(path.slice(ARCHIVE_SOURCES_DIR.length), bytes);
    }
  }
  return {
    manifest: JSON.parse(strFromU8(manifestRaw)) as unknown,
    data: JSON.parse(strFromU8(dataRaw)) as unknown,
    mediaFiles,
    sourceFiles,
  };
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function uint8ArrayToBlob(bytes: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType || "application/octet-stream" });
}
