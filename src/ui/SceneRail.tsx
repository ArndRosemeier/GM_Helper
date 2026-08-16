import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import { asSessionId } from "../host/ids";

export function SceneRail() {
  const { store, snap } = useHost();
  const [sceneTitle, setSceneTitle] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sceneNotes, setSceneNotes] = useState(snap.scene?.description ?? "");

  useEffect(() => {
    setSceneNotes(snap.scene?.description ?? "");
  }, [snap.scene?.id, snap.scene?.description]);
  const currentScene = snap.scene;
  const scenes = [...snap.scenes]
    .filter((scene) => scene.sessionId === snap.session?.id)
    .sort((a, b) => a.order - b.order);

  return (
    <aside className="rail">
      <p className="eyebrow">{snap.campaign?.name ?? "Campaign"}</p>
      <h2>Session</h2>
      <label>
        Current
        <select
          value={snap.session?.id ?? ""}
          disabled={snap.sessions.length === 0}
          onChange={(event) => store.run(store.selectSession(asSessionId(event.target.value)))}
        >
          {snap.sessions.length === 0 ? <option value="">No session</option> : null}
          {snap.sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
            </option>
          ))}
        </select>
      </label>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = sessionTitle.trim();
          if (next.length === 0) {
            store.setError("Session title is empty");
            return;
          }
          store.run(store.createSession(next));
          setSessionTitle("");
        }}
      >
        <input
          value={sessionTitle}
          onChange={(event) => setSessionTitle(event.target.value)}
          placeholder="New session"
          aria-label="New session title"
        />
        <button type="submit">Add session</button>
      </form>
      <button
        type="button"
        disabled={snap.session === null}
        onClick={() => {
          if (!snap.session) {
            store.setError("No session to delete");
            return;
          }
          store.run(store.deleteSession(snap.session.id));
        }}
      >
        Delete session
      </button>
      <h2>Scenes</h2>
      <ol className="scene-list">
        {scenes.map((scene) => (
          <li key={scene.id} className="scene-row">
            <button
              type="button"
              className={scene.id === snap.scene?.id ? "scene active" : "scene"}
              onClick={() => store.selectScene(scene.id)}
            >
              {scene.title}
            </button>
            <button
              type="button"
              className="tiny"
              aria-label={`Delete ${scene.title}`}
              onClick={() => store.run(store.deleteScene(scene.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = sceneTitle.trim();
          if (next.length === 0) {
            store.setError("Scene title is empty");
            return;
          }
          store.run(store.createScene(next));
          setSceneTitle("");
        }}
      >
        <input
          value={sceneTitle}
          onChange={(event) => setSceneTitle(event.target.value)}
          placeholder="New scene"
          aria-label="New scene title"
        />
        <button type="submit">Add scene</button>
      </form>
      {currentScene ? (
        <form
          className="scene-notes"
          onSubmit={(event) => {
            event.preventDefault();
            store.run(store.setSceneDescription(currentScene.id, sceneNotes));
          }}
        >
          <label>
            Scene notes
            <textarea
              value={sceneNotes}
              onChange={(event) => setSceneNotes(event.target.value)}
              placeholder="What this place feels like — weather, crowd, tension. OpenRouter uses this for NPCs and maps."
              aria-label="Scene notes"
              rows={5}
            />
          </label>
          <button type="submit">Save notes</button>
        </form>
      ) : null}
      <div className="rail-nav">
        <button type="button" onClick={() => store.setMode("prep")}>
          Prep
        </button>
        <button type="button" onClick={() => store.setMode("settings")}>
          Settings
        </button>
      </div>
    </aside>
  );
}
