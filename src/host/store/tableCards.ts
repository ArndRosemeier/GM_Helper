import { asEntityId, type CampaignId, type EntityId } from "../ids";

export function tableCardsMetaKey(campaignId: CampaignId): string {
  return `tableCards:${campaignId}`;
}

export function parseTableCardIds(raw: unknown, known: ReadonlySet<string>): EntityId[] {
  if (raw === undefined) {
    return [];
  }
  if (typeof raw !== "string") {
    throw new Error("Saved table cards are not a string");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved table cards are not a list");
  }
  const ids: EntityId[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      throw new Error("Saved table cards contain a non-string id");
    }
    if (known.has(item)) {
      ids.push(asEntityId(item));
    }
  }
  return ids;
}
