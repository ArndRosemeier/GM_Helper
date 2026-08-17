export const SURFACE_LOCKS = ["auto", "hold-gm", "hold-table"] as const;
export type SurfaceLock = (typeof SURFACE_LOCKS)[number];

export type OpenRouterApiKey = string & { readonly __brand: "OpenRouterApiKey" };
export type OpenRouterModelId = string & { readonly __brand: "OpenRouterModelId" };

export type AppSettings = {
  openRouterApiKey: OpenRouterApiKey | null;
  openRouterModelChat: OpenRouterModelId;
  openRouterModelImage: OpenRouterModelId;
  surfaceLock: SurfaceLock;
  startEncounterOnFlat: boolean;
  allowCampaignContext: boolean;
};

export type SettingsPatch = {
  [K in keyof AppSettings]: { field: K; value: AppSettings[K] };
}[keyof AppSettings];

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

export function isSurfaceLock(value: unknown): value is SurfaceLock {
  return SURFACE_LOCKS.some((lock) => lock === value);
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
    surfaceLock: parseStoredSurfaceLock(record.surfaceLock),
    startEncounterOnFlat: optionalBooleanField(record, "startEncounterOnFlat", false),
    allowCampaignContext: optionalBooleanField(record, "allowCampaignContext", false),
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

function parseStoredSurfaceLock(value: unknown): SurfaceLock {
  if (value === undefined) {
    return "auto";
  }
  if (!isSurfaceLock(value)) {
    throw new Error(`Settings.surfaceLock is not a known lock: ${String(value)}`);
  }
  return value;
}

export function applySettingsPatch(current: AppSettings, patch: SettingsPatch): AppSettings {
  return parseAppSettings({ ...current, [patch.field]: patch.value });
}

export const DEFAULT_SETTINGS: AppSettings = parseAppSettings({
  openRouterApiKey: null,
  openRouterModelChat: "openai/gpt-4.1-mini",
  openRouterModelImage: "google/gemini-2.5-flash-image-preview",
  surfaceLock: "auto",
  startEncounterOnFlat: false,
  allowCampaignContext: false,
});

export const SURFACE_LOCK_LABEL: Record<SurfaceLock, string> = {
  auto: "Auto",
  "hold-gm": "Hold GM",
  "hold-table": "Hold table",
};
