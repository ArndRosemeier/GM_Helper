import { useState } from "react";
import { useHost } from "../host/HostContext";
import { asSessionId } from "../host/ids";
import { saveBlobAsFile } from "../lib/saveBlob";
import { AddUrlEntity } from "./AddUrlEntity";
import { SomeoneHere } from "./SomeoneHere";

export function SceneRail() {
  const { store, snap } = useHost();
  const [sessionTitle, setSessionTitle] = useState("");

  const saveAll = (): void => {
    store.run(
      saveBlobAsFile(
        () => store.exportAllArchive(),
        `${snap.campaign?.name ?? "gm-helper"}-all.zip`,
        {
          description: "GM Helper archive",
          accept: { "application/zip": [".zip"] },
        },
      ).then((result) => {
        if (result === "cancelled") {
          return;
        }
      }),
    );
  };

  const loadAll = (file: File): void => {
    store.run(
      (async () => {
        const kind = await store.peekArchiveKind(file);
        if (kind === "card") {
          await store.importCardArchive(file);
          return;
        }
        const ok = window.confirm(
          "Load all replaces every campaign, doc, and image in this browser with the archive. Your OpenRouter API key is kept. Continue?",
        );
        if (!ok) {
          return;
        }
        await store.importAllArchive(file);
      })(),
    );
  };

  return (
    <aside className="rail">
      <div className="rail-nav">
        <button type="button" onClick={() => store.setMode("settings")}>
          Settings
        </button>
        <button type="button" onClick={() => store.setMode("prep")}>
          Docs
        </button>
        <button type="button" disabled={snap.busy !== null} onClick={saveAll}>
          Save all
        </button>
        <label className="file-label rail-load-all">
          Load all
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={snap.busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) {
                return;
              }
              loadAll(file);
            }}
          />
        </label>
      </div>
      <h2>Campaign</h2>
      <label>
        Current
        <select
          value={snap.session?.id ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (value.length === 0) {
              store.run(store.clearSession());
              return;
            }
            store.run(store.selectSession(asSessionId(value)));
          }}
        >
          <option value="">&lt;global&gt;</option>
          {snap.sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
            </option>
          ))}
        </select>
      </label>
      <form
        className="session-create"
        onSubmit={(event) => {
          event.preventDefault();
          const next = sessionTitle.trim();
          if (next.length === 0) {
            store.setError("Campaign title is empty");
            return;
          }
          store.run(store.createSession(next));
          setSessionTitle("");
        }}
      >
        <input
          value={sessionTitle}
          onChange={(event) => setSessionTitle(event.target.value)}
          placeholder="New campaign"
          aria-label="New campaign title"
        />
        <div className="inline-form">
          <button type="submit">Add campaign</button>
          <button
            type="button"
            disabled={snap.session === null}
            onClick={() => {
              if (!snap.session) {
                store.setError("No campaign to delete");
                return;
              }
              store.run(store.deleteSession(snap.session.id));
            }}
          >
            Delete campaign
          </button>
        </div>
      </form>
      <div className="add-heading">
        <h2>Add</h2>
        <label className="add-category">
          <span className="muted">Category</span>
          <select
            value={snap.addCategory}
            aria-label="Category for new cards"
            onChange={(event) => store.setAddCategory(event.target.value)}
          >
            {(snap.campaign?.cardCategories.length ?? 0) === 0 ? (
              <option value="">No categories yet</option>
            ) : (
              snap.campaign?.cardCategories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      <AddUrlEntity />
      <SomeoneHere />
    </aside>
  );
}
