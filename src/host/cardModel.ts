import { mediaFrom, provenanceFrom } from "./runCard";
import type { SessionId, SourceId } from "./ids";
import {
  ENCOUNTER_TAG,
  NPC_CATEGORY,
  PLAYER_CATEGORY,
  type Entity,
  type Source,
} from "./types";

export type CardOriginal =
  | { kind: "pdf"; sourceId: SourceId; page: number }
  | { kind: "url"; href: string }
  | { kind: "source"; sourceId: SourceId; page: number | null; excerpt: string }
  | { kind: "none" };

export function cardOriginal(entity: Entity, sources: ReadonlyArray<Source>): CardOriginal {
  const provenance = provenanceFrom(entity.runCard);
  if (provenance === null) {
    return { kind: "none" };
  }
  if (provenance.url !== null) {
    return { kind: "url", href: provenance.url };
  }
  const pdf = sources.find((item) => item.id === provenance.sourceId && item.kind === "pdf");
  if (pdf) {
    return { kind: "pdf", sourceId: pdf.id, page: provenance.page ?? 1 };
  }
  return {
    kind: "source",
    sourceId: provenance.sourceId,
    page: provenance.page,
    excerpt: provenance.excerpt,
  };
}

/** Eyebrow label for inherent card kinds (free text / web / pdf / other tags). */
export function cardTypeLabel(tags: ReadonlyArray<string>): string {
  if (tags.length === 0) {
    return "Free text";
  }
  return tags.map((tag) => (tag === "entity" ? "Free text" : tag)).join(" · ");
}

/** Global cards (sessionId null) are always visible; others only in their session. */
export function cardVisibleForSession(
  entity: Entity,
  sessionId: SessionId | null,
): boolean {
  if (entity.sessionId === null) {
    return true;
  }
  return sessionId !== null && entity.sessionId === sessionId;
}

/** A card that carries a battlemap picture rather than a figure. */
export function isMapCard(entity: Entity): boolean {
  if (entity.runCard.tags.includes(ENCOUNTER_TAG)) {
    return false;
  }
  if (entity.runCard.category === "Battlemap") {
    return true;
  }
  if (
    entity.runCard.tags.includes("image") ||
    entity.runCard.tags.includes("map") ||
    entity.runCard.tags.includes("battlemap")
  ) {
    return true;
  }
  return mediaFrom(entity.runCard, "map") !== null;
}

export type CardType = "player" | "npc" | "map" | "encounter" | "misc";

/**
 * Coarse card kind, for the tint and badge on every card face.
 *
 * Roles beat media: a player card that carries a picture is still a player, not
 * a map, so an accidental category is visible at a glance.
 */
export function cardTypeOf(entity: Entity): CardType {
  if (entity.runCard.tags.includes(ENCOUNTER_TAG)) {
    return "encounter";
  }
  if (entity.runCard.category === PLAYER_CATEGORY) {
    return "player";
  }
  if (entity.runCard.category === NPC_CATEGORY) {
    return "npc";
  }
  if (isMapCard(entity)) {
    return "map";
  }
  return "misc";
}
