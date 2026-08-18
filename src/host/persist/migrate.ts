import type { CampaignExport } from "../types";
import { withEncounterCategory } from "../types";
import { fillParticipantCurrentHp, withFilledEncounterCardHp } from "../encounter";
import type { GmDb } from "../store/db";
import { SCHEMA_MIGRATIONS } from "./migrations";
import {
  readCampaign,
  readChunk,
  readEncounter,
  readEntity,
  readLogEntry,
  readScene,
  readSession,
  readSource,
} from "./readRecord";
import { foldScenesIntoEncounters } from "./foldScenes";
import { parseStoredSchemaVersion, SCHEMA_META_KEY, SCHEMA_VERSION } from "./schema";
import { formatMigrationWarnings, type MigrationReport, type MigrationWarning } from "./warnings";

export async function migrateOpenDatabase(db: GmDb): Promise<MigrationReport> {
  const stored = parseStoredSchemaVersion(await db.get("meta", SCHEMA_META_KEY));
  if (stored > SCHEMA_VERSION) {
    throw new Error(
      `This campaign was written with schema ${String(stored)}. This build only reads up to ${String(SCHEMA_VERSION)}. Update the app.`,
    );
  }
  const warnings: MigrationWarning[] = [];
  for (const step of SCHEMA_MIGRATIONS) {
    if (step.from < stored) {
      continue;
    }
    warnings.push(...(await step.apply(db)));
  }
  await db.put("meta", String(SCHEMA_VERSION), SCHEMA_META_KEY);
  return { from: stored, to: SCHEMA_VERSION, warnings };
}

export function migrateImportedCampaign(value: unknown): {
  payload: CampaignExport;
  encounters: ReadonlyArray<import("../types").EncounterState>;
  warnings: ReadonlyArray<MigrationWarning>;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("Import file is not a GM Cockpit export");
  }
  const record = value as Record<string, unknown>;
  const version = "version" in record ? parseStoredSchemaVersion(record.version) : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Import schema ${String(version)} is newer than this build (${String(SCHEMA_VERSION)}). Update the app.`,
    );
  }
  const warnings: MigrationWarning[] = [];
  const campaign = readCampaign(record.campaign, warnings);
  if (!campaign) {
    throw new Error("Import has no readable campaign record");
  }
  const migratedCampaign = {
    ...campaign,
    cardCategories: withEncounterCategory(campaign.cardCategories),
  };
  const scenes = readList(record.scenes, readScene, warnings);
  const encounter = readEncounter(record.encounter, warnings);
  const folded = foldScenesIntoEncounters(scenes, encounter ? [encounter] : []);
  const entities = withFilledEncounterCardHp(readList(record.entities, readEntity, warnings));
  const encounters = folded.map((item) => ({
    ...fillParticipantCurrentHp(item, entities),
    sessionId: item.sessionId,
  }));
  const payload: CampaignExport = {
    version: SCHEMA_VERSION,
    campaign: migratedCampaign,
    entities,
    sessions: readList(record.sessions, readSession, warnings),
    scenes: [],
    sources: readList(record.sources, readSource, warnings),
    chunks: readList(record.chunks, readChunk, warnings),
    logEntries: readList(record.logEntries, readLogEntry, warnings),
    encounter: encounters[0] ?? null,
  };
  return { payload, encounters, warnings };
}

export function migrationBanner(report: MigrationReport): string | null {
  if (report.from === report.to && report.warnings.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (report.from !== report.to) {
    parts.push(`Migrated campaign data from schema ${String(report.from)} to ${String(report.to)}.`);
  }
  if (report.warnings.length > 0) {
    parts.push(formatMigrationWarnings(report.warnings));
  }
  return parts.join(" ");
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
    warnings.push({ store: "export", id: "list", message: "A collection was not a list and was dropped" });
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
