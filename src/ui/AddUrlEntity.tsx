import { useState } from "react";
import { useHost } from "../host/HostContext";

export function AddUrlEntity() {
  const { store } = useHost();
  const [url, setUrl] = useState("");

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        store.run(
          store.createEntityFromUrl(url).then(() => {
            setUrl("");
          }),
        );
      }}
    >
      <input
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
        aria-label="Entity URL"
      />
      <button type="submit">Add URL</button>
    </form>
  );
}
