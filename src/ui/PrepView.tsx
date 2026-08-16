import { useState } from "react";
import { SCHEMA_VERSION } from "../host/persist";
import { useHost } from "../host/HostContext";
import { emptyRunCard } from "../host/runCard";
import { BattlegroundPrep } from "./TableSurface";
import { EncounterDetail } from "./EncounterPanel";
import { MediaViewer } from "./MediaViewer";
import { SourceViewer } from "./SourceViewer";
import { UrlViewer } from "./UrlViewer";
import { asSessionId } from "../host/ids";
import { AddUrlEntity } from "./AddUrlEntity";

export function PrepView() {
  const { store, snap } = useHost();
  const [name, setName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");

  return (
    <div className="prep">
      <header className="prep-bar">
        <button type="button" onClick={() => store.setMode("run")}>
          Back to run
        </button>
        <h1>Prep</h1>
      </header>
      {snap.urlView ? <UrlViewer /> : snap.sourceView ? <SourceViewer /> : snap.mediaViewId ? <MediaViewer /> : null}
      <section>
        <h2>Library</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const title = name.trim();
            if (title.length === 0) {
              store.setError("Entity title is empty");
              return;
            }
            store.run(store.createEntity(emptyRunCard(title, []), "recurring"));
            setName("");
          }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New card title" />
          <button type="submit">Create</button>
        </form>
        <AddUrlEntity />
        <ul className="library">
          {snap.entities.map((entity) => (
            <li key={entity.id} className="scene-row">
              <button type="button" onClick={() => store.openCard(entity.id)}>
                {entity.runCard.title}
                <em>{entity.runCard.tags.join(", ") || entity.lifecycle}</em>
              </button>
              <button
                type="button"
                className="tiny"
                aria-label={`Delete ${entity.runCard.title}`}
                onClick={() => store.run(store.deleteEntity(entity.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Sources</h2>
        <p className="muted">
          Feed a module PDF, markdown, HTML, or a map image. Find opens the real page so you can grab a picture.
        </p>
        <input
          type="file"
          accept=".pdf,.md,.txt,.html,.htm,image/*"
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
              <button type="button" onClick={() => store.openSourceView(source.id, 1)}>
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
      <section>
        <h2>Sessions</h2>
        <ul className="session-list">
          {snap.sessions.map((session) => (
            <li key={session.id} className="scene-row">
              <button type="button" onClick={() => store.run(store.selectSession(asSessionId(session.id)))}>
                {session.title}
              </button>
              <button
                type="button"
                className="tiny"
                aria-label={`Delete ${session.title}`}
                onClick={() => store.run(store.deleteSession(session.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const title = sessionTitle.trim();
            if (title.length === 0) {
              store.setError("Session title is empty");
              return;
            }
            store.run(store.createSession(title));
            setSessionTitle("");
          }}
        >
          <input
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
            placeholder="New session"
          />
          <button type="submit">Add</button>
        </form>
      </section>
      <BattlegroundPrep />
      <EncounterDetail />
      <section>
        <h2>Export</h2>
        <p className="muted">
          {snap.lastBackupAt
            ? `Last automatic backup ${snap.lastBackupAt}. The app keeps the latest and previous copy in this browser.`
            : "No automatic backup yet. It is written after the campaign is opened and after you change it."}
          Schema {SCHEMA_VERSION}. Changing persisted fields requires a migration in persist/migrations.ts.
        </p>
        <div className="card-actions">
          <button
            type="button"
            onClick={() => {
              try {
                const blob = new Blob([store.exportCampaign()], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${snap.campaign?.name ?? "campaign"}.json`;
                link.click();
                URL.revokeObjectURL(url);
              } catch (error: unknown) {
                store.report(error);
              }
            }}
          >
            Download JSON
          </button>
          <label className="file-label">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                store.run(file.text().then((text) => store.importCampaign(text)));
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
