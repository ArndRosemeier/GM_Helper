import type { RunCard } from "../host/types";

const FIRST = [
  "Asha", "Bram", "Cira", "Dole", "Elka", "Fen", "Goss", "Hale", "Ivo", "Jessa",
  "Kell", "Lira", "Moss", "Nen", "Orla", "Pell", "Quen", "Rook", "Sera", "Tamsin",
  "Ulf", "Vesa", "Wren", "Yara",
] as const;

const LAST = [
  "Ash", "Bell", "Croft", "Dunn", "Fell", "Greaves", "Holt", "Ives", "Kade",
  "Lamb", "Mire", "Nash", "Pike", "Reed", "Shaw", "Thorn", "Vale", "Wick",
] as const;

const LOOKS = [
  "Ink on the thumb, rain in the hair",
  "A split lip that is trying to heal",
  "Too-fine coat for this street",
  "Smells of yeast and woodsmoke",
  "One glove, always the left",
  "A laugh that never reaches the eyes",
] as const;

function pick<T>(items: ReadonlyArray<T>): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("Name table was empty");
  }
  return item;
}

export function localNpcCard(): RunCard {
  return {
    title: `${pick(FIRST)} ${pick(LAST)}`,
    tags: [],
    category: "",
    blocks: [{ kind: "text", body: pick(LOOKS) }],
  };
}

export function localNpcName(): string {
  return `${pick(FIRST)} ${pick(LAST)}`;
}
