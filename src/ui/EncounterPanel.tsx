import { battlemapTitleForMedia, cardTokens, isPlayerCard } from "../host/encounter";
import { useHost } from "../host/HostContext";
import type { BattlegroundToken, Entity } from "../host/types";
import { cardImageUrl } from "../lib/defaultToken";

function isRosterToken(token: BattlegroundToken, entities: ReadonlyArray<Entity>): boolean {
  if (token.entityId === null) {
    return false;
  }
  const owner = entities.find((item) => item.id === token.entityId);
  return owner !== undefined && !isPlayerCard(owner);
}

/** Roster chips: NPCs and maps only. Players join every encounter automatically. */

export function EncounterAmbient() {
  const { store, snap } = useHost();
  const cards = snap.encounter ? cardTokens(snap.encounter) : [];
  const rosterCards = cards.filter((token) => isRosterToken(token, snap.entities));
  const mapId = snap.encounter?.mapMediaId ?? null;
  const mapUrl = mapId ? snap.mediaUrls[mapId] : undefined;
  const mapTitle = battlemapTitleForMedia(snap.entities, mapId) ?? "Map";
  const empty = mapId === null && rosterCards.length === 0;
  const canClear =
    mapId !== null ||
    (snap.encounter?.tokens.length ?? 0) > 0 ||
    snap.encounter?.live === true ||
    rosterCards.length > 0;
  const canShowEncounter = mapId !== null || rosterCards.length > 0;
  return (
    <div className="encounter-define">
      <div
        className="encounter-roster"
        data-encounter-drop="true"
        aria-label="Encounter roster"
      >
        {empty ? (
          <p className="muted encounter-hint">
            Drag NPCs or battlemaps here. Players join automatically.
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
            {rosterCards.map((token) => {
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
          disabled={!canShowEncounter}
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
          disabled={!canShowEncounter}
          onClick={() => store.run(store.beginEncounter())}
        >
          Show Encounter
        </button>
      </div>
    </div>
  );
}
