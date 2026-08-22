import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DiceBoxRollDie } from "@3d-dice/dice-box";
import { Modal } from "./Modal";

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

const STANDARD_DICE: readonly DieSides[] = [4, 6, 8, 10, 12, 20, 100];
const MODIFIER_STEPS = [1, 2, 5, 10, 20] as const;
const LOG_LIMIT = 3;
const DICE_BOX_CONTAINER_ID = "encounter-dice-box";

type TrayDie = {
  id: string;
  sides: DieSides;
};

type TrayState = {
  dice: TrayDie[];
  modifier: number;
};

type ActiveRoll = {
  total: number;
  summary: string;
  settled: boolean;
  hasDice: boolean;
};

type LogEntry = {
  id: string;
  total: number;
  summary: string;
};

export type CombatRollPurpose = {
  kind: "damage" | "heal";
  subject: string;
  onResult: (total: number) => void;
};

export function useEncounterDice(): {
  hud: ReactNode;
  stage: ReactNode;
  overlays: ReactNode;
  openCombatRoll: (purpose: CombatRollPurpose) => void;
} {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tray, setTray] = useState<TrayState>({ dice: [], modifier: 0 });
  const [roll, setRoll] = useState<ActiveRoll | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [boxReady, setBoxReady] = useState(false);
  const [boxError, setBoxError] = useState<string | null>(null);
  const [rollPurpose, setRollPurpose] = useState<CombatRollPurpose | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rollPurposeRef = useRef<CombatRollPurpose | null>(null);

  useEffect(() => {
    const container = stageRef.current;
    if (!container) {
      setBoxError("Encounter dice container is not mounted");
      return;
    }

    let cancelled = false;
    let instance: DiceBox | null = null;
    const canvasId = `encounter-dice-canvas-${crypto.randomUUID()}`;

    const tearDown = (): void => {
      instance?.clear();
      instance = null;
      boxRef.current = null;
      for (const canvas of [...container.querySelectorAll("canvas")]) {
        canvas.remove();
      }
    };

    const boot = async (): Promise<void> => {
      const { default: DiceBoxCtor } = await import("@3d-dice/dice-box");
      if (cancelled) {
        return;
      }
      instance = new DiceBoxCtor({
        id: canvasId,
        container: `#${DICE_BOX_CONTAINER_ID}`,
        assetPath: `${import.meta.env.BASE_URL}assets/dice-box/`,
        origin: window.location.origin,
        theme: "default",
        themeColor: "#d4a45a",
        scale: 8,
        enableShadows: true,
        shadowTransparency: 0.65,
        lightIntensity: 1.05,
        // Offscreen workers often never finish init under Vite.
        offscreen: false,
        delay: 12,
      });
      await Promise.race([
        instance.init(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error("3D dice engine timed out"));
          }, 20000);
        }),
      ]);
      if (cancelled) {
        tearDown();
        return;
      }
      boxRef.current = instance;
      setBoxReady(true);
    };

    void boot().catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      tearDown();
      const message = error instanceof Error ? error.message : "Dice box failed to start";
      setBoxError(message);
    });

    return () => {
      cancelled = true;
      setBoxReady(false);
      tearDown();
    };
  }, []);

  const clearRollPurpose = (): void => {
    rollPurposeRef.current = null;
    setRollPurpose(null);
  };

  const openPicker = (): void => {
    if (roll !== null) {
      return;
    }
    clearRollPurpose();
    setTray({ dice: [], modifier: 0 });
    setPickerOpen(true);
  };

  const openCombatRoll = (purpose: CombatRollPurpose): void => {
    if (roll !== null) {
      return;
    }
    rollPurposeRef.current = purpose;
    setRollPurpose(purpose);
    setTray({ dice: [], modifier: 0 });
    setPickerOpen(true);
  };

  const applyRollPurpose = (total: number): void => {
    const purpose = rollPurposeRef.current;
    if (purpose === null) {
      return;
    }
    purpose.onResult(total);
    clearRollPurpose();
  };

  const addDie = (sides: DieSides): void => {
    setTray((current) => ({
      ...current,
      dice: [...current.dice, { id: crypto.randomUUID(), sides }],
    }));
  };

  const removeDie = (id: string): void => {
    setTray((current) => ({
      ...current,
      dice: current.dice.filter((die) => die.id !== id),
    }));
  };

  const addModifier = (amount: (typeof MODIFIER_STEPS)[number]): void => {
    setTray((current) => ({
      ...current,
      modifier: current.modifier + amount,
    }));
  };

  const clearModifier = (): void => {
    setTray((current) => ({ ...current, modifier: 0 }));
  };

  const clearTray = (): void => {
    setTray({ dice: [], modifier: 0 });
  };

  const dismissRoll = (): void => {
    boxRef.current?.clear();
    setRoll(null);
  };

  const startRoll = (): void => {
    if (tray.dice.length === 0 && tray.modifier === 0) {
      throw new Error("Cannot roll an empty dice tray");
    }

    const summary = formatTraySummary(tray);
    const modifier = tray.modifier;
    const percentileCount = countPercentileDice(tray.dice);
    const notation = buildEngineNotation(tray.dice);
    setPickerOpen(false);
    setTray({ dice: [], modifier: 0 });

    if (tray.dice.length === 0) {
      setRoll({
        total: modifier,
        summary,
        settled: true,
        hasDice: false,
      });
      applyRollPurpose(modifier);
      setLog((current) => trimLog([{ id: crypto.randomUUID(), total: modifier, summary }, ...current]));
      return;
    }

    const box = boxRef.current;
    if (!box || !boxReady) {
      throw new Error(boxError ?? "3D dice are not ready yet");
    }

    setRoll({
      total: 0,
      summary,
      settled: false,
      hasDice: true,
    });

    void box
      .roll(notation)
      .then((dieResults) => {
        const total = sumRollTotal(dieResults, modifier, percentileCount);
        setRoll({
          total,
          summary,
          settled: true,
          hasDice: true,
        });
        applyRollPurpose(total);
        setLog((current) => trimLog([{ id: crypto.randomUUID(), total, summary }, ...current]));
      })
      .catch((error: unknown) => {
        box.clear();
        setRoll(null);
        const message = error instanceof Error ? error.message : "Dice roll failed";
        setBoxError(message);
      });
  };

  const canRoll = tray.dice.length > 0 || tray.modifier > 0;
  const rolling = roll !== null && !roll.settled;

  const closePicker = (): void => {
    clearRollPurpose();
    setPickerOpen(false);
  };

  return {
    openCombatRoll,
    hud: (
      <div className="table-dice-hud">
        {log.length > 0 ? (
          <ol className="table-dice-log" aria-label="Recent dice rolls">
            {log.map((entry) => (
              <li key={entry.id} className="table-dice-log-entry">
                <span className="table-dice-log-formula">{entry.summary}</span>
                <span className="table-dice-log-total">{entry.total}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <button
          type="button"
          className="table-dice-trigger"
          aria-label="Open dice roller"
          disabled={roll !== null}
          onClick={openPicker}
        >
          <DieGlyph sides={20} spin />
        </button>
      </div>
    ),
    stage: (
      <div
        ref={stageRef}
        id={DICE_BOX_CONTAINER_ID}
        className={rolling || (roll !== null && roll.hasDice) ? "table-dice-stage is-active" : "table-dice-stage"}
        aria-hidden="true"
      />
    ),
    overlays: (
      <>
        {pickerOpen ? (
          <DicePickerModal
            tray={tray}
            canRoll={canRoll}
            boxReady={boxReady}
            boxError={boxError}
            title={
              rollPurpose === null
                ? "Dice"
                : rollPurpose.kind === "damage"
                  ? `Damage — ${rollPurpose.subject}`
                  : `Heal — ${rollPurpose.subject}`
            }
            onClose={closePicker}
            onAddDie={addDie}
            onRemoveDie={removeDie}
            onAddModifier={addModifier}
            onClearModifier={clearModifier}
            onClearTray={clearTray}
            onRoll={startRoll}
          />
        ) : null}
        {roll !== null && roll.settled ? (
          <DiceResultOverlay total={roll.total} onDismiss={dismissRoll} />
        ) : null}
      </>
    ),
  };
}

function DicePickerModal({
  tray,
  canRoll,
  boxReady,
  boxError,
  title,
  onClose,
  onAddDie,
  onRemoveDie,
  onAddModifier,
  onClearModifier,
  onClearTray,
  onRoll,
}: {
  tray: TrayState;
  canRoll: boolean;
  boxReady: boolean;
  boxError: string | null;
  title: string;
  onClose: () => void;
  onAddDie: (sides: DieSides) => void;
  onRemoveDie: (id: string) => void;
  onAddModifier: (amount: (typeof MODIFIER_STEPS)[number]) => void;
  onClearModifier: () => void;
  onClearTray: () => void;
  onRoll: () => void;
}) {
  const titleId = useId();
  const needsDiceEngine = tray.dice.length > 0;
  const rollBlocked = needsDiceEngine && (!boxReady || boxError !== null);
  return (
    <Modal
      titleId={titleId}
      onClose={onClose}
      className="busy-modal dice-roller-modal"
      cardClassName="busy-modal-card dice-roller-card"
    >
      <p className="eyebrow">Encounter</p>
      <h2 id={titleId}>{title}</h2>

      <div className="dice-roller-section">
        <p className="dice-roller-label">Dice</p>
        <div className="dice-roller-grid">
          {STANDARD_DICE.map((sides) => (
            <button
              key={sides}
              type="button"
              className="dice-roller-die-btn"
              aria-label={`Add ${dieDisplayName(sides)}`}
              onClick={() => onAddDie(sides)}
            >
              <DieGlyph sides={sides} spin />
              <span className="dice-roller-die-name">{dieDisplayName(sides)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="dice-roller-section">
        <p className="dice-roller-label">Plus</p>
        <div className="dice-roller-mods">
          {MODIFIER_STEPS.map((amount) => (
            <button
              key={amount}
              type="button"
              className="dice-roller-mod-btn"
              aria-label={`Add ${String(amount)}`}
              onClick={() => onAddModifier(amount)}
            >
              {amount}
            </button>
          ))}
        </div>
      </div>

      <div className="dice-roller-section">
        <div className="dice-roller-tray-head">
          <p className="dice-roller-label">Tray</p>
          {tray.dice.length > 0 || tray.modifier > 0 ? (
            <button type="button" className="dice-roller-clear" onClick={onClearTray}>
              Clear
            </button>
          ) : null}
        </div>
        <div className="dice-roller-tray" aria-live="polite">
          {tray.dice.length === 0 && tray.modifier === 0 ? (
            <p className="dice-roller-tray-empty">Tap dice and numbers to build a roll.</p>
          ) : (
            <>
              {tray.dice.map((die) => (
                <button
                  key={die.id}
                  type="button"
                  className="dice-roller-tray-chip"
                  aria-label={`Remove ${dieDisplayName(die.sides)}`}
                  onClick={() => onRemoveDie(die.id)}
                >
                  <DieGlyph sides={die.sides} />
                  <span>{dieDisplayName(die.sides)}</span>
                </button>
              ))}
              {tray.modifier > 0 ? (
                <button
                  type="button"
                  className="dice-roller-tray-chip is-mod"
                  aria-label={`Clear +${String(tray.modifier)}`}
                  onClick={onClearModifier}
                >
                  +{tray.modifier}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {boxError !== null ? <p className="dice-roller-status is-error">{boxError}</p> : null}
      {boxError === null && needsDiceEngine && !boxReady ? (
        <p className="dice-roller-status">Loading 3D dice…</p>
      ) : null}

      <div className="card-actions dice-roller-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dice-roller-roll"
          disabled={!canRoll || rollBlocked}
          onClick={onRoll}
        >
          Roll
        </button>
      </div>
    </Modal>
  );
}

function DiceResultOverlay({ total, onDismiss }: { total: number; onDismiss: () => void }) {
  return (
    <Modal
      title={`Roll result ${String(total)}`}
      onClose={onDismiss}
      className="dice-result-modal"
      cardClassName="dice-result-card"
    >
      <button type="button" className="dice-result-body" onClick={onDismiss}>
        <p className="dice-result-total">{total}</p>
        <p className="dice-result-hint">Tap to dismiss</p>
      </button>
    </Modal>
  );
}

function DieGlyph({ sides, spin = false }: { sides: DieSides; spin?: boolean }) {
  const shape = DIE_SHAPES[sides];
  return (
    <svg
      className={spin ? "die-svg is-spinning" : "die-svg"}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {shape.facets.map((facet, index) => (
        <polygon key={`${facet.tone}-${String(index)}`} className={`facet-${facet.tone}`} points={facet.points} />
      ))}
      <text
        x={shape.label.x}
        y={shape.label.y}
        fontSize={shape.label.size}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {sides === 100 ? "%" : String(sides)}
      </text>
    </svg>
  );
}

/** Shading band of a facet: hi = lit, mid = side, low = shadowed. */
type FacetTone = "hi" | "mid" | "low";

type DieFacet = {
  points: string;
  tone: FacetTone;
};

type DieShape = {
  facets: DieFacet[];
  label: { x: number; y: number; size: number };
};

const DIE_SHAPES: Record<DieSides, DieShape> = {
  4: {
    facets: [
      { points: "50,8 10,88 50,58", tone: "mid" },
      { points: "50,8 50,58 90,88", tone: "hi" },
      { points: "10,88 90,88 50,58", tone: "low" },
    ],
    label: { x: 50, y: 78, size: 19 },
  },
  6: {
    facets: [
      { points: "10,31 50,54 50,92 10,69", tone: "low" },
      { points: "90,31 50,54 50,92 90,69", tone: "mid" },
      { points: "50,8 90,31 50,54 10,31", tone: "hi" },
    ],
    label: { x: 50, y: 31, size: 21 },
  },
  8: {
    facets: [
      { points: "12,44 50,62 50,94", tone: "low" },
      { points: "88,44 50,62 50,94", tone: "mid" },
      { points: "50,8 12,44 50,62", tone: "mid" },
      { points: "50,8 50,62 88,44", tone: "hi" },
    ],
    label: { x: 62, y: 39, size: 15 },
  },
  10: {
    facets: [
      { points: "6,46 28,62 50,94", tone: "low" },
      { points: "94,46 72,62 50,94", tone: "mid" },
      { points: "28,62 50,46 72,62 50,94", tone: "low" },
      { points: "50,6 6,46 28,62 50,46", tone: "mid" },
      { points: "50,6 50,46 72,62 94,46", tone: "hi" },
    ],
    label: { x: 66, y: 41, size: 14 },
  },
  100: {
    facets: [
      { points: "6,46 28,62 50,94", tone: "low" },
      { points: "94,46 72,62 50,94", tone: "mid" },
      { points: "28,62 50,46 72,62 50,94", tone: "low" },
      { points: "50,6 6,46 28,62 50,46", tone: "mid" },
      { points: "50,6 50,46 72,62 94,46", tone: "hi" },
    ],
    label: { x: 66, y: 41, size: 18 },
  },
  12: {
    facets: [
      { points: "50,22 72.8,38.6 91.8,65.6 75.9,16.4", tone: "mid" },
      { points: "72.8,38.6 64.1,65.4 50,96 91.8,65.6", tone: "low" },
      { points: "64.1,65.4 35.9,65.4 8.2,65.6 50,96", tone: "low" },
      { points: "35.9,65.4 27.2,38.6 24.1,16.4 8.2,65.6", tone: "mid" },
      { points: "27.2,38.6 50,22 75.9,16.4 24.1,16.4", tone: "mid" },
      { points: "50,22 72.8,38.6 64.1,65.4 35.9,65.4 27.2,38.6", tone: "hi" },
    ],
    label: { x: 50, y: 45, size: 18 },
  },
  20: {
    facets: [
      { points: "50,26 50,4 90,27", tone: "mid" },
      { points: "50,26 10,27 50,4", tone: "low" },
      { points: "50,26 76,70 90,27", tone: "mid" },
      { points: "76,70 90,27 90,73", tone: "low" },
      { points: "76,70 90,73 50,96", tone: "low" },
      { points: "76,70 24,70 50,96", tone: "mid" },
      { points: "24,70 50,96 10,73", tone: "mid" },
      { points: "24,70 10,73 10,27", tone: "low" },
      { points: "50,26 24,70 10,27", tone: "mid" },
      { points: "50,26 76,70 24,70", tone: "hi" },
    ],
    label: { x: 50, y: 57, size: 17 },
  },
};

function dieDisplayName(sides: DieSides): string {
  return sides === 100 ? "w%" : `d${String(sides)}`;
}

function countPercentileDice(dice: TrayDie[]): number {
  return dice.filter((die) => die.sides === 100).length;
}

function countDiceBySides(dice: TrayDie[]): Map<DieSides, number> {
  const counts = new Map<DieSides, number>();
  for (const die of dice) {
    counts.set(die.sides, (counts.get(die.sides) ?? 0) + 1);
  }
  return counts;
}

function formatDieGroup(sides: DieSides, qty: number): string {
  if (sides === 100) {
    return qty === 1 ? "w%" : `${String(qty)}w%`;
  }
  return `${String(qty)}d${String(sides)}`;
}

function buildEngineNotation(dice: TrayDie[]): string[] {
  const counts = countDiceBySides(dice);
  const notation: string[] = [];
  for (const sides of STANDARD_DICE) {
    if (sides === 100) {
      continue;
    }
    const qty = counts.get(sides) ?? 0;
    if (qty > 0) {
      notation.push(`${String(qty)}d${String(sides)}`);
    }
  }
  const percentileCount = counts.get(100) ?? 0;
  if (percentileCount > 0) {
    notation.push(`${String(percentileCount)}d100`);
  }
  return notation;
}

function formatTraySummary(tray: TrayState): string {
  const counts = countDiceBySides(tray.dice);
  const parts: string[] = [];
  for (const sides of STANDARD_DICE) {
    const qty = counts.get(sides) ?? 0;
    if (qty > 0) {
      parts.push(formatDieGroup(sides, qty));
    }
  }
  const dice = parts.join("+");
  if (tray.modifier > 0) {
    return dice.length > 0 ? `${dice}+${String(tray.modifier)}` : `+${String(tray.modifier)}`;
  }
  return dice;
}

function numericDieSides(sides: number | string): number {
  if (typeof sides === "number") {
    return sides;
  }
  const parsed = Number(sides.replace(/^d/u, ""));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Unknown die sides: ${sides}`);
  }
  return parsed;
}

function percentileFaceTotal(value: number): number {
  return value === 0 ? 100 : value;
}

function sumRollTotal(
  dieResults: DiceBoxRollDie[],
  modifier: number,
  percentileCount: number,
): number {
  const percentiles: number[] = [];
  let otherSum = 0;
  for (const die of dieResults) {
    const sides = numericDieSides(die.sides);
    if (sides === 100) {
      percentiles.push(die.value);
    } else {
      otherSum += die.value;
    }
  }
  if (percentiles.length !== percentileCount) {
    throw new Error(
      `Expected ${String(percentileCount)} percentile dice, got ${String(percentiles.length)}`,
    );
  }
  const percentileSum = percentiles.reduce(
    (sum, value) => sum + percentileFaceTotal(value),
    0,
  );
  return percentileSum + otherSum + modifier;
}

function trimLog(entries: LogEntry[]): LogEntry[] {
  return entries.slice(0, LOG_LIMIT);
}
