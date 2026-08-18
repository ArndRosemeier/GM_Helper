import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import { asSessionId } from "../host/ids";
import { DEFAULT_CAMPAIGN_GENRE } from "../host/types";
import { saveBlobAsFile } from "../lib/saveBlob";
import { AddUrlEntity } from "./AddUrlEntity";
import { SomeoneHere } from "./SomeoneHere";

export function SceneRail() {
  const { store, snap } = useHost();
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionGenre, setSessionGenre] = useState(snap.session?.genre ?? DEFAULT_CAMPAIGN_GENRE);

  useEffect(() => {
    setSessionGenre(snap.session?.genre ?? DEFAULT_CAMPAIGN_GENRE);
  }, [snap.session?.id, snap.session?.genre]);

  const saveAll = (): void => {
    // UI "Campaign" is the selected session; Campaign.name is the legacy workspace label.
    const defaultName = `${safeArchiveFileStem(snap.session?.title ?? "global")}-all.zip`;
    store.run(
      saveBlobAsFile(() => store.exportAllArchive(), defaultName, {
        description: "GM Helper archive",
        accept: { "application/zip": [".zip"] },
      }).then((result) => {
        if (result === "cancelled") {
          return;
        }
      }),
    );
  };

  const loadAll = (file: File): void => {
    store.run(
      store.importPickedArchive(file, () =>
        window.confirm(
          "Load all replaces every campaign, doc, and image in this browser with the archive. Your OpenRouter API key is kept. Continue?",
        ),
      ),
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
            // iOS/WebKit often shows .zip files but refuses selection when accept is
            // extension+MIME limited. Validate after pick via importPickedArchive instead.
            accept="application/zip,application/x-zip-compressed,application/octet-stream,.zip"
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
          store.run(store.createSession(next, sessionGenre));
          setSessionTitle("");
        }}
      >
        <div className="session-fields">
          <input
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
            placeholder="New campaign"
            aria-label="New campaign title"
          />
          <input
            value={sessionGenre}
            onChange={(event) => setSessionGenre(event.target.value)}
            onBlur={() => {
              if (snap.session) {
                store.run(store.setSessionGenre(sessionGenre));
              }
            }}
            placeholder={DEFAULT_CAMPAIGN_GENRE}
            aria-label="Campaign genre"
          />
        </div>
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

function safeArchiveFileStem(name: string): string {
  const stem = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return stem.length > 0 ? stem : "global";
}
