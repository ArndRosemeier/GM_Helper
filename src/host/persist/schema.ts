/**
 * Persisted data schema.
 *
 * TWO VERSION NUMBERS
 * -------------------
 * IndexedDB `DB_VERSION` in store/db.ts is the physical store layout
 * (object stores and indexes). Bump it only when you add or reshape a store.
 *
 * `SCHEMA_VERSION` here is the document shape of every campaign record.
 * Bump it when you add, rename, or change the meaning of a field on a
 * persisted type (Campaign, Entity, Scene, Settings, export, backup, …).
 *
 * MIGRATIONS ARE MANDATORY
 * ------------------------
 * A new schema version that cannot read an old campaign is a bug.
 * You must add a step in persist/migrations.ts from N-1 to N before you
 * ship a SCHEMA_VERSION bump. The chain is asserted at module load.
 *
 * Opening a database written by a newer app (stored version > SCHEMA_VERSION)
 * is a hard error. Opening an older database must run every step in order,
 * keep every record it can read, and push a loud warning for anything it
 * cannot. That warning path is for corruption, not for forgotten migrations.
 *
 * Unversioned IndexedDB (no schemaVersion meta key) is version 0.
 */
export const SCHEMA_VERSION = 19;

export const SCHEMA_META_KEY = "schemaVersion";

export function parseStoredSchemaVersion(raw: unknown): number {
  if (raw === undefined) {
    return 0;
  }
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  throw new Error(`Stored schemaVersion is not a whole number: ${String(raw)}`);
}
