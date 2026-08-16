import { useHost } from "../host/HostContext";
import { factsFrom } from "../host/runCard";

export function PinnedFacts() {
  const { store, snap } = useHost();
  const pins = snap.campaign?.pinnedFacts ?? [];

  return (
    <section className="pinned">
      <h3>Pinned</h3>
      {pins.length === 0 ? <p className="muted">Tap a fact label on a card to pin it.</p> : null}
      <ul>
        {pins.map((pin) => {
          const entity = snap.entities.find((item) => item.id === pin.entityId);
          const fact = entity ? factsFrom(entity.runCard).find((item) => item.label === pin.label) : undefined;
          return (
            <li key={pin.id}>
              <button type="button" className="pin" onClick={() => store.openCard(pin.entityId)}>
                <span className="pin-label">{pin.label}</span>
                <strong>{fact?.value ?? "—"}</strong>
                <em>{entity?.runCard.title ?? "missing"}</em>
              </button>
              <button type="button" className="tiny" onClick={() => store.run(store.unpinFact(pin.id))}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
