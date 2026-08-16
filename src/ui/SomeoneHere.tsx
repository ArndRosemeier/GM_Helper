import { useState } from "react";
import { useHost } from "../host/HostContext";

export function SomeoneHere() {
  const { store, snap } = useHost();
  const [portrait, setPortrait] = useState(false);
  const [hint, setHint] = useState("");
  const hasKey = snap.settings.openRouterApiKey !== null;

  return (
    <section className="someone">
      <h3>Someone here</h3>
      <p className="muted">Make an NPC for the person they just stopped. OpenRouter reads the current scene notes.</p>
      <label className="check">
        <input
          type="checkbox"
          checked={portrait}
          onChange={(event) => setPortrait(event.target.checked)}
          disabled={!hasKey}
        />
        Portrait (needs OpenRouter)
      </label>
      <div className="card-actions">
        <button
          type="button"
          disabled={snap.busy !== null}
          onClick={() =>
            store.run(store.generateNpc(false, false))
          }
        >
          Local tables
        </button>
        <div className="inline-form">
          <button
            type="button"
            disabled={!hasKey || snap.busy !== null}
            onClick={() => store.run(store.generateNpc(true, portrait, hint))}
          >
            Ask OpenRouter
          </button>
          <input
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="old woman, merchant…"
            aria-label="NPC hint"
            disabled={!hasKey || snap.busy !== null}
          />
        </div>
      </div>
    </section>
  );
}
