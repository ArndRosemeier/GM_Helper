import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function NameCardModal({
  title,
  fieldLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  fieldLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return createPortal(
    <div className="name-card-modal" role="dialog" aria-modal="true" aria-labelledby="name-card-title">
      <form
        className="name-card-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed.length === 0) {
            return;
          }
          onConfirm(trimmed);
        }}
      >
        <p className="eyebrow">New card</p>
        <h2 id="name-card-title">{title}</h2>
        <label>
          {fieldLabel}
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            aria-label={fieldLabel}
          />
        </label>
        <div className="card-actions">
          <button type="submit" disabled={name.trim().length === 0}>
            {confirmLabel}
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
