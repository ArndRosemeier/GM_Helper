import { useHost } from "../host/HostContext";

export function CategoryFilterBar() {
  const { store, snap } = useHost();
  const categories = snap.campaign?.cardCategories ?? [];
  const allSelected =
    categories.length > 0 && categories.every((name) => snap.categoryFilters.includes(name));

  const createCategory = (): void => {
    const name = window.prompt("New category name");
    if (name === null) {
      return;
    }
    store.run(store.createCardCategory(name));
  };

  return (
    <div className="category-filter-bar" role="toolbar" aria-label="Card categories">
      <button
        type="button"
        className={allSelected ? "is-selected" : undefined}
        aria-pressed={allSelected}
        onClick={() => store.toggleAllCategoryFilters()}
      >
        All
      </button>
      {categories.map((name) => {
        const selected = snap.categoryFilters.includes(name);
        return (
          <button
            key={name}
            type="button"
            className={selected ? "is-selected" : undefined}
            aria-pressed={selected}
            onClick={() => store.toggleCategoryFilter(name)}
          >
            {name}
          </button>
        );
      })}
      <button type="button" className="category-add" aria-label="Add category" onClick={createCategory}>
        +
      </button>
    </div>
  );
}
