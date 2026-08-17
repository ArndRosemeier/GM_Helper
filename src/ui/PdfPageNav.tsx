import { useEffect, useRef, useState } from "react";

export function PdfPageNav({
  page,
  pageCount,
  onChange,
  onCommit,
}: {
  page: number;
  pageCount: number;
  /** Updates the page view. Called continuously while the slider moves. */
  onChange: (page: number) => void;
  /** Persists the page (e.g. store memory). Defaults to onChange. */
  onCommit?: (page: number) => void;
}) {
  const [draft, setDraft] = useState(page);
  const dragging = useRef(false);
  const commit = onCommit ?? onChange;

  useEffect(() => {
    if (!dragging.current) {
      setDraft(page);
    }
  }, [page]);

  const jump = (next: number): void => {
    dragging.current = false;
    setDraft(next);
    onChange(next);
    commit(next);
  };

  return (
    <div className="pdf-page-nav">
      <button type="button" disabled={draft <= 1} onClick={() => jump(draft - 1)} aria-label="Previous page">
        Prev
      </button>
      <label className="pdf-page-slider">
        <span className="muted pdf-page-count">
          {String(draft)} / {String(pageCount)}
        </span>
        <input
          type="range"
          min={1}
          max={pageCount}
          step={1}
          value={draft}
          aria-label="Page"
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => {
            dragging.current = false;
            commit(draft);
          }}
          onPointerCancel={() => {
            dragging.current = false;
            commit(draft);
          }}
          onInput={(event) => {
            const next = Number(event.currentTarget.value);
            setDraft(next);
            onChange(next);
          }}
        />
      </label>
      <button
        type="button"
        disabled={draft >= pageCount}
        onClick={() => jump(draft + 1)}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}
