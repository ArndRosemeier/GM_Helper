import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function AiTopicModal({
  initialTopic,
  onCancel,
  onConfirm,
}: {
  initialTopic: string;
  onCancel: () => void;
  onConfirm: (topic: string, tryGetImage: boolean) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [tryGetImage, setTryGetImage] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return createPortal(
    <div className="name-card-modal" role="dialog" aria-modal="true" aria-labelledby="ai-topic-title">
      <form
        className="name-card-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = topic.trim();
          if (trimmed.length === 0) {
            return;
          }
          onConfirm(trimmed, tryGetImage);
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
        <div className="card-actions">
          <button type="submit" disabled={topic.trim().length === 0}>
            Add card with AI
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
