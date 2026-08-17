import { useHost } from "../host/HostContext";
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
