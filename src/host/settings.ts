export type OpenRouterApiKey = string & { readonly __brand: "OpenRouterApiKey" };
export type OpenRouterModelId = string & { readonly __brand: "OpenRouterModelId" };

export type AppSettings = {
  openRouterApiKey: OpenRouterApiKey | null;
  openRouterModelChat: OpenRouterModelId;
  openRouterModelImage: OpenRouterModelId;
  allowCampaignContext: boolean;
  /** CSS zoom factor for the whole UI (Safari/Chrome). */
  uiScale: number;
};

export type SettingsPatch = {
  [K in keyof AppSettings]: { field: K; value: AppSettings[K] };
}[keyof AppSettings];

export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.35;
export const UI_SCALE_STEP = 0.05;
export const UI_SCALE_DEFAULT = 1;

export function parseOpenRouterApiKey(value: string): OpenRouterApiKey {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("OpenRouter API key is empty");
  }
  return trimmed as OpenRouterApiKey;
}

export function parseOpenRouterApiKeyInput(value: string): OpenRouterApiKey | null {
  if (value.trim().length === 0) {
    return null;
  }
  return parseOpenRouterApiKey(value);
}

export function parseOpenRouterModelId(value: string): OpenRouterModelId {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("OpenRouter model id is empty");
  }
  if (/\s/.test(trimmed)) {
    throw new Error(`OpenRouter model id contains whitespace: ${trimmed}`);
  }
  return trimmed as OpenRouterModelId;
}

function requireStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Settings.${field} must be a string`);
  }
  return value;
}

function requireBooleanField(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`Settings.${field} must be a boolean`);
  }
  return value;
}

function optionalBooleanField(record: Record<string, unknown>, field: string, fallback: boolean): boolean {
  if (!(field in record) || record[field] === undefined) {
    return fallback;
  }
  return requireBooleanField(record, field);
}

export function parseUiScale(value: unknown): number {
  if (value === undefined || value === null) {
    return UI_SCALE_DEFAULT;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Settings.uiScale must be a finite number");
  }
  const stepped = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped));
  return Math.round(clamped * 100) / 100;
}

function optionalUiScaleField(record: Record<string, unknown>, field: string): number {
  if (!(field in record) || record[field] === undefined) {
    return UI_SCALE_DEFAULT;
  }
  return parseUiScale(record[field]);
}

const FALLBACK_CHAT_MODEL = "openai/gpt-4.1-mini";
const FALLBACK_IMAGE_MODEL = "google/gemini-2.5-flash-image-preview";

export function parseAppSettings(value: unknown): AppSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("Settings record is not an object");
  }
  const record = value as Record<string, unknown>;
  return {
    openRouterApiKey: parseStoredApiKey(record.openRouterApiKey),
    openRouterModelChat: parseStoredModelId(record, "openRouterModelChat", FALLBACK_CHAT_MODEL),
    openRouterModelImage: parseStoredModelId(record, "openRouterModelImage", FALLBACK_IMAGE_MODEL),
    allowCampaignContext: optionalBooleanField(record, "allowCampaignContext", false),
    uiScale: optionalUiScaleField(record, "uiScale"),
  };
}

function parseStoredApiKey(value: unknown): OpenRouterApiKey | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("Settings.openRouterApiKey must be a string or null");
  }
  return parseOpenRouterApiKey(value);
}

function parseStoredModelId(
  record: Record<string, unknown>,
  field: string,
  fallback: string,
): OpenRouterModelId {
  if (!(field in record) || record[field] === undefined) {
    return parseOpenRouterModelId(fallback);
  }
  return parseOpenRouterModelId(requireStringField(record, field));
}

export function applySettingsPatch(current: AppSettings, patch: SettingsPatch): AppSettings {
  return parseAppSettings({ ...current, [patch.field]: patch.value });
}

export const DEFAULT_SETTINGS: AppSettings = parseAppSettings({
  openRouterApiKey: null,
  openRouterModelChat: "openai/gpt-4.1-mini",
  openRouterModelImage: "google/gemini-2.5-flash-image-preview",
  allowCampaignContext: false,
  uiScale: UI_SCALE_DEFAULT,
});
