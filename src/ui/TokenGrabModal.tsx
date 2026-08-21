import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cardOriginal } from "../host/cardModel";
import { useHost } from "../host/HostContext";
import type { Entity } from "../host/types";
import { factsFrom, textFrom, tracksFrom } from "../host/runCard";
import {
  canCaptureDisplayTab,
  captureViewportRegionPng,
  imageElementToPngBlob,
  tryLoadImageUrl,
} from "../lib/captureTab";
import { cropImageToPng, rasterizeCardPoster } from "../lib/cardPoster";
import { Modal } from "./Modal";

type Point = { x: number; y: number };
type Crop = { x: number; y: number; width: number; height: number };

type GrabSurface =
  | { kind: "image"; url: string }
  | { kind: "iframe"; href: string };

export function TokenGrabModal({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { store, snap } = useHost();
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<GrabSurface | null>(null);
  const dragRef = useRef<{ start: Point; current: Point } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [pageCaptureBlocked, setPageCaptureBlocked] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    const original = cardOriginal(entity, snap.sources);
    store.run(
      (async () => {
        if (original.kind === "url") {
          const loaded = await tryLoadImageUrl(original.href);
          if (cancelled) {
            return;
          }
          if (loaded) {
            try {
              const blob = await imageElementToPngBlob(loaded);
              if (cancelled) {
                return;
              }
              revoked = URL.createObjectURL(blob);
              setSurface({ kind: "image", url: revoked });
              return;
            } catch {
              // Fall through to the live page frame.
            }
          }
          if (!(await canCaptureDisplayTab())) {
            if (!cancelled) {
              setPageCaptureBlocked(true);
            }
            return;
          }
          setSurface({ kind: "iframe", href: original.href });
          return;
        }

        const pdf =
          original.kind === "pdf"
            ? snap.sources.find((source) => source.id === original.sourceId)
            : undefined;
        const blob = await rasterizeCardPoster({
          title: entity.runCard.title,
          tags: entity.runCard.tags,
          text: textFrom(entity.runCard),
          facts: factsFrom(entity.runCard),
          tracks: tracksFrom(entity.runCard),
          imageUrls: [],
          pdfBytes: pdf?.bytes ?? null,
          pdfPage: original.kind === "pdf" ? original.page : null,
        });
        if (cancelled) {
          return;
        }
        revoked = URL.createObjectURL(blob);
        setSurface({ kind: "image", url: revoked });
      })(),
    );
    return () => {
      cancelled = true;
      if (revoked) {
        URL.revokeObjectURL(revoked);
      }
    };
  }, [entity, snap.sources, store]);

  const readPoint = (event: ReactPointerEvent<HTMLElement>): Point => {
    if (surface?.kind === "image") {
      const image = imageRef.current;
      if (!image) {
        throw new Error("Token grab image is not on screen");
      }
      return imagePoint(event, image);
    }
    const frame = frameRef.current;
    if (!frame) {
      throw new Error("Token grab page is not on screen");
    }
    return elementPoint(event, frame);
  };

  const surfaceSize = (): { width: number; height: number } => {
    if (surface?.kind === "image") {
      const image = imageRef.current;
      if (!image) {
        throw new Error("Token grab image is not on screen");
      }
      return { width: image.naturalWidth, height: image.naturalHeight };
    }
    const frame = frameRef.current;
    if (!frame) {
      throw new Error("Token grab page is not on screen");
    }
    const rect = frame.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = readPoint(event);
    const size = surfaceSize();
    dragRef.current = { start: point, current: point };
    setCrop(rectCrop(point, point, size.width, size.height));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || drag === null) {
      return;
    }
    const current = readPoint(event);
    const size = surfaceSize();
    dragRef.current = { start: drag.start, current };
    setCrop(rectCrop(drag.start, current, size.width, size.height));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const confirm = (): void => {
    if (!crop || !surface) {
      store.setError("Select the area that should become the image");
      return;
    }
    if (surface.kind === "image") {
      const image = imageRef.current;
      if (!image) {
        store.setError("Token grab image is not on screen");
        return;
      }
      store.run(
        cropImageToPng(image, crop).then((blob) => store.saveTokenArt(entity.id, blob).then(onClose)),
      );
      return;
    }
    const frame = frameRef.current;
    if (!frame) {
      store.setError("Token grab page is not on screen");
      return;
    }
    const rect = frame.getBoundingClientRect();
    const region = {
      left: rect.left + crop.x,
      top: rect.top + crop.y,
      width: crop.width,
      height: crop.height,
    };
    store.run(
      captureViewportRegionPng(region).then((blob) =>
        store.saveTokenArt(entity.id, blob).then(onClose),
      ),
    );
  };

  const selection =
    crop && surface
      ? surface.kind === "image" && imageRef.current
        ? displayCropOnImage(crop, imageRef.current)
        : surface.kind === "iframe" && frameRef.current
          ? displayCropOnElement(crop, frameRef.current)
          : null
      : null;

  return (
    <Modal
      titleId="token-grab-title"
      onClose={onClose}
      closeOnBackdrop={false}
      className="token-grab-modal"
      cardClassName="token-grab"
    >
      <header className="token-grab-bar">
        <div>
          <p className="eyebrow">Grab image</p>
          <h2 id="token-grab-title">{entity.runCard.title}</h2>
        </div>
        <div className="card-actions">
          <button type="button" onClick={confirm} disabled={crop === null || pageCaptureBlocked}>
            Use selection
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </header>
      <div className="token-grab-stage">
        {pageCaptureBlocked ? (
          <p className="muted">
            This browser cannot capture a live web page for Grab image. Use Add image on the card, or open
            the page and save a screenshot.
          </p>
        ) : surface ? (
          <div className="token-grab-frame" ref={stageRef}>
            {surface.kind === "image" ? (
              <img
                ref={imageRef}
                src={surface.url}
                alt={entity.runCard.title}
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : (
              <iframe
                ref={frameRef}
                className="token-grab-frame-page"
                title={entity.runCard.title}
                src={surface.href}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            )}
            {surface.kind === "iframe" ? (
              <div
                className="token-grab-hit"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : null}
            {selection ? (
              <div
                className="token-grab-select"
                style={{
                  left: selection.left,
                  top: selection.top,
                  width: selection.width,
                  height: selection.height,
                }}
              />
            ) : null}
          </div>
        ) : (
          <p className="muted">Drawing the card…</p>
        )}
      </div>
      <p className="muted token-grab-hint">
        {pageCaptureBlocked
          ? null
          : surface?.kind === "iframe"
            ? "Drag a rectangle on the page. Chrome may ask to share this tab when you use the selection."
            : "Drag a rectangle on the card. That crop is stored as the image."}
      </p>
    </Modal>
  );
}

function imagePoint(event: ReactPointerEvent<HTMLElement>, image: HTMLImageElement): Point {
  const rect = image.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error("Token grab image has no layout size");
  }
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * image.naturalWidth, 0, image.naturalWidth),
    y: clamp(((event.clientY - rect.top) / rect.height) * image.naturalHeight, 0, image.naturalHeight),
  };
}

function elementPoint(event: ReactPointerEvent<HTMLElement>, element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error("Token grab page has no layout size");
  }
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function rectCrop(start: Point, current: Point, width: number, height: number): Crop {
  const left = clamp(Math.min(start.x, current.x), 0, width);
  const top = clamp(Math.min(start.y, current.y), 0, height);
  const right = clamp(Math.max(start.x, current.x), 0, width);
  const bottom = clamp(Math.max(start.y, current.y), 0, height);
  return {
    x: left,
    y: top,
    width: Math.max(16, right - left),
    height: Math.max(16, bottom - top),
  };
}

function displayCropOnImage(
  crop: Crop,
  image: HTMLImageElement,
): { left: number; top: number; width: number; height: number } {
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
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

function displayCropOnElement(
  crop: Crop,
  element: HTMLElement,
): { left: number; top: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const parent = element.parentElement?.getBoundingClientRect();
  if (!parent) {
    throw new Error("Token grab page is not laid out");
  }
  return {
    left: rect.left - parent.left + crop.x,
    top: rect.top - parent.top + crop.y,
    width: crop.width,
    height: crop.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
