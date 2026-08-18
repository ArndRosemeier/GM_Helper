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
import { foldScenesIntoEncounters } from "./foldScenes";
import { SCHEMA_VERSION } from "./schema";
import type { MigrationWarning } from "./warnings";
import type { EncounterState, Scene } from "../types";
import { withEncounterCategory } from "../types";
import { fillParticipantCurrentHp, withFilledEncounterCardHp } from "../encounter";

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
  {
    from: 1,
    to: 2,
    reason:
      "Battleground token size is independent of the grid. gridSize null now hides the grid instead of meaning default.",
    apply: migrate1to2,
  },
  {
    from: 2,
    to: 3,
    reason:
      "Encounter keeps its own map. A live encounter without a dropped map uses the neutral board, not the scene map.",
    apply: migrate2to3,
  },
  {
    from: 3,
    to: 4,
    reason:
      "A live encounter owns its own tokens, one per roster entry. Scene leftovers are not reused as extras.",
    apply: migrate3to4,
  },
  {
    from: 4,
    to: 5,
    reason: "Campaign pinned facts are removed. Fact labels are display-only again.",
    apply: migrate4to5,
  },
  {
    from: 5,
    to: 6,
    reason:
      "Scene battlegrounds no longer store a map. Encounter maps come from image cards dropped on the roster.",
    apply: migrate5to6,
  },
  {
    from: 6,
    to: 7,
    reason: "Campaigns own card category names; each run card stores its category.",
    apply: migrate6to7,
  },
  {
    from: 7,
    to: 8,
    reason: "Cards belong to a session (UI campaign) or are global (sessionId null).",
    apply: migrate7to8,
  },
  {
    from: 8,
    to: 9,
    reason: "Scenes removed. Board prefs and idle tokens live on the encounter; scenes store is cleared.",
    apply: migrate8to9,
  },
  {
    from: 9,
    to: 10,
    reason: "Battleground tokens gain scale, shape, and color; entityId may be null for stamps.",
    apply: migrate9to10,
  },
  {
    from: 10,
    to: 11,
    reason: "Encounter boards can live on cards; campaigns gain the Encounter category.",
    apply: migrate10to11,
  },
  {
    from: 11,
    to: 12,
    reason: "Player and NPC cards store HP and initiative bonus.",
    apply: migrate11to12,
  },
  {
    from: 12,
    to: 13,
    reason: "HP splits into max and current; NPC current HP is per encounter instance.",
    apply: migrate12to13,
  },
  {
    from: 13,
    to: 14,
    reason: "UI campaigns store a genre, defaulting to Fantasy.",
    apply: migrate13to14,
  },
  {
    from: 14,
    to: 15,
    reason: "Encounter boards store veils that hide covered cards.",
    apply: migrate14to15,
  },
  {
    from: 15,
    to: 16,
    reason: "Veils record a kind so fog of war can cover the board.",
    apply: migrate15to16,
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

async function migrate1to2(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      await db.put("scenes", next);
    }
  }
  return warnings;
}

async function migrate2to3(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  return warnings;
}

async function migrate3to4(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      await db.put("scenes", next);
    }
  }
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  return warnings;
}

async function migrate4to5(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("campaigns")) {
    const next = readCampaign(raw, warnings);
    if (next) {
      await db.put("campaigns", next);
    }
  }
  return warnings;
}

async function migrate5to6(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      await db.put("scenes", next);
    }
  }
  return warnings;
}

async function migrate6to7(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
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
  return warnings;
}

async function migrate7to8(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  return warnings;
}

async function migrate8to9(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  const scenes: Scene[] = [];
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      scenes.push(next);
    }
  }
  const encounters: EncounterState[] = [];
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      encounters.push(next);
    }
  }
  const folded = foldScenesIntoEncounters(scenes, encounters);
  for (const encounter of folded) {
    await db.put("encounters", encounter);
  }
  for (const scene of scenes) {
    await db.delete("scenes", scene.id);
  }
  return warnings;
}

async function migrate9to10(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  for (const raw of await db.getAll("scenes")) {
    const next = readScene(raw, warnings);
    if (next) {
      await db.put("scenes", next);
    }
  }
  return warnings;
}

async function migrate10to11(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("campaigns")) {
    const next = readCampaign(raw, warnings);
    if (!next) {
      continue;
    }
    await db.put("campaigns", {
      ...next,
      cardCategories: withEncounterCategory(next.cardCategories),
    });
  }
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  return warnings;
}

async function migrate11to12(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  return warnings;
}

async function migrate12to13(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  const entities = [];
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      entities.push(next);
    }
  }
  const filled = withFilledEncounterCardHp(entities);
  for (const entity of filled) {
    await db.put("entities", entity);
  }
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (!next) {
      continue;
    }
    await db.put("encounters", { ...fillParticipantCurrentHp(next, filled), sessionId: next.sessionId });
  }
  return warnings;
}

async function migrate13to14(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("sessions")) {
    const next = readSession(raw, warnings);
    if (next) {
      await db.put("sessions", next);
    }
  }
  return warnings;
}

async function migrate14to15(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  return warnings;
}

async function migrate15to16(db: GmDb): Promise<ReadonlyArray<MigrationWarning>> {
  const warnings: MigrationWarning[] = [];
  for (const raw of await db.getAll("encounters")) {
    const next = readEncounter(raw, warnings);
    if (next) {
      await db.put("encounters", next);
    }
  }
  for (const raw of await db.getAll("entities")) {
    const next = readEntity(raw, warnings);
    if (next) {
      await db.put("entities", next);
    }
  }
  return warnings;
}

