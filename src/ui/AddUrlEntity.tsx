import { useState } from "react";
import { useHost } from "../host/HostContext";
import { emptyRunCard, withText } from "../host/runCard";

export function AddUrlEntity() {
  const { store } = useHost();
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="add-entity">
      <form
        className="add-entity-stack"
        onSubmit={(event) => {
          event.preventDefault();
          store.run(
            store.createEntityFromUrl(url, urlName).then(() => {
              setUrl("");
              setUrlName("");
            }),
          );
        }}
      >
        <div className="inline-form add-entity-row">
          <button type="submit">Add URL</button>
          <input
            value={urlName}
            onChange={(event) => setUrlName(event.target.value)}
            placeholder="Card name"
            aria-label="URL card name"
          />
        </div>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          aria-label="Entity URL"
        />
      </form>
      <form
        className="add-entity-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const title = name.trim();
          if (title.length === 0) {
            store.setError("Card name is empty");
            return;
          }
          const body = description.trim();
          const card = body.length > 0 ? withText(emptyRunCard(title), body) : emptyRunCard(title);
          store.run(
            store.createEntity(card, "recurring").then(() => {
              setName("");
              setDescription("");
            }),
          );
        }}
      >
        <div className="inline-form add-entity-row">
          <button type="submit">Add</button>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Card name"
            aria-label="Card name"
          />
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          aria-label="Description"
          rows={3}
        />
      </form>
    </div>
  );
}
