import { useEffect, useRef, useState } from "react";
import { cardTypeForCategory } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import { Modal } from "./Modal";

export function AiTopicModal({
  initialTopic,
  onCancel,
  onConfirm,
}: {
  initialTopic: string;
  onCancel: () => void;
  onConfirm: (topic: string, tryGetImage: boolean, category: string) => void;
}) {
  const { snap } = useHost();
  const [topic, setTopic] = useState(initialTopic);
  const [tryGetImage, setTryGetImage] = useState(true);
  const [category, setCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const categories = snap.campaign?.cardCategories ?? [];

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <Modal
      titleId="ai-topic-title"
      onClose={onCancel}
      className="name-card-modal"
      cardClassName="name-card-modal-card"
    >
      <form
        className="app-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = topic.trim();
          if (trimmed.length === 0) {
            return;
          }
          onConfirm(trimmed, tryGetImage, category);
        }}
      >
        <p className="eyebrow">AI card</p>
        <h2 id="ai-topic-title">What should the AI extract?</h2>
        <label>
          Topic
          <input
            ref={inputRef}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            autoComplete="off"
            aria-label="Topic"
          />
        </label>
        <label className="ai-topic-checkbox">
          <input
            type="checkbox"
            checked={tryGetImage}
            onChange={(event) => setTryGetImage(event.target.checked)}
          />
          Try to get fitting image from document
        </label>
        <label className="card-type-field">
          Card type
          <span className="card-type-choice">
            <span
              className={`card-type-swatch is-${cardTypeForCategory(category)}`}
              aria-hidden="true"
            />
            <select
              value={category}
              aria-label="Card type"
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </span>
        </label>
        <div className="card-actions">
          <button type="submit" disabled={topic.trim().length === 0}>
            Add card with AI
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
