import { newTrackId } from "./ids";
import {
  NPC_CATEGORY,
  PLAYER_CATEGORY,
  type CombatStatsBlock,
  type FactItem,
  type MediaBlock,
  type ProvenanceBlock,
  type RunCard,
  type RunCardBlock,
  type SecretBlock,
  type Track,
  type TracksBlock,
} from "./types";

export function emptyRunCard(
  title: string,
  tags: ReadonlyArray<string> = [],
  category = "",
): RunCard {
  return { title, tags, category, blocks: [] };
}

export function withCategory(card: RunCard, category: string): RunCard {
  return syncCombatStatsForCategory({ ...card, category });
}

export function emptyCombatStats(): CombatStatsBlock {
  return { kind: "combat", maxHp: 0, currentHp: null, initiativeBonus: 0 };
}

export function combatStatsFrom(card: RunCard): CombatStatsBlock | null {
  for (const block of card.blocks) {
    if (block.kind === "combat") {
      return block;
    }
  }
  return null;
}

export function withCombatStats(card: RunCard, stats: CombatStatsBlock): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "combat");
  return { ...card, blocks: [...without, stats] };
}

export function withoutCombatStats(card: RunCard): RunCard {
  return { ...card, blocks: card.blocks.filter((block) => block.kind !== "combat") };
}

export function syncCombatStatsForCategory(card: RunCard): RunCard {
  if (card.category === PLAYER_CATEGORY) {
    const existing = combatStatsFrom(card);
    const maxHp = existing?.maxHp ?? 0;
    return withCombatStats(card, {
      kind: "combat",
      maxHp,
      currentHp: existing?.currentHp ?? maxHp,
      initiativeBonus: existing?.initiativeBonus ?? 0,
    });
  }
  if (card.category === NPC_CATEGORY) {
    const existing = combatStatsFrom(card);
    return withCombatStats(card, {
      kind: "combat",
      maxHp: existing?.maxHp ?? 0,
      currentHp: null,
      initiativeBonus: existing?.initiativeBonus ?? 0,
    });
  }
  return withoutCombatStats(card);
}

export function factsFrom(card: RunCard): ReadonlyArray<FactItem> {
  const items: FactItem[] = [];
  for (const block of card.blocks) {
    if (block.kind === "facts") {
      items.push(...block.items);
    }
  }
  return items;
}

export function tracksFrom(card: RunCard): ReadonlyArray<Track> {
  const items: Track[] = [];
  for (const block of card.blocks) {
    if (block.kind === "tracks") {
      items.push(...block.items);
    }
  }
  return items;
}

export function secretsFrom(card: RunCard): ReadonlyArray<SecretBlock> {
  return card.blocks.filter((block): block is SecretBlock => block.kind === "secret");
}

export function mediaFrom(card: RunCard, role: MediaBlock["role"]): MediaBlock | null {
  for (const block of card.blocks) {
    if (block.kind === "media" && block.role === role) {
      return block;
    }
  }
  return null;
}

export function mediaBlocksFrom(card: RunCard): ReadonlyArray<MediaBlock> {
  return card.blocks.filter((block): block is MediaBlock => block.kind === "media");
}

export function provenanceFrom(card: RunCard): ProvenanceBlock | null {
  for (const block of card.blocks) {
    if (block.kind === "provenance") {
      return block;
    }
  }
  return null;
}

export function textFrom(card: RunCard): string {
  return card.blocks
    .filter((block): block is Extract<RunCardBlock, { kind: "text" }> => block.kind === "text")
    .map((block) => block.body)
    .join("\n\n");
}

export function replaceTracks(card: RunCard, tracks: ReadonlyArray<Track>): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "tracks");
  const next: RunCardBlock[] = [...without];
  if (tracks.length > 0) {
    const block: TracksBlock = { kind: "tracks", items: tracks };
    next.push(block);
  }
  return { ...card, blocks: next };
}

export function adjustTrackInCard(card: RunCard, trackId: Track["id"], delta: number): RunCard {
  const tracks = tracksFrom(card).map((track) => {
    if (track.id !== trackId) {
      return track;
    }
    const next = track.current + delta;
    const clamped = track.max === null ? next : Math.min(track.max, next);
    return { ...track, current: Math.max(0, clamped) };
  });
  return replaceTracks(card, tracks);
}

export function newTrack(label: string, current: number, max: number | null): Track {
  return { id: newTrackId(), label, current, max };
}

export function withMedia(card: RunCard, block: MediaBlock): RunCard {
  return { ...card, blocks: [...card.blocks, block] };
}

export function withoutMedia(card: RunCard): RunCard {
  return { ...card, blocks: card.blocks.filter((block) => block.kind !== "media") };
}

export function withoutMediaId(card: RunCard, mediaId: MediaBlock["mediaId"]): RunCard {
  return {
    ...card,
    blocks: card.blocks.filter((block) => !(block.kind === "media" && block.mediaId === mediaId)),
  };
}

export function firstMediaBlock(card: RunCard): MediaBlock | null {
  return mediaBlocksFrom(card)[0] ?? null;
}

export function withSecret(card: RunCard, body: string): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "secret");
  return { ...card, blocks: [...without, { kind: "secret", body }] };
}

export function withFacts(card: RunCard, items: ReadonlyArray<FactItem>): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "facts");
  return { ...card, blocks: [...without, { kind: "facts", items }] };
}

export function withText(card: RunCard, body: string): RunCard {
  const without = card.blocks.filter((block) => block.kind !== "text");
  return { ...card, blocks: [{ kind: "text", body }, ...without] };
}

export function withProvenance(card: RunCard, block: ProvenanceBlock): RunCard {
  const without = card.blocks.filter((existing) => existing.kind !== "provenance");
  return { ...card, blocks: [...without, block] };
}

export function cloneTracks(tracks: ReadonlyArray<Track>): ReadonlyArray<Track> {
  return tracks.map((track) => ({ ...track, id: newTrackId() }));
}
