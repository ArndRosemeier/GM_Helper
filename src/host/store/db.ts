import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppSettings } from "../settings";
import type {
  Campaign,
  EncounterState,
  Entity,
  LogEntry,
  MediaRecord,
  Scene,
  Session,
  Source,
  SourceChunk,
} from "../types";
import type { CampaignBackup } from "./backup";

export type GmDb = IDBPDatabase<GmSchema>;

export interface GmSchema extends DBSchema {
  campaigns: {
    key: string;
    value: Campaign;
  };
  entities: {
    key: string;
    value: Entity;
    indexes: { campaignId: string };
  };
  sessions: {
    key: string;
    value: Session;
    indexes: { campaignId: string };
  };
  scenes: {
    key: string;
    value: Scene;
    indexes: { sessionId: string; campaignId: string };
  };
  sources: {
    key: string;
    value: Source;
    indexes: { campaignId: string };
  };
  chunks: {
    key: string;
    value: SourceChunk;
    indexes: { sourceId: string; campaignId: string };
  };
  media: {
    key: string;
    value: MediaRecord;
    indexes: { campaignId: string };
  };
  logEntries: {
    key: string;
    value: LogEntry;
    indexes: { sessionId: string };
  };
  encounters: {
    key: string;
    value: EncounterState;
  };
  settings: {
    key: "app";
    value: AppSettings;
  };
  meta: {
    key: string;
    value: string;
  };
  backups: {
    key: string;
    value: CampaignBackup;
  };
}

const DB_NAME = "gm-cockpit";
/** Physical object-store layout only. Document fields use SCHEMA_VERSION in persist/schema.ts. */
const DB_VERSION = 2;

export async function openGmDb(): Promise<GmDb> {
  return openDB<GmSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("campaigns", { keyPath: "id" });

        const entities = db.createObjectStore("entities", { keyPath: "id" });
        entities.createIndex("campaignId", "campaignId");

        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("campaignId", "campaignId");

        const scenes = db.createObjectStore("scenes", { keyPath: "id" });
        scenes.createIndex("sessionId", "sessionId");
        scenes.createIndex("campaignId", "campaignId");

        const sources = db.createObjectStore("sources", { keyPath: "id" });
        sources.createIndex("campaignId", "campaignId");

        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("sourceId", "sourceId");
        chunks.createIndex("campaignId", "campaignId");

        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("campaignId", "campaignId");

        const logs = db.createObjectStore("logEntries", { keyPath: "id" });
        logs.createIndex("sessionId", "sessionId");

        db.createObjectStore("encounters", { keyPath: "sessionId" });
        db.createObjectStore("settings");
        db.createObjectStore("meta");
      }
      if (oldVersion < 2) {
        db.createObjectStore("backups", { keyPath: "id" });
      }
    },
  });
}
