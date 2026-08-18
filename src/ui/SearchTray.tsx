import { useMemo, useState } from "react";
import type { SourceId } from "../host/ids";
import { useHost } from "../host/HostContext";
import type { Source } from "../host/types";

function isDocSource(source: Source): boolean {
  return source.kind !== "manual";
}

export function SearchTray() {
  const { store, snap } = useHost();
  const [query, setQuery] = useState("");
  const [uncheckedIds, setUncheckedIds] = useState<ReadonlySet<SourceId>>(() => new Set());
  const docs = useMemo(() => snap.sources.filter(isDocSource), [snap.sources]);
  const includedSourceIds = useMemo(() => {
    const ids = new Set<SourceId>();
    for (const doc of docs) {
      if (!uncheckedIds.has(doc.id)) {
        ids.add(doc.id);
      }
    }
    return ids;
  }, [docs, uncheckedIds]);
  const hits = useMemo(
    () => store.search(query, includedSourceIds),
    [store, query, includedSourceIds, snap.chunks],
  );

  function setDocIncluded(sourceId: SourceId, included: boolean): void {
    setUncheckedIds((prev) => {
      const next = new Set(prev);
      if (included) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  return (
    <section className="tray">
      {docs.length > 0 ? (
        <div className="doc-buttons">
          {docs.map((source) => (
            <div key={source.id} className="doc-row">
              <label className="doc-scope">
                <input
                  type="checkbox"
                  checked={!uncheckedIds.has(source.id)}
                  onChange={(event) => setDocIncluded(source.id, event.target.checked)}
                  aria-label={`Include ${source.title} in Find`}
                />
              </label>
              <button
                type="button"
                className={snap.sourceView?.sourceId === source.id ? "doc-button active" : "doc-button"}
                onClick={() => store.openDoc(source.id)}
              >
                {source.title}
              </button>
            </div>
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
              onClick={() => store.openChunkView(hit.chunkId)}
            >
              <strong>{hit.title}</strong>
              <span>{hit.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
