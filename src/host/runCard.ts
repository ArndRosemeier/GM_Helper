import { newTrackId, type SourceId } from "./ids";
import type {
  Entity,
  FactItem,
  MediaBlock,
  ProvenanceBlock,
  RunCard,
  RunCardBlock,
  SecretBlock,
  Track,
  TracksBlock,
} from "./types";

export function emptyRunCard(title: string, tags: ReadonlyArray<string> = []): RunCard {
  return { title, tags, blocks: [] };
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

export function pdfBookmarkForPage(
  entities: ReadonlyArray<Entity>,
  sourceId: SourceId,
  page: number,
): Entity | null {
  for (const entity of entities) {
    const provenance = provenanceFrom(entity.runCard);
    if (provenance !== null && provenance.sourceId === sourceId && provenance.page === page) {
      return entity;
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
  const without = card.blocks.filter(
    (existing) => !(existing.kind === "media" && existing.role === block.role),
  );
  return { ...card, blocks: [...without, block] };
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
