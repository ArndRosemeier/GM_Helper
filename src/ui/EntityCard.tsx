import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cardOriginal, cardTypeLabel } from "../host/cardModel";
import { combatHpForParticipant, isEncounterCard } from "../host/encounter";
import { useHost } from "../host/HostContext";
import { asSessionId } from "../host/ids";
import type { FocusCardProps } from "../host/features/types";
import type { ParticipantId, TrackId } from "../host/ids";
import type { Entity, Source } from "../host/types";
import { useCardEncounterDrag } from "./useCardEncounterDrag";
import {
  combatStatsFrom,
  factsFrom,
  mediaBlocksFrom,
  secretsFrom,
  textFrom,
  tracksFrom,
} from "../host/runCard";
import { clipboardReadSupported, readClipboardImage } from "../lib/clipboardImage";
import { isIntegerDraft, parseIntegerField } from "../lib/integerField";
import { saveBlobAsFile } from "../lib/saveBlob";
import { CardPdfReader } from "./CardPdfReader";
import { CardUrlFrame } from "./CardUrlFrame";
import { MarkdownText } from "./MarkdownText";
import { TokenGrabModal } from "./TokenGrabModal";
import { cardImageUrl } from "../lib/defaultToken";

export function EntityCard({
  entity,
  revealSecrets,
  expanded: expandedProp,
  onToggleExpand,
  inspectParticipantId,
}: FocusCardProps & {
  expanded?: boolean;
  onToggleExpand?: () => void;
  inspectParticipantId?: ParticipantId;
}) {
  const { store, snap } = useHost();
  const facts = factsFrom(entity.runCard);
  const tracks = tracksFrom(entity.runCard);
  const secrets = secretsFrom(entity.runCard);
  const text = textFrom(entity.runCard);
  const pictures = mediaBlocksFrom(entity.runCard);
  const combat = combatStatsFrom(entity.runCard);
  const inspectParticipant =
    inspectParticipantId === undefined
      ? undefined
      : snap.tableEncounter?.participants.find((item) => item.id === inspectParticipantId);
  const inspectHp =
    inspectParticipant === undefined
      ? null
      : combatHpForParticipant(inspectParticipant, entity);
  const displayedCurrentHp = inspectHp !== null ? inspectHp.currentHp : (combat?.currentHp ?? null);
  const hasCombatStats = combat !== null;
  const combatMaxHp = combat?.maxHp;
  const combatCurrentHp = displayedCurrentHp;
  const combatInitiative = combat?.initiativeBonus;
  const original = cardOriginal(entity, snap.sources);
  const controlled = expandedProp !== undefined;
  const [expandedLocal, setExpandedLocal] = useState(entity.id === snap.openedEntityId);
  const expanded = controlled ? expandedProp : expandedLocal;
  const [secretOpen, setSecretOpen] = useState(revealSecrets);
  const [titleDraft, setTitleDraft] = useState(entity.runCard.title);
  const [textDraft, setTextDraft] = useState(text);
  const [editingText, setEditingText] = useState(text.length === 0);
  const [maxHpDraft, setMaxHpDraft] = useState(combat === null ? "" : String(combat.maxHp));
  const [currentHpDraft, setCurrentHpDraft] = useState(
    displayedCurrentHp === null ? "" : String(displayedCurrentHp),
  );
  const [initiativeDraft, setInitiativeDraft] = useState(
    combat === null ? "" : String(combat.initiativeBonus),
  );
  const [grabbing, setGrabbing] = useState(false);
  const [deletingCard, setDeletingCard] = useState(false);
  const tokenUrl = cardImageUrl(entity, snap.mediaUrls);
  const showsOriginal = original.kind === "pdf" || original.kind === "url";
  const isTextCard = !showsOriginal && !entity.runCard.tags.includes("image");
  const focused = snap.focus?.id === entity.id;
  const drag = useCardEncounterDrag(entity.id, entity.runCard.title);
  const canGrab = cardHasGrabSource(entity, snap.sources);
  const clipboardImageSupported = clipboardReadSupported();
  const encounterCard = isEncounterCard(entity);

  useEffect(() => {
    if (controlled) {
      return;
    }
    if (snap.openedEntityId === entity.id) {
      setExpandedLocal(true);
    }
  }, [snap.openedEntityId, entity.id, controlled]);

  useEffect(() => {
    setTitleDraft(entity.runCard.title);
  }, [entity.runCard.title]);

  useEffect(() => {
    setTextDraft(text);
  }, [text]);

  useEffect(() => {
    setEditingText(text.length === 0);
  }, [entity.id]);

  useEffect(() => {
    if (!hasCombatStats || combatMaxHp === undefined || combatInitiative === undefined) {
      setMaxHpDraft("");
      setCurrentHpDraft("");
      setInitiativeDraft("");
      return;
    }
    setMaxHpDraft(String(combatMaxHp));
    setCurrentHpDraft(displayedCurrentHp === null ? "" : String(displayedCurrentHp));
    setInitiativeDraft(String(combatInitiative));
  }, [hasCombatStats, combatMaxHp, combatCurrentHp, displayedCurrentHp, combatInitiative]);

  const commitCombatStats = (): void => {
    if (combat === null) {
      return;
    }
    const maxHp = parseIntegerField(maxHpDraft);
    const initiativeBonus = parseIntegerField(initiativeDraft);
    const currentHp =
      inspectHp !== null
        ? combat.currentHp
        : combat.currentHp === null
          ? null
          : parseIntegerField(currentHpDraft);
    if (
      maxHp === null ||
      initiativeBonus === null ||
      (inspectHp === null && combat.currentHp !== null && currentHp === null)
    ) {
      setMaxHpDraft(String(combat.maxHp));
      setCurrentHpDraft(displayedCurrentHp === null ? "" : String(displayedCurrentHp));
      setInitiativeDraft(String(combat.initiativeBonus));
      return;
    }
    store.run(store.setEntityCombatStats(entity.id, maxHp, currentHp, initiativeBonus));
  };

  const commitInspectCurrentHp = (): void => {
    if (inspectParticipantId === undefined || inspectHp === null) {
      return;
    }
    const currentHp = parseIntegerField(currentHpDraft);
    if (currentHp === null) {
      setCurrentHpDraft(String(inspectHp.currentHp));
      return;
    }
    store.run(store.setParticipantCurrentHp(inspectParticipantId, currentHp));
  };

  return (
    <article
      className={`card entity-card focus-card${expanded && !encounterCard ? "" : " compact"}${focused ? " is-focus" : ""}`}
    >
      <div className="focus-header">
        {tokenUrl ? (
          <img className="card-token" src={tokenUrl} alt="" />
        ) : null}
        {snap.session && snap.surface !== "table" && !encounterCard ? (
          <button
            type="button"
            className="card-drag-handle"
            aria-label={`Drag ${entity.runCard.title} to encounter`}
            title="Drag to encounter"
            onPointerDown={drag.onPointerDown}
          >
            ⠿
          </button>
        ) : null}
        <button
          type="button"
          className="focus-toggle"
          aria-expanded={encounterCard ? undefined : expanded}
          onPointerDown={(event) => {
            // Mouse/pen: drag from the title like before. Touch keeps scrolling;
            // use the handle there.
            if (!snap.session || snap.surface === "table" || encounterCard || event.pointerType === "touch") {
              return;
            }
            drag.onPointerDown(event);
          }}
          onClick={() => {
            if (drag.consumeClick()) {
              return;
            }
            if (encounterCard) {
              store.run(store.openEncounterCard(entity.id));
              return;
            }
            store.setFocus(entity.id);
            if (onToggleExpand) {
              onToggleExpand();
            } else {
              setExpandedLocal((open) => !open);
            }
          }}
        >
          <div>
            <p className="eyebrow">{cardTypeLabel(entity.runCard.tags)}</p>
            <h1 className="focus-title">{entity.runCard.title}</h1>
          </div>
        </button>
        {encounterCard ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setDeletingCard(true);
            }}
          >
            Delete
          </button>
        ) : null}
        <label className="card-session">
          <span className="visually-hidden">Campaign</span>
          <select
            value={entity.sessionId ?? ""}
            aria-label={`Campaign for ${entity.runCard.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const value = event.target.value;
              store.run(
                store.setEntitySession(
                  entity.id,
                  value.length === 0 ? null : asSessionId(value),
                ),
              );
            }}
          >
            <option value="">&lt;global&gt;</option>
            {entity.sessionId !== null &&
            !snap.sessions.some((session) => session.id === entity.sessionId) ? (
              <option value={entity.sessionId}>Missing campaign</option>
            ) : null}
            {snap.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </label>
        <label className="card-category">
          <span className="visually-hidden">Category</span>
          <select
            value={entity.runCard.category}
            aria-label={`Category for ${entity.runCard.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              store.run(store.setEntityCategory(entity.id, event.target.value));
            }}
          >
            {(snap.campaign?.cardCategories.length ?? 0) === 0 ? (
              <option value="">No categories</option>
            ) : null}
            {entity.runCard.category.length > 0 &&
            !(snap.campaign?.cardCategories.includes(entity.runCard.category) ?? false) ? (
              <option value={entity.runCard.category}>{entity.runCard.category}</option>
            ) : null}
            {snap.campaign?.cardCategories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {expanded && !encounterCard ? (
        <div className="entity-card-body">
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              store.run(store.renameEntity(entity.id, titleDraft));
            }}
          >
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              aria-label="Card title"
            />
            <button type="submit">Rename</button>
            <button type="button" onClick={() => store.run(store.generateTokenArt(entity.id))}>
              Generate image
            </button>
            <button type="button" disabled={!canGrab} onClick={() => setGrabbing(true)}>
              Grab image
            </button>
            {clipboardImageSupported ? (
              <button
                type="button"
                onClick={() =>
                  store.run(readClipboardImage().then((blob) => store.insertEntityImage(entity.id, blob)))
                }
              >
                Insert image
              </button>
            ) : null}
            <label className="file-label">
              Add image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  store.run(store.insertEntityImage(entity.id, file));
                }}
              />
            </label>
            {snap.session ? (
              <button type="button" onClick={() => store.run(store.dropOnEncounter(entity.id))}>
                Add to encounter
              </button>
            ) : null}
            {pictures.length > 0 ? (
              <button type="button" onClick={() => store.openMediaView(entity.id)}>
                Show images
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                store.run(
                  saveBlobAsFile(
                    () => store.exportCardArchive(entity.id),
                    `${safeCardFileStem(entity.runCard.title)}.zip`,
                    {
                      description: "GM Helper card",
                      accept: { "application/zip": [".zip"] },
                    },
                  ).then(() => undefined),
                )
              }
            >
              Export
            </button>
            <button type="button" onClick={() => setDeletingCard(true)}>
              Delete
            </button>
          </form>
          {combat !== null ? (
            <div className="combat-stats">
              <label>
                Max HP
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maxHpDraft}
                  aria-label={`Max HP for ${entity.runCard.title}`}
                  onChange={(event) => {
                    if (isIntegerDraft(event.target.value)) {
                      setMaxHpDraft(event.target.value);
                    }
                  }}
                  onBlur={commitCombatStats}
                />
              </label>
              {displayedCurrentHp !== null ? (
                <label>
                  Current HP
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={currentHpDraft}
                    aria-label={`Current HP for ${entity.runCard.title}`}
                    onChange={(event) => {
                      if (isIntegerDraft(event.target.value)) {
                        setCurrentHpDraft(event.target.value);
                      }
                    }}
                    onBlur={inspectHp !== null ? commitInspectCurrentHp : commitCombatStats}
                  />
                </label>
              ) : null}
              <label>
                Initiative bonus
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={initiativeDraft}
                  aria-label={`Initiative bonus for ${entity.runCard.title}`}
                  onChange={(event) => {
                    if (isIntegerDraft(event.target.value)) {
                      setInitiativeDraft(event.target.value);
                    }
                  }}
                  onBlur={commitCombatStats}
                />
              </label>
            </div>
          ) : null}
          {isTextCard ? (
            <div className="card-text-block">
              <button
                type="button"
                onClick={() => {
                  if (editingText) {
                    store.run(store.setEntityText(entity.id, textDraft));
                    setEditingText(false);
                    return;
                  }
                  setEditingText(true);
                }}
              >
                {editingText ? "Done" : "Edit text"}
              </button>
              {editingText ? (
                <textarea
                  className="card-text-editor"
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  onBlur={() => {
                    store.run(store.setEntityText(entity.id, textDraft));
                  }}
                  aria-label={`Text for ${entity.runCard.title}`}
                  rows={Math.max(4, textDraft.split("\n").length + 1)}
                />
              ) : (
                <MarkdownText markdown={text} />
              )}
            </div>
          ) : null}
          {facts.length > 0 ? (
            <dl className="facts">
              {facts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {tracks.length > 0 ? (
            <ul className="tracks">
              {tracks.map((track) => (
                <li key={track.id}>
                  <span>
                    {track.label} {track.current}
                    {track.max !== null ? ` / ${track.max}` : ""}
                  </span>
                  <span className="plusminus">
                    <button
                      type="button"
                      onClick={() => store.run(store.adjustEntityTrack(entity.id, track.id as TrackId, -1))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => store.run(store.adjustEntityTrack(entity.id, track.id as TrackId, 1))}
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {secrets.map((secret, index) => (
            <button
              key={`${secret.body}-${String(index)}`}
              type="button"
              className={secretOpen ? "secret open" : "secret"}
              onClick={() => setSecretOpen((open) => !open)}
            >
              {secretOpen ? secret.body : "Secret — tap to reveal"}
            </button>
          ))}
          {original.kind === "source" ? (
            <button
              type="button"
              className="provenance"
              onClick={() => store.openSourceView(original.sourceId, original.page, null)}
            >
              {snap.sources.find((source) => source.id === original.sourceId)?.title ?? "Source"}
              {original.page !== null ? ` p.${String(original.page)}` : ""} — {original.excerpt}
            </button>
          ) : null}
          {original.kind === "url" ? <CardUrlFrame href={original.href} /> : null}
          {original.kind === "pdf" ? (
            <CardPdfReader sourceId={original.sourceId} bookmarkPage={original.page} />
          ) : null}
        </div>
      ) : null}
      {grabbing ? <TokenGrabModal entity={entity} onClose={() => setGrabbing(false)} /> : null}
      {deletingCard
        ? createPortal(
            <div
              className="busy-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-card-title"
              onClick={() => setDeletingCard(false)}
            >
              <div className="busy-modal-card" onClick={(event) => event.stopPropagation()}>
                <p className="eyebrow">Card</p>
                <h2 id="delete-card-title">Delete this card?</h2>
                <p>
                  “{entity.runCard.title}” will be removed permanently. This cannot be undone.
                </p>
                <div className="card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      store.run(store.deleteEntity(entity.id).then(() => setDeletingCard(false)));
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setDeletingCard(false)}>
                    Keep
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {drag.ghost
        ? createPortal(
            <div className="card-drag-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }}>
              {drag.ghost.title}
            </div>,
            document.body,
          )
        : null}
    </article>
  );
}

function cardHasGrabSource(entity: Entity, sources: ReadonlyArray<Source>): boolean {
  const original = cardOriginal(entity, sources);
  if (original.kind === "url") {
    return true;
  }
  if (original.kind !== "pdf") {
    return false;
  }
  const pdf = sources.find((source) => source.id === original.sourceId);
  return pdf?.bytes instanceof Blob;
}

function safeCardFileStem(title: string): string {
  const stem = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return stem.length > 0 ? `${stem}-card` : "card";
}
