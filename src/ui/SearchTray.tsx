import { useMemo, useState } from "react";
import { useHost } from "../host/HostContext";
import type { ChunkId } from "../host/ids";
import type { Source, SourceChunk } from "../host/types";
import { googleSearchUrl, webSearchQuery } from "../lib/webSearch";
import { AddUrlEntity } from "./AddUrlEntity";

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

export function SearchTray() {
  const { store, snap } = useHost();
  const [query, setQuery] = useState("");
  const web = snap.settings.findWeb;
  const hits = useMemo(
    () => (web ? [] : store.search(query)),
    [store, query, snap.entities, snap.chunks, web],
  );
  const webPreview =
    web && query.trim().length > 0 ? webSearchQuery(snap.settings.webSearchPrefix, query) : null;

  return (
    <section className="tray">
      <form
        className="find-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!web) {
            return;
          }
          store.openWebSearch(query);
        }}
      >
        <label className="search-label">
          <span>Find</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={web ? "Search the web…" : "NPC, room, appendix…"}
            enterKeyHint="search"
          />
        </label>
        <div className="find-web">
          <label className="check">
            <input
              type="checkbox"
              checked={web}
              onChange={(event) => {
                const on = event.target.checked;
                store.run(store.applySettingsPatch({ field: "findWeb", value: on }));
                if (!on) {
                  store.closeWebSearch();
                }
              }}
            />
            Web
          </label>
          <label className="prefix-label">
            <span>Prefix</span>
            <input
              value={snap.settings.webSearchPrefix}
              onChange={(event) =>
                store.run(store.applySettingsPatch({ field: "webSearchPrefix", value: event.target.value }))
              }
              placeholder="PF2E"
              aria-label="Web search prefix"
            />
          </label>
        </div>
        {web ? (
          <div className="find-submit">
            <button type="submit">Search</button>
            {webPreview ? <p className="muted">Will open: {webPreview}</p> : null}
            {snap.webSearchView ? (
              <button
                type="button"
                onClick={() => {
                  const last = snap.webSearchView;
                  if (!last) {
                    store.setError("No web search to open");
                    return;
                  }
                  store.openUrlView(googleSearchUrl(last.query));
                }}
              >
                Open again: {snap.webSearchView.query}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
      <AddUrlEntity />
      {web ? null : (
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
              {hit.kind === "chunk" && hit.chunkId ? (
                <span className="hit-actions">
                  <button type="button" onClick={() => store.run(store.saveChunkAsCard(hit.chunkId as ChunkId))}>
                    Save card
                  </button>
                  <button
                    type="button"
                    onClick={() => store.run(store.liftChunk(hit.chunkId as ChunkId))}
                  >
                    Lift
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
