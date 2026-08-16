import { useState } from "react";
import { useHost } from "../host/HostContext";
import type { ParticipantId, TrackId } from "../host/ids";

export function EncounterAmbient() {
  const { store, snap } = useHost();
  const participants = snap.encounter?.participants ?? [];
  return (
    <div className="encounter-define">
      <div
        className="encounter-roster"
        data-encounter-drop="true"
        aria-label="Encounter roster"
      >
        {participants.length === 0 ? (
          <p className="muted encounter-hint">Drag cards here. The same card can go in more than once.</p>
        ) : (
          <ol className="encounter-chips">
            {participants.map((participant) => (
              <li key={participant.id} className="encounter-chip">
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
            ))}
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
          Start encounter
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
        <button type="button" onClick={() => store.run(store.endEncounter())}>
          End
        </button>
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
