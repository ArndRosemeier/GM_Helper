import { useState } from "react";
import { useHost } from "../host/HostContext";

export function SomeoneHere() {
  const { store, snap } = useHost();
  const [portrait, setPortrait] = useState(false);
  const [hint, setHint] = useState("");
  const busy = snap.busy !== null;

  const inventNpc = (): void => {
    if (snap.settings.openRouterApiKey === null) {
      store.setError("Add Npc needs an OpenRouter API key. Add one in Settings.");
      return;
    }
    store.run(store.generateNpc(true, portrait, hint));
  };

  return (
    <section className="someone">
      <h3>Someone here</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={portrait}
          onChange={(event) => setPortrait(event.target.checked)}
          disabled={busy}
        />
        Portrait (needs OpenRouter)
      </label>
      <div className="inline-form">
        <button type="button" disabled={busy} onClick={inventNpc}>
          Add Npc
        </button>
        <input
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          placeholder="old woman, merchant…"
          aria-label="NPC hint"
          disabled={busy}
        />
      </div>
    </section>
  );
}
