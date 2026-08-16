import type { GmDb } from "../store/db";
import {
  readCampaign,
  readChunk,
  readEncounter,
  readEntity,
  readLogEntry,
  readMedia,
  readScene,
  readSession,
  readSettings,
  readSource,
} from "./readRecord";
import { SCHEMA_VERSION } from "./schema";
import type { MigrationWarning } from "./warnings";

/**
 * One step in the document-schema chain.
 * `from` must be `to - 1`. The last step must land on SCHEMA_VERSION.
 */
export type SchemaMigration = {
  from: number;
  to: number;
  reason: string;
  apply: (db: GmDb) => Promise<ReadonlyArray<MigrationWarning>>;
};

/**
 * Add a new object here when you bump SCHEMA_VERSION.
 * Skipping a version, or shipping a bump without a step, is a boot-time crash.
 */
export const SCHEMA_MIGRATIONS: ReadonlyArray<SchemaMigration> = [
  {
    from: 0,
    to: 1,
    reason:
      "First versioned schema. Unversioned IndexedDB is 0. Normalize scene.description, source files, settings, and stamp schemaVersion.",
    apply: migrate0to1,
  },
];

export function assertMigrationChain(
  migrations: ReadonlyArray<SchemaMigration>,
  current: number,
): void {
  if (migrations.length !== current) {
    throw new Error(
      `SCHEMA_VERSION is ${String(current)} but persist/migrations.ts has ${String(migrations.length)} step(s). Add a migration from ${String(current - 1)} to ${String(current)}.`,
    );
  }
  for (const [index, step] of migrations.entries()) {
    if (step.from !== index || step.to !== index + 1) {
      throw new Error(
        `Migration chain is broken at index ${String(index)}: expected ${String(index)}→${String(index + 1)}, got ${String(step.from)}→${String(step.to)}.`,
      );
    }
  }
}

assertMigrationChain(SCHEMA_MIGRATIONS, SCHEMA_VERSION);

async function migrate0to1(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("campaigns")) {
    const next = readCampaign(raw, warnings);
    if (next) {
      await db.put("campaigns", next);
    }
  }
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  for (const raw of await db.getAll("sessions")) {
    const next = readSession(raw, warnings);
    if (next) {
      await db.put("sessions", next);
    }
  }
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      await db.put("scenes", next);
    }
  }
  for (const raw of await db.getAll("sources")) {
    const next = readSource(raw, warnings);
    if (next) {
      await db.put("sources", next);
    }
  }
  for (const raw of await db.getAll("chunks")) {
    const next = readChunk(raw, warnings);
    if (next) {
      await db.put("chunks", next);
    }
  }
  for (const raw of await db.getAll("media")) {
    const next = readMedia(raw, warnings);
    if (next) {
      await db.put("media", next);
    }
  }
  for (const raw of await db.getAll("logEntries")) {
    const next = readLogEntry(raw, warnings);
    if (next) {
      await db.put("logEntries", next);
    }
  }
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  const settings = await db.get("settings", "app");
  if (settings !== undefined) {
    const next = readSettings(settings, warnings);
    if (next) {
      await db.put("settings", next, "app");
    }
  }
  return warnings;
}

