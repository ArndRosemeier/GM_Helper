import { useState } from "react";
import { useHost } from "../host/HostContext";
import { emptyRunCard, withText } from "../host/runCard";
import { CardTypeButton } from "./CardTypeButton";

export function AddUrlEntity() {
  const { store } = useHost();
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [urlTypeOpen, setUrlTypeOpen] = useState(false);
  const [cardTypeOpen, setCardTypeOpen] = useState(false);

  const addUrl = (category: string): void => {
    store.run(
      store.createEntityFromUrl(url, urlName, category).then(() => {
        setUrl("");
        setUrlName("");
      }),
    );
  };

  const addCard = (category: string): void => {
    const title = name.trim();
    if (title.length === 0) {
      store.setError("Card name is empty");
      return;
    }
    const body = description.trim();
    const card =
      body.length > 0
        ? withText(emptyRunCard(title, [], category), body)
        : emptyRunCard(title, [], category);
    store.run(
      store.createEntity(card, "recurring").then(() => {
        setName("");
        setDescription("");
      }),
    );
  };

  return (
    <div className="add-entity">
      <form
        className="add-entity-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setUrlTypeOpen(true);
        }}
      >
        <div className="inline-form add-entity-row">
          <CardTypeButton
            label="Add URL"
            open={urlTypeOpen}
            onOpenChange={setUrlTypeOpen}
            onPick={addUrl}
            disabled={url.trim().length === 0}
            title={
              url.trim().length === 0
                ? "Type a URL first"
                : "Pick the card type, then the URL card is added"
            }
          />
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
          setCardTypeOpen(true);
        }}
      >
        <div className="inline-form add-entity-row">
          <CardTypeButton
            label="Add"
            open={cardTypeOpen}
            onOpenChange={setCardTypeOpen}
            onPick={addCard}
            disabled={name.trim().length === 0}
            title={
              name.trim().length === 0
                ? "Type a card name first"
                : "Pick the card type, then the card is added"
            }
          />
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
