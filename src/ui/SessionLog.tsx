import { useState } from "react";
import { useHost } from "../host/HostContext";

export function SessionLog() {
  const { store, snap } = useHost();
  const [body, setBody] = useState("");

  return (
    <section className="log">
      <h3>Session notes</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = body.trim();
          if (next.length === 0) {
            store.setError("Note is empty");
            return;
          }
          store.run(store.addLog(next));
          setBody("");
        }}
      >
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What just became true?"
          rows={2}
        />
        <button type="submit">Note</button>
      </form>
      <ol className="log-list">
        {[...snap.logEntries].reverse().slice(0, 6).map((entry) => (
          <li key={entry.id}>{entry.body}</li>
        ))}
      </ol>
    </section>
  );
}
