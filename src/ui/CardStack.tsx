import { cardVisibleForSession } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { EntityCard } from "./EntityCard";

export function CardStack() {
  const { snap } = useHost();
  const categories = snap.campaign?.cardCategories ?? [];
  const inCampaign = snap.tableCards.filter((entity) =>
    cardVisibleForSession(entity, snap.session?.id ?? null),
  );
  const visible =
    categories.length === 0
      ? inCampaign
      : snap.categoryFilters.length === 0
        ? []
        : snap.categoryFilters.length === categories.length &&
            categories.every((name) => snap.categoryFilters.includes(name))
          ? inCampaign
          : inCampaign.filter((entity) => snap.categoryFilters.includes(entity.runCard.category));

  const emptyTitle =
    snap.tableCards.length === 0
      ? "Nothing on the table"
      : inCampaign.length === 0
        ? "No cards for this campaign"
        : "No cards in these categories";
  const emptyHint =
    snap.tableCards.length === 0
      ? "Search, bookmark a page, add a URL, or make someone here."
      : inCampaign.length === 0
        ? "Global cards always show here. Campaign cards appear when that campaign is selected."
        : "Select categories above, or press All.";

  return (
    <div className="card-stack-wrap">
      <CategoryFilterBar />
      {visible.length === 0 ? (
        <article className="card empty-card">
          <h1>{emptyTitle}</h1>
          <p>{emptyHint}</p>
        </article>
      ) : (
        <div className="card-stack">
          {visible.map((entity) => (
            <EntityCard key={entity.id} entity={entity} revealSecrets={false} />
          ))}
        </div>
      )}
    </div>
  );
}
