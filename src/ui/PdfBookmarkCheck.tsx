import { useHost } from "../host/HostContext";
import type { SourceId } from "../host/ids";
import { pdfBookmarkForPage } from "../host/runCard";

export function PdfBookmarkCheck({ sourceId, page }: { sourceId: SourceId; page: number }) {
  const { store, snap } = useHost();
  const bookmarked = pdfBookmarkForPage(snap.entities, sourceId, page) !== null;

  return (
    <label className="check">
      <input
        type="checkbox"
        checked={bookmarked}
        disabled={bookmarked}
        onChange={() => {
          if (bookmarked) {
            return;
          }
          store.run(store.bookmarkPdfPage(sourceId, page));
        }}
      />
      Bookmark p.{String(page)}
    </label>
  );
}
