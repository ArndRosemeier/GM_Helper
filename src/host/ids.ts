export type CampaignId = string & { readonly __brand: "CampaignId" };
export type EntityId = string & { readonly __brand: "EntityId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type SceneId = string & { readonly __brand: "SceneId" };
export type SourceId = string & { readonly __brand: "SourceId" };
export type ChunkId = string & { readonly __brand: "ChunkId" };
export type MediaId = string & { readonly __brand: "MediaId" };
export type LogEntryId = string & { readonly __brand: "LogEntryId" };
export type TrackId = string & { readonly __brand: "TrackId" };
export type TokenId = string & { readonly __brand: "TokenId" };
export type ParticipantId = string & { readonly __brand: "ParticipantId" };
export type FactPinId = string & { readonly __brand: "FactPinId" };

function brand<T extends string>(value: string): T {
  return value as T;
}

function fresh<T extends string>(): T {
  return brand<T>(crypto.randomUUID());
}

export const newCampaignId = (): CampaignId => fresh<CampaignId>();
export const newEntityId = (): EntityId => fresh<EntityId>();
export const newSessionId = (): SessionId => fresh<SessionId>();
export const newSceneId = (): SceneId => fresh<SceneId>();
export const newSourceId = (): SourceId => fresh<SourceId>();
export const newChunkId = (): ChunkId => fresh<ChunkId>();
export const newMediaId = (): MediaId => fresh<MediaId>();
export const newLogEntryId = (): LogEntryId => fresh<LogEntryId>();
export const newTrackId = (): TrackId => fresh<TrackId>();
export const newTokenId = (): TokenId => fresh<TokenId>();
export const newParticipantId = (): ParticipantId => fresh<ParticipantId>();
export const newFactPinId = (): FactPinId => fresh<FactPinId>();

export const asCampaignId = (value: string): CampaignId => brand<CampaignId>(value);
export const asEntityId = (value: string): EntityId => brand<EntityId>(value);
export const asSessionId = (value: string): SessionId => brand<SessionId>(value);
export const asSceneId = (value: string): SceneId => brand<SceneId>(value);
export const asSourceId = (value: string): SourceId => brand<SourceId>(value);
export const asChunkId = (value: string): ChunkId => brand<ChunkId>(value);
export const asMediaId = (value: string): MediaId => brand<MediaId>(value);
export const asLogEntryId = (value: string): LogEntryId => brand<LogEntryId>(value);
export const asTrackId = (value: string): TrackId => brand<TrackId>(value);
export const asTokenId = (value: string): TokenId => brand<TokenId>(value);
export const asParticipantId = (value: string): ParticipantId => brand<ParticipantId>(value);
export const asFactPinId = (value: string): FactPinId => brand<FactPinId>(value);
