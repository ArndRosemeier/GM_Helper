import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cardOriginal } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import type { FocusCardProps } from "../host/features/types";
import type { TrackId } from "../host/ids";
import { useCardEncounterDrag } from "./useCardEncounterDrag";
import {
  factsFrom,
  mediaBlocksFrom,
  mediaFrom,
  secretsFrom,
  textFrom,
  tracksFrom,
} from "../host/runCard";
import { CardPdfReader } from "./CardPdfReader";
import { CardUrlFrame } from "./CardUrlFrame";
import { TokenGrabModal } from "./TokenGrabModal";
import { cardImageUrl } from "../lib/defaultToken";

export function EntityCard({ entity, revealSecrets }: FocusCardProps) {
  const { store, snap } = useHost();
  const facts = factsFrom(entity.runCard);
  const tracks = tracksFrom(entity.runCard);
  const secrets = secretsFrom(entity.runCard);
  const text = textFrom(entity.runCard);
  const tokenArt = mediaFrom(entity.runCard, "token");
  const pictures = mediaBlocksFrom(entity.runCard).filter((block) => block.role !== "token");
  const original = cardOriginal(entity, snap.sources);
  const [expanded, setExpanded] = useState(entity.id === snap.openedEntityId);
  const [secretOpen, setSecretOpen] = useState(revealSecrets);
  const [titleDraft, setTitleDraft] = useState(entity.runCard.title);
  const [grabbing, setGrabbing] = useState(false);
  const tokenUrl = cardImageUrl(entity, snap.mediaUrls);
  const showsOriginal = original.kind === "pdf" || original.kind === "url";
  const focused = snap.focus?.id === entity.id;
  const drag = useCardEncounterDrag(entity.id, entity.runCard.title);

  useEffect(() => {
    if (snap.openedEntityId === entity.id) {
      setExpanded(true);
    }
  }, [snap.openedEntityId, entity.id]);

  useEffect(() => {
    setTitleDraft(entity.runCard.title);
  }, [entity.runCard.title]);

  return (
    <article
      className={`card entity-card focus-card${expanded ? "" : " compact"}${focused ? " is-focus" : ""}`}
    >
      <button
        type="button"
        className="focus-toggle"
        aria-expanded={expanded}
        onPointerDown={drag.onPointerDown}
        onClick={() => {
          if (drag.consumeClick()) {
            return;
          }
          store.setFocus(entity.id);
          setExpanded((open) => !open);
        }}
      >
        {tokenUrl ? <img className="card-token" src={tokenUrl} alt="" /> : null}
        <div>
          <p className="eyebrow">
            {entity.runCard.tags.join(" · ") || "entity"} · {entity.lifecycle}
          </p>
          <h1 className="focus-title">{entity.runCard.title}</h1>
        </div>
      </button>
      {expanded ? (
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
          </form>
          {pictures.map((block) => {
            const url = snap.mediaUrls[block.mediaId];
            if (!url) {
              return (
                <p key={block.mediaId} className="muted">
                  Picture is missing
                </p>
              );
            }
            return (
              <button
                key={block.mediaId}
                type="button"
                className="card-picture"
                onClick={() => store.openMediaView(block.mediaId)}
              >
                <img src={url} alt={entity.runCard.title} />
              </button>
            );
          })}
          {text && !showsOriginal && !entity.runCard.tags.includes("image") ? (
            <p className="lede">{text}</p>
          ) : null}
          {facts.length > 0 ? (
            <dl className="facts">
              {facts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`}>
                  <dt>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => store.run(store.pinFact(entity.id, fact.label))}
                    >
                      {fact.label}
                    </button>
                  </dt>
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
              onClick={() => store.openSourceView(original.sourceId, original.page)}
            >
              {snap.sources.find((source) => source.id === original.sourceId)?.title ?? "Source"}
              {original.page !== null ? ` p.${String(original.page)}` : ""} — {original.excerpt}
            </button>
          ) : null}
          <footer className="card-actions">
            {entity.lifecycle === "ephemeral" ? (
              <button type="button" onClick={() => store.run(store.promoteEntity(entity.id))}>
                This one matters
              </button>
            ) : null}
            <button type="button" onClick={() => store.run(store.attachEntityToScene(entity.id))}>
              Pin to scene
            </button>
            <button type="button" onClick={() => store.run(store.addParticipant(entity.id))}>
              Into encounter
            </button>
            <button type="button" onClick={() => store.run(store.generateTokenArt(entity.id))}>
              Token (AI)
            </button>
            <button type="button" onClick={() => setGrabbing(true)}>
              Token (grab)
            </button>
            {tokenArt ? (
              <button type="button" onClick={() => store.openMediaView(tokenArt.mediaId)}>
                View image
              </button>
            ) : null}
            <button type="button" onClick={() => store.run(store.deleteEntity(entity.id))}>
              Delete
            </button>
          </footer>
          {original.kind === "url" ? <CardUrlFrame href={original.href} /> : null}
          {original.kind === "pdf" ? (
            <CardPdfReader sourceId={original.sourceId} bookmarkPage={original.page} />
          ) : null}
        </div>
      ) : null}
      {grabbing ? <TokenGrabModal entity={entity} onClose={() => setGrabbing(false)} /> : null}
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
