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

const WANTS = [
  "To be left out of tonight's story",
  "A name spoken in the right room",
  "The next cart out before dawn",
  "Someone to believe a small lie",
  "To find what was taken from the stall",
  "To keep a door closed until morning",
] as const;

const SECRETS = [
  "Carries a key that is not theirs",
  "Owes the night watch a favor they cannot pay",
  "Saw the missing wagon and will not say",
  "Is not from this city, and the accent is a choice",
  "Keeps a second name in a folded paper",
] as const;

const LINES = [
  "You look like you can afford to be lost.",
  "If you are asking me, you are already late.",
  "I sell what I have. I do not sell what I saw.",
  "Keep walking. The rain is kinder than this street.",
  "Say what you want, then let me decide if I heard it.",
] as const;

function pick<T>(items: ReadonlyArray<T>): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("Name table was empty");
  }
  return item;
}

export function localNpcCard(): RunCard {
  const title = `${pick(FIRST)} ${pick(LAST)}`;
  return {
    title,
    tags: ["npc"],
    category: "",
    blocks: [
      { kind: "text", body: pick(LOOKS) },
      {
        kind: "facts",
        items: [
          { label: "Want", value: pick(WANTS) },
          { label: "First line", value: pick(LINES) },
        ],
      },
      { kind: "secret", body: pick(SECRETS) },
    ],
  };
}

export function localNpcName(): string {
  return `${pick(FIRST)} ${pick(LAST)}`;
}
