import { useEffect, useRef, useState } from "react";
import { cardTypeForCategory } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import { Modal } from "./Modal";

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
  onConfirm: (name: string, category: string) => void;
}) {
  const { snap } = useHost();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const categories = snap.campaign?.cardCategories ?? [];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Modal
      titleId="name-card-title"
      onClose={onCancel}
      className="name-card-modal"
      cardClassName="name-card-modal-card"
    >
      <form
        className="app-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed.length === 0 || category.length === 0) {
            return;
          }
          onConfirm(trimmed, category);
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
        <label className="card-type-field">
          Card type
          <span className="card-type-choice">
            {category.length > 0 ? (
              <span
                className={`card-type-swatch is-${cardTypeForCategory(category)}`}
                aria-hidden="true"
              />
            ) : null}
            <select
              value={category}
              aria-label="Card type"
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="" disabled>
                Choose a card type…
              </option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </span>
        </label>
        {categories.length === 0 ? (
          <p className="muted">This campaign has no card types yet, so no card can be made.</p>
        ) : null}
        <div className="card-actions">
          <button type="submit" disabled={name.trim().length === 0 || category.length === 0}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
