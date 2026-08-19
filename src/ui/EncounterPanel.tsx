import { battlemapTitleForMedia, cardTokens, isPlayerCard } from "../host/encounter";
import { useHost } from "../host/HostContext";
import { cardImageUrl } from "../lib/defaultToken";

/** Roster chips: name and remove only. Current HP is edited on the battlefield. */

export function EncounterAmbient() {
  const { store, snap } = useHost();
  const cards = snap.encounter ? cardTokens(snap.encounter) : [];
  const mapId = snap.encounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const mapTitle = battlemapTitleForMedia(snap.entities, mapId) ?? "Map";
  const empty = mapId === null && cards.length === 0;
  const canClear =
    mapId !== null ||
    (snap.encounter?.tokens.length ?? 0) > 0 ||
    snap.encounter?.live === true ||
    cards.some((token) => {
      const owner = snap.entities.find((item) => item.id === token.entityId);
      return owner === undefined || !isPlayerCard(owner);
    });
  return (
    <div className="encounter-define">
      <div
        className="encounter-roster"
        data-encounter-drop="true"
        aria-label="Encounter roster"
      >
        {empty ? (
          <p className="muted encounter-hint">
            Add or drag cards here. Battlemap or image cards set the map.
          </p>
        ) : (
          <ol className="encounter-chips">
            {mapId ? (
              <li className="encounter-chip encounter-map-chip">
                {mapUrl ? <img className="encounter-map-thumb" src={mapUrl} alt="" /> : null}
                <span>{mapTitle}</span>
                <button
                  type="button"
                  className="tiny"
                  aria-label={`Remove ${mapTitle}`}
                  onClick={() => store.run(store.setEncounterMap(null))}
                >
                  ×
                </button>
              </li>
            ) : null}
            {cards.map((token) => {
              const owner = snap.entities.find((item) => item.id === token.entityId);
              const art = owner ? cardImageUrl(owner, snap.mediaUrls) : null;
              return (
                <li key={token.id} className="encounter-chip">
                  {art ? <img className="card-token" src={art} alt="" /> : null}
                  <span>{token.label}</span>
                  <button
                    type="button"
                    className="tiny"
                    aria-label={`Remove ${token.label}`}
                    onClick={() => store.run(store.removeEncounterToken(token.id))}
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
          disabled={cards.length === 0 && mapId === null}
          onClick={() => store.run(store.addEncounterAsCard())}
        >
          Add as card
        </button>
        <button
          type="button"
          disabled={!canClear}
          onClick={() => store.run(store.clearEncounter())}
        >
          Clear
        </button>
        <button
          type="button"
          className="next-turn"
          disabled={cards.length === 0}
          onClick={() => store.run(store.beginEncounter())}
        >
          Show Encounter
        </button>
      </div>
    </div>
  );
}
