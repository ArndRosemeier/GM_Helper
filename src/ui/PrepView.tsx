import { useState } from "react";
import { createPortal } from "react-dom";
import { cardTypeLabel } from "../host/cardModel";
import { SCHEMA_VERSION } from "../host/persist";
import { useHost } from "../host/HostContext";
import { emptyRunCard } from "../host/runCard";
import { asSessionId, type EntityId } from "../host/ids";
import { BattlegroundPrep } from "./TableSurface";
import { EncounterDetail } from "./EncounterPanel";
import { MediaViewer } from "./MediaViewer";
import { SourceViewer } from "./SourceViewer";
import { UrlViewer } from "./UrlViewer";

export function PrepView() {
  const { store, snap } = useHost();
  const [name, setName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<EntityId | null>(null);
  const pendingDelete =
    pendingDeleteId === null
      ? null
      : (snap.entities.find((entity) => entity.id === pendingDeleteId) ?? null);

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
        <ul className="library">
          {snap.entities.map((entity) => (
            <li key={entity.id} className="scene-row">
              <button type="button" onClick={() => store.openCard(entity.id)}>
                {entity.runCard.title}
                <em>{cardTypeLabel(entity.runCard.tags)}</em>
              </button>
              <button
                type="button"
                className="tiny"
                aria-label={`Delete ${entity.runCard.title}`}
                onClick={() => setPendingDeleteId(entity.id)}
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
          Feed a module PDF, markdown, HTML, or an image. Open a source to grab a picture onto a card.
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
        <h2>Campaigns</h2>
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
              store.setError("Campaign title is empty");
              return;
            }
            store.run(store.createSession(title));
            setSessionTitle("");
          }}
        >
          <input
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
            placeholder="New campaign"
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
        <p className="muted">
          Save all / Load all (full archive with docs and images) are next to Docs on the home rail. Download JSON
          is structure-only and omits doc files and pictures.
        </p>
      </section>
      {pendingDelete
        ? createPortal(
            <div
              className="busy-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-card-title"
              onClick={() => setPendingDeleteId(null)}
            >
              <div className="busy-modal-card" onClick={(event) => event.stopPropagation()}>
                <p className="eyebrow">Card</p>
                <h2 id="delete-card-title">Delete this card?</h2>
                <p>
                  “{pendingDelete.runCard.title}” will be removed permanently. This cannot be undone.
                </p>
                <div className="card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const id = pendingDelete.id;
                      store.run(store.deleteEntity(id).then(() => setPendingDeleteId(null)));
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setPendingDeleteId(null)}>
                    Keep
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
