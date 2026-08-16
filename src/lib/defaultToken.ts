import { mediaBlocksFrom, mediaFrom } from "../host/runCard";
import type { Entity } from "../host/types";

export function defaultTokenDataUrl(label: string, seed: string): string {
  const initials = initialsFrom(label);
  const fill = colorFromSeed(seed);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<circle cx="64" cy="64" r="64" fill="${fill}"/>
<text x="64" y="78" text-anchor="middle" fill="#f3ead8" font-size="42" font-family="Palatino, Times New Roman, serif">${escapeXml(initials)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function tokenArtUrl(entity: Entity, mediaUrls: Readonly<Record<string, string>>): string {
  return cardImageUrl(entity, mediaUrls) ?? defaultTokenDataUrl(entity.runCard.title, entity.id);
}

export function cardImageUrl(
  entity: Entity,
  mediaUrls: Readonly<Record<string, string>>,
): string | null {
  const token = mediaFrom(entity.runCard, "token");
  const portrait = mediaFrom(entity.runCard, "portrait");
  const extra = mediaBlocksFrom(entity.runCard).find(
    (block) => block.role !== "token" && block.role !== "portrait",
  );
  const block = token ?? portrait ?? extra ?? null;
  if (!block) {
    return null;
  }
  const url = mediaUrls[block.mediaId];
  if (!url) {
    throw new Error(`Image for “${entity.runCard.title}” is in the card but not loaded`);
  }
  return url;
}

function initialsFrom(label: string): string {
  const parts = label.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    const word = parts[0];
    if (!word) {
      return "?";
    }
    return word.slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0];
  const last = parts[parts.length - 1]?.[0];
  if (!first || !last) {
    return "?";
  }
  return `${first}${last}`.toUpperCase();
}

function colorFromSeed(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${String(hue)} 42% 28%)`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
