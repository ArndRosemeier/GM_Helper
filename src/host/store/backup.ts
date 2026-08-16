import type { CampaignId, EntityId } from "../ids";
import type {
  Campaign,
  EncounterState,
  Entity,
  IsoDateTime,
  LogEntry,
  MediaRecord,
  Scene,
  Session,
  Source,
  SourceChunk,
} from "../types";

export type CampaignBackup = {
  id: string;
  schemaVersion: number;
  campaignId: CampaignId;
  savedAt: IsoDateTime;
  campaign: Campaign;
  entities: ReadonlyArray<Entity>;
  sessions: ReadonlyArray<Session>;
  scenes: ReadonlyArray<Scene>;
  sources: ReadonlyArray<Source>;
  chunks: ReadonlyArray<SourceChunk>;
  media: ReadonlyArray<MediaRecord>;
  logEntries: ReadonlyArray<LogEntry>;
  encounter: EncounterState | null;
  tableCardIds: ReadonlyArray<EntityId>;
};

export function backupSlotId(campaignId: CampaignId, slot: "latest" | "prev"): string {
  return `backup:${campaignId}:${slot}`;
}

export function newestBackup(backups: ReadonlyArray<CampaignBackup>): CampaignBackup {
  if (backups.length === 0) {
    throw new Error("No campaign backup is stored");
  }
  return backups.reduce((newest, item) => (item.savedAt > newest.savedAt ? item : newest));
}
