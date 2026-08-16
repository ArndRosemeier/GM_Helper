import MiniSearch from "minisearch";
import type { Entity, SearchHit, SourceChunk } from "../types";
import { asChunkId, asEntityId } from "../ids";

type SearchDoc = {
  id: string;
  kind: "entity" | "chunk";
  title: string;
  text: string;
  tags: string;
};

function entityText(entity: Entity): string {
  const parts: string[] = [entity.runCard.title, ...entity.runCard.tags];
  for (const block of entity.runCard.blocks) {
    switch (block.kind) {
      case "text":
      case "secret":
        parts.push(block.body);
        break;
      case "facts":
        for (const item of block.items) {
          parts.push(item.label, item.value);
        }
        break;
      case "tracks":
        for (const track of block.items) {
          parts.push(track.label);
        }
        break;
      case "provenance":
        parts.push(block.excerpt);
        break;
      case "media":
        break;
    }
  }
  return parts.join(" ");
}

function snippetOf(text: string, query: string): string {
  const lower = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  const idx = needle.length === 0 ? 0 : lower.indexOf(needle.split(/\s+/)[0] ?? needle);
  const start = idx < 0 ? 0 : Math.max(0, idx - 40);
  const slice = text.slice(start, start + 160).replace(/\s+/g, " ").trim();
  return start > 0 ? `…${slice}` : slice;
}

export function createCatalog(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>({
    fields: ["title", "text", "tags"],
    storeFields: ["kind", "title", "text"],
    idField: "id",
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });
}

export function rebuildCatalog(
  catalog: MiniSearch<SearchDoc>,
  entities: ReadonlyArray<Entity>,
  chunks: ReadonlyArray<SourceChunk>,
): void {
  catalog.removeAll();
  const docs: SearchDoc[] = [
    ...entities.map((entity) => ({
      id: `entity:${entity.id}`,
      kind: "entity" as const,
      title: entity.runCard.title,
      text: entityText(entity),
      tags: entity.runCard.tags.join(" "),
    })),
    ...chunks.map((chunk) => ({
      id: `chunk:${chunk.id}`,
      kind: "chunk" as const,
      title: chunk.heading,
      text: chunk.text,
      tags: "",
    })),
  ];
  if (docs.length > 0) {
    catalog.addAll(docs);
  }
}

export function searchCatalog(
  catalog: MiniSearch<SearchDoc>,
  query: string,
): ReadonlyArray<SearchHit> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return catalog.search(trimmed).slice(0, 24).map((result) => {
    const kind = result.kind;
    if (kind !== "entity" && kind !== "chunk") {
      throw new Error(`Search document missing kind: ${result.id}`);
    }
    const title = result.title;
    const text = result.text;
    if (typeof title !== "string" || typeof text !== "string") {
      throw new Error(`Search document missing stored fields: ${result.id}`);
    }
    const rawId = result.id.includes(":") ? result.id.slice(result.id.indexOf(":") + 1) : result.id;
    return {
      id: result.id,
      kind,
      title,
      snippet: snippetOf(text, trimmed),
      entityId: kind === "entity" ? asEntityId(rawId) : null,
      chunkId: kind === "chunk" ? asChunkId(rawId) : null,
    };
  });
}
