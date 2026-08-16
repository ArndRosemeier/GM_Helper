import { useHost } from "../host/HostContext";
import { EntityCard } from "./EntityCard";

export function CardStack() {
  const { snap } = useHost();
  if (snap.tableCards.length === 0) {
    return (
      <article className="card empty-card">
        <h1>Nothing on the table</h1>
        <p>Search, bookmark a page, add a URL, or make someone here.</p>
      </article>
    );
  }
  return (
    <div className="card-stack">
      {snap.tableCards.map((entity) => (
        <EntityCard key={entity.id} entity={entity} revealSecrets={false} />
      ))}
    </div>
  );
}
