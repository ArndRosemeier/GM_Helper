import { useState } from "react";
import { useHost } from "../host/HostContext";
import type { ParticipantId, TrackId } from "../host/ids";
import { cardImageUrl } from "../lib/defaultToken";

export function EncounterAmbient() {
  const { store, snap } = useHost();
  const participants = snap.encounter?.participants ?? [];
  const mapId = snap.encounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  return (
    <div className="encounter-define">
      <div
        className="encounter-roster"
        data-encounter-drop="true"
        aria-label="Encounter roster"
      >
        {mapId ? (
          <div className="encounter-chip encounter-map-chip">
            {mapUrl ? <img className="encounter-map-thumb" src={mapUrl} alt="" /> : null}
            <span>Map</span>
            <button
              type="button"
              className="tiny"
              aria-label="Remove encounter map"
              onClick={() => store.run(store.setEncounterMap(null))}
            >
              ×
            </button>
          </div>
        ) : null}
        {participants.length === 0 ? (
          <p className="muted encounter-hint">
            {mapId === null
              ? "Drag cards here. Battlemap or image cards set the map."
              : "Drag cards here. The same card can go in more than once."}
          </p>
        ) : (
          <ol className="encounter-chips">
            {participants.map((participant) => {
              const owner = snap.entities.find((item) => item.id === participant.entityId);
              const art = owner ? cardImageUrl(owner, snap.mediaUrls) : null;
              return (
              <li key={participant.id} className="encounter-chip">
                {art ? <img className="card-token" src={art} alt="" /> : null}
                <span>{participant.label}</span>
                <button
                  type="button"
                  className="tiny"
                  aria-label={`Remove ${participant.label}`}
                  onClick={() => store.run(store.removeParticipant(participant.id))}
                >
                  ×
                </button>
              </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="encounter-define-actions">
        <button
          type="button"
          disabled={participants.length === 0}
          onClick={() => store.run(store.endEncounter())}
        >
          Clear
        </button>
        <button
          type="button"
          className="next-turn"
          disabled={participants.length === 0}
          onClick={() => store.run(store.beginEncounter())}
        >
          Show Encounter
        </button>
      </div>
    </div>
  );
}

export function EncounterDetail() {
  const { store, snap } = useHost();
  const [condition, setCondition] = useState("");
  const [trackLabel, setTrackLabel] = useState("Hide");
  const encounter = snap.encounter;
  if (!encounter) {
    return null;
  }

  return (
    <section className="encounter-detail">
      <header className="row">
        <h3>Encounter</h3>
        <span className="encounter-detail-actions">
          <button
            type="button"
            className="encounter-icon-btn"
            aria-label="Reset encounter board"
            title="Reset board"
            onClick={() => store.run(store.resetEncounterBoard())}
          >
            ↻
          </button>
          <button
            type="button"
            className="encounter-icon-btn"
            aria-label="End encounter"
            title="End"
            onClick={() => store.run(store.endEncounter())}
          >
            ×
          </button>
        </span>
      </header>
      <ul className="participants">
        {encounter.participants.map((participant, index) => (
          <li key={participant.id} className={index === encounter.activeIndex ? "active" : ""}>
            <div className="row">
              <strong>{participant.label}</strong>
              <button type="button" onClick={() => store.run(store.removeParticipant(participant.id))}>
                Remove
              </button>
            </div>
            <ul className="tracks">
              {participant.tracks.map((track) => (
                <li key={track.id}>
                  <span>
                    {track.label} {track.current}
                    {track.max !== null ? ` / ${track.max}` : ""}
                  </span>
                  <span className="plusminus">
                    <button
                      type="button"
                      onClick={() =>
                        store.run(store.adjustParticipantTrack(participant.id, track.id as TrackId, -1))
                      }
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        store.run(store.adjustParticipantTrack(participant.id, track.id as TrackId, 1))
                      }
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="chips">
              {participant.conditions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="chip"
                  onClick={() => store.run(store.removeCondition(participant.id, tag))}
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                store.run(store.addCondition(participant.id as ParticipantId, condition));
                setCondition("");
              }}
            >
              <input
                value={condition}
                onChange={(event) => setCondition(event.target.value)}
                placeholder="Condition"
              />
              <button type="submit">Tag</button>
            </form>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const label = trackLabel.trim();
                if (label.length === 0) {
                  store.setError("Track label is empty");
                  return;
                }
                store.run(store.addParticipantTrack(participant.id, label, 10));
              }}
            >
              <input
                value={trackLabel}
                onChange={(event) => setTrackLabel(event.target.value)}
                placeholder="Track label"
              />
              <button type="submit">Track</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
