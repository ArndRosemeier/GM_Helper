import { useHost } from "../host/HostContext";
import { MediaViewer } from "./MediaViewer";
import { SourceViewer } from "./SourceViewer";
import { UrlViewer } from "./UrlViewer";

export function PrepView() {
  const { store, snap } = useHost();

  return (
    <div className="prep">
      <header className="prep-bar">
        <button type="button" onClick={() => store.setMode("home")}>
          Back to Home
        </button>
        <h1>Docs</h1>
      </header>
      {snap.urlView ? <UrlViewer /> : snap.sourceView ? <SourceViewer /> : null}
      {snap.mediaViewEntityId ? <MediaViewer /> : null}
      <section>
        <h2>Sources</h2>
        <p className="muted">
          Feed a module PDF. Open a source to grab a picture onto a card.
        </p>
        <input
          type="file"
          accept="application/pdf,application/octet-stream,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            store.run(store.ingestUserFile(file));
            event.target.value = "";
          }}
        />
        <ul className="sources">
          {snap.sources.map((source) => (
            <li key={source.id} className="scene-row">
              <button type="button" onClick={() => store.openSourceView(source.id, 1, null)}>
                {source.title} <em>{source.kind}</em>
              </button>
              <button
                type="button"
                className="tiny"
                aria-label={`Delete ${source.title}`}
                onClick={() => store.run(store.deleteSource(source.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
