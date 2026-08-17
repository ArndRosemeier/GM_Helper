import { useMemo, useState } from "react";
import { useHost } from "../host/HostContext";
import type { ChunkId } from "../host/ids";
import type { Source, SourceChunk } from "../host/types";

function chunkOrigin(
  chunks: ReadonlyArray<SourceChunk>,
  sources: ReadonlyArray<Source>,
  chunkId: ChunkId,
): string {
  const chunk = chunks.find((item) => item.id === chunkId);
  if (!chunk) {
    return "Source page";
  }
  const source = sources.find((item) => item.id === chunk.sourceId);
  const title = source?.title ?? "Source";
  return chunk.page !== null ? `${title} p.${String(chunk.page)}` : title;
}

function isDocSource(source: Source): boolean {
  return source.kind !== "manual";
}

export function SearchTray() {
  const { store, snap } = useHost();
  const [query, setQuery] = useState("");
  const docs = useMemo(() => snap.sources.filter(isDocSource), [snap.sources]);
  const hits = useMemo(
    () => store.search(query),
    [store, query, snap.entities, snap.chunks],
  );

  return (
    <section className="tray">
      {docs.length > 0 ? (
        <div className="doc-buttons">
          {docs.map((source) => (
            <button
              key={source.id}
              type="button"
              className={snap.sourceView?.sourceId === source.id ? "doc-button active" : "doc-button"}
              onClick={() => store.openDoc(source.id)}
            >
              {source.title}
            </button>
          ))}
        </div>
      ) : null}
      <label className="search-label">
        <span>Find</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="NPC, room, appendix…"
          enterKeyHint="search"
        />
      </label>
      <ul className="hits">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button
              type="button"
              className="hit"
              onClick={() => {
                if (hit.kind === "entity" && hit.entityId) {
                  store.openCard(hit.entityId);
                  return;
                }
                if (hit.kind === "chunk" && hit.chunkId) {
                  store.openChunkView(hit.chunkId);
                }
              }}
            >
              <strong>{hit.title}</strong>
              {hit.kind === "chunk" && hit.chunkId ? (
                <em>{chunkOrigin(snap.chunks, snap.sources, hit.chunkId)}</em>
              ) : null}
              <span>{hit.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
