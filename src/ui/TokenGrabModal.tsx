import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { cardOriginal } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import type { Entity } from "../host/types";
import { factsFrom, mediaBlocksFrom, textFrom, tracksFrom } from "../host/runCard";
import { cropImageToPng, rasterizeCardPoster } from "../lib/cardPoster";

type Point = { x: number; y: number };
type Crop = { x: number; y: number; size: number };

export function TokenGrabModal({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { store, snap } = useHost();
  const imageRef = useRef<HTMLImageElement>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ start: Point; current: Point } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    const pictures = mediaBlocksFrom(entity.runCard).filter((block) => block.role !== "token");
    const original = cardOriginal(entity, snap.sources);
    const pdf =
      original.kind === "pdf" ? snap.sources.find((source) => source.id === original.sourceId) : undefined;
    store.run(
      (async () => {
        const blob = await rasterizeCardPoster({
          title: entity.runCard.title,
          tags: entity.runCard.tags,
          text: textFrom(entity.runCard),
          facts: factsFrom(entity.runCard),
          tracks: tracksFrom(entity.runCard),
          imageUrls: pictures.map((block) => {
            const url = snap.mediaUrls[block.mediaId];
            if (!url) {
              throw new Error(`Card picture ${block.mediaId} is not loaded`);
            }
            return url;
          }),
          pdfBytes: pdf?.bytes ?? null,
          pdfPage: original.kind === "pdf" ? original.page : null,
        });
        if (cancelled) {
          return;
        }
        revoked = URL.createObjectURL(blob);
        setPosterUrl(revoked);
      })(),
    );
    return () => {
      cancelled = true;
      if (revoked) {
        URL.revokeObjectURL(revoked);
      }
    };
  }, [entity, snap.mediaUrls, snap.sources, store]);

  const onPointerDown = (event: ReactPointerEvent<HTMLImageElement>): void => {
    const image = imageRef.current;
    if (!image) {
      store.setError("Token grab image is not on screen");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = imagePoint(event, image);
    setDrag({ start: point, current: point });
    setCrop(squareCrop(point, point, image.naturalWidth, image.naturalHeight));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !drag) {
      return;
    }
    const image = imageRef.current;
    if (!image) {
      return;
    }
    const current = imagePoint(event, image);
    setDrag({ ...drag, current });
    setCrop(squareCrop(drag.start, current, image.naturalWidth, image.naturalHeight));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  };

  const confirm = (): void => {
    const image = imageRef.current;
    if (!image || !crop) {
      store.setError("Select the area that should become the token");
      return;
    }
    store.run(
      cropImageToPng(image, crop).then((blob) => store.saveTokenArt(entity.id, blob).then(onClose)),
    );
  };

  const selection = crop && posterUrl && imageRef.current ? displayCrop(crop, imageRef.current) : null;

  return createPortal(
    <div className="token-grab" role="dialog" aria-modal="true" aria-labelledby="token-grab-title">
      <header className="token-grab-bar">
        <div>
          <p className="eyebrow">Token grab</p>
          <h2 id="token-grab-title">{entity.runCard.title}</h2>
        </div>
        <div className="card-actions">
          <button type="button" onClick={confirm} disabled={crop === null}>
            Use selection
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </header>
      <div className="token-grab-stage">
        {posterUrl ? (
          <div className="token-grab-frame">
            <img
              ref={imageRef}
              src={posterUrl}
              alt={entity.runCard.title}
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {selection ? (
              <div
                className="token-grab-select"
                style={{
                  left: selection.left,
                  top: selection.top,
                  width: selection.size,
                  height: selection.size,
                }}
              />
            ) : null}
          </div>
        ) : (
          <p className="muted">Drawing the card…</p>
        )}
      </div>
      <p className="muted token-grab-hint">Drag a square on the card. That crop is stored as the token.</p>
    </div>,
    document.body,
  );
}

function imagePoint(event: ReactPointerEvent<HTMLImageElement>, image: HTMLImageElement): Point {
  const rect = image.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error("Token grab image has no layout size");
  }
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * image.naturalWidth, 0, image.naturalWidth),
    y: clamp(((event.clientY - rect.top) / rect.height) * image.naturalHeight, 0, image.naturalHeight),
  };
}

function squareCrop(start: Point, current: Point, width: number, height: number): Crop {
  const raw = Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y), 16);
  const size = Math.min(raw, width, height);
  let x = current.x < start.x ? start.x - size : start.x;
  let y = current.y < start.y ? start.y - size : start.y;
  x = clamp(x, 0, width - size);
  y = clamp(y, 0, height - size);
  return { x, y, size };
}

function displayCrop(
  crop: Crop,
  image: HTMLImageElement,
): { left: number; top: number; size: number } {
  const rect = image.getBoundingClientRect();
  const parent = image.parentElement?.getBoundingClientRect();
  if (!parent || image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error("Token grab image is not laid out");
  }
  const scaleX = rect.width / image.naturalWidth;
  const scaleY = rect.height / image.naturalHeight;
  return {
    left: rect.left - parent.left + crop.x * scaleX,
    top: rect.top - parent.top + crop.y * scaleY,
    size: crop.size * scaleX,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
