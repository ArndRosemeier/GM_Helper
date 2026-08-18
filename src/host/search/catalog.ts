import MiniSearch from "minisearch";
import type { SearchHit, SourceChunk } from "../types";
import { asChunkId, asSourceId, type SourceId } from "../ids";

export type SearchDoc = {
  id: string;
  title: string;
  text: string;
  sourceId: string;
};

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
    fields: ["title", "text"],
    storeFields: ["title", "text", "sourceId"],
    idField: "id",
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });
}

export function rebuildCatalog(
  catalog: MiniSearch<SearchDoc>,
  chunks: ReadonlyArray<SourceChunk>,
): void {
  catalog.removeAll();
  const docs: SearchDoc[] = chunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.heading,
    text: chunk.text,
    sourceId: chunk.sourceId,
  }));
  if (docs.length > 0) {
    catalog.addAll(docs);
  }
}

export function searchCatalog(
  catalog: MiniSearch<SearchDoc>,
  query: string,
  includedSourceIds: ReadonlySet<SourceId>,
): ReadonlyArray<SearchHit> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const ranked = catalog.search(trimmed).filter((result) => {
    if (typeof result.sourceId !== "string" || result.sourceId.length === 0) {
      throw new Error(`Search chunk missing sourceId: ${result.id}`);
    }
    return includedSourceIds.has(asSourceId(result.sourceId));
  });
  return ranked.slice(0, 24).map((result) => {
    const title = result.title;
    const text = result.text;
    if (typeof title !== "string" || typeof text !== "string") {
      throw new Error(`Search document missing stored fields: ${result.id}`);
    }
    return {
      id: result.id,
      title,
      snippet: snippetOf(text, trimmed),
      chunkId: asChunkId(result.id),
    };
  });
}
