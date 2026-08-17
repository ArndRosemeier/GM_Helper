import { useEffect, useMemo, useState } from "react";
import { cardVisibleForSession } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import type { EntityId } from "../host/ids";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { EntityCard } from "./EntityCard";

export function CardStack() {
  const { snap } = useHost();
  const [sortByName, setSortByName] = useState(false);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<EntityId>>(
    () => new Set(snap.openedEntityId === null ? [] : [snap.openedEntityId]),
  );
  const categories = snap.campaign?.cardCategories ?? [];
  const sessionId = snap.session?.id ?? null;
  const categoryFilters = snap.categoryFilters;

  const visible = useMemo(() => {
    const inCampaign = snap.tableCards.filter((entity) =>
      cardVisibleForSession(entity, sessionId),
    );
    const filtered =
      categories.length === 0
        ? inCampaign
        : categoryFilters.length === 0
          ? []
          : categoryFilters.length === categories.length &&
              categories.every((name) => categoryFilters.includes(name))
            ? inCampaign
            : inCampaign.filter((entity) => categoryFilters.includes(entity.runCard.category));
    if (!sortByName) {
      return filtered;
    }
    return [...filtered].sort((a, b) =>
      a.runCard.title.localeCompare(b.runCard.title, undefined, { sensitivity: "base" }),
    );
  }, [snap.tableCards, sessionId, categories, categoryFilters, sortByName]);

  useEffect(() => {
    if (snap.openedEntityId === null) {
      return;
    }
    const opened = snap.openedEntityId;
    setExpandedIds((prev) => {
      if (prev.has(opened)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(opened);
      return next;
    });
  }, [snap.openedEntityId]);

  const toggleExpanded = (id: EntityId): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const inCampaignCount = useMemo(
    () => snap.tableCards.filter((entity) => cardVisibleForSession(entity, sessionId)).length,
    [snap.tableCards, sessionId],
  );

  const emptyTitle =
    snap.tableCards.length === 0
      ? "Nothing on the table"
      : inCampaignCount === 0
        ? "No cards for this campaign"
        : "No cards in these categories";
  const emptyHint =
    snap.tableCards.length === 0
      ? "Search, bookmark a page, add a URL, or make someone here."
      : inCampaignCount === 0
        ? "Global cards always show here. Campaign cards appear when that campaign is selected."
        : "Select categories above, or press All.";

  return (
    <div className="card-stack-wrap">
      <div className="card-stack-toolbar">
        <CategoryFilterBar />
        <label className="card-sort-by-name check">
          <input
            type="checkbox"
            checked={sortByName}
            onChange={(event) => setSortByName(event.target.checked)}
          />
          Sort by name
        </label>
      </div>
      {visible.length === 0 ? (
        <article className="card empty-card">
          <h1>{emptyTitle}</h1>
          <p>{emptyHint}</p>
        </article>
      ) : (
        <div className="card-stack">
          {visible.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              revealSecrets={false}
              expanded={expandedIds.has(entity.id)}
              onToggleExpand={() => toggleExpanded(entity.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
