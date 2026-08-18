import { parseOpenRouterModelId, type OpenRouterApiKey, type OpenRouterModelId } from "../host/settings";

const MODELS_URL = "https://openrouter.ai/api/v1/models";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type OpenRouterConfig = {
  apiKey: OpenRouterApiKey;
  chatModel: OpenRouterModelId;
  imageModel: OpenRouterModelId;
};

type ChatCompletionResponse = {
  choices?: ReadonlyArray<{
    message?: {
      content?: string | ReadonlyArray<{ type?: string; text?: string; image_url?: { url?: string } }>;
      images?: ReadonlyArray<{ image_url?: { url?: string } }>;
    };
  }>;
  error?: { message?: string };
};

export type OpenRouterModelPricing = {
  promptPerToken: number;
  completionPerToken: number;
  imagePerImage: number | null;
  imageOutputPerToken: number | null;
};

export type OpenRouterListedModel = {
  id: OpenRouterModelId;
  name: string;
  pricing: OpenRouterModelPricing;
};

export const UNKNOWN_MODEL_PRICING: OpenRouterModelPricing = {
  promptPerToken: -1,
  completionPerToken: -1,
  imagePerImage: null,
  imageOutputPerToken: null,
};

export type OpenRouterModelCatalog = {
  chat: ReadonlyArray<OpenRouterListedModel>;
  image: ReadonlyArray<OpenRouterListedModel>;
};

type ModelsListResponse = {
  data?: unknown;
  error?: { message?: string };
  links?: unknown;
};

function nextPageUrl(links: unknown): string | null {
  if (links === undefined || links === null) {
    return null;
  }
  if (typeof links !== "object") {
    throw new Error("OpenRouter models.links must be an object");
  }
  const next = (links as Record<string, unknown>).next;
  if (next === undefined || next === null) {
    return null;
  }
  if (typeof next !== "string" || next.length === 0) {
    throw new Error("OpenRouter models.links.next must be a URL string");
  }
  return new URL(next, "https://openrouter.ai").toString();
}

async function fetchModelsPage(
  url: string,
  apiKey: OpenRouterApiKey | null,
): Promise<{ data: unknown[]; next: string | null }> {
  const response = await fetch(url, {
    headers: apiKey === null ? { "X-Title": "GM Cockpit" } : headers(apiKey),
  });
  const payload = (await response.json()) as ModelsListResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenRouter models HTTP ${response.status}`);
  }
  if (!Array.isArray(payload.data)) {
    throw new Error("OpenRouter models response is missing data[]");
  }
  return { data: payload.data, next: nextPageUrl(payload.links) };
}

function requireString(record: Record<string, unknown>, field: string, path: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}.${field} must be a non-empty string`);
  }
  return value;
}

function parseUsdAmount(value: unknown, path: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${path} is not a number: ${value}`);
    }
    return parsed;
  }
  throw new Error(`${path} must be a number`);
}

function optionalUsdAmount(
  record: Record<string, unknown>,
  field: string,
  path: string,
): number | null {
  if (!(field in record) || record[field] === undefined || record[field] === null) {
    return null;
  }
  return parseUsdAmount(record[field], `${path}.${field}`);
}

function parsePricing(value: unknown, path: string): OpenRouterModelPricing {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path}.pricing must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    promptPerToken: parseUsdAmount(record.prompt, `${path}.pricing.prompt`),
    completionPerToken: parseUsdAmount(record.completion, `${path}.pricing.completion`),
    imagePerImage: optionalUsdAmount(record, "image", `${path}.pricing`),
    imageOutputPerToken: optionalUsdAmount(record, "image_output", `${path}.pricing`),
  };
}

function formatUsd(amount: number): string {
  if (amount < 0) {
    return "varies";
  }
  if (amount === 0) {
    return "free";
  }
  if (amount >= 0.01) {
    return `$${amount.toFixed(2)}`;
  }
  if (amount >= 0.0001) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toPrecision(2)}`;
}

function perMillion(perToken: number): number {
  return perToken * 1_000_000;
}

/**
 * OpenRouter stores many flat per-image output rates as `image_output` tokens.
 * One generated image is billed as this many completion tokens (see their Images API usage example).
 */
const OPENROUTER_IMAGE_OUTPUT_TOKENS = 4175;

function isPackedPerImageRate(perImage: number): boolean {
  const halfCents = perImage * 200;
  return Math.abs(halfCents - Math.round(halfCents)) < 1e-6;
}

export function formatModelPricing(
  pricing: OpenRouterModelPricing,
  list: "chat" | "image",
): string {
  if (list === "image") {
    if (pricing.imageOutputPerToken !== null && pricing.imageOutputPerToken > 0) {
      const perImage = pricing.imageOutputPerToken * OPENROUTER_IMAGE_OUTPUT_TOKENS;
      if (isPackedPerImageRate(perImage)) {
        return `${formatUsd(perImage)}/img`;
      }
      return `${formatUsd(perMillion(pricing.imageOutputPerToken))}/M img tok`;
    }
    if (pricing.imagePerImage !== null && pricing.imagePerImage > 0) {
      return `${formatUsd(pricing.imagePerImage)}/img`;
    }
  }
  if (pricing.promptPerToken < 0 || pricing.completionPerToken < 0) {
    return "varies";
  }
  if (pricing.promptPerToken === 0 && pricing.completionPerToken === 0) {
    return "free";
  }
  return `${formatUsd(perMillion(pricing.promptPerToken))} in / ${formatUsd(perMillion(pricing.completionPerToken))} out per 1M`;
}

export function modelOptionLabel(model: OpenRouterListedModel, list: "chat" | "image"): string {
  return `${model.name} — ${formatModelPricing(model.pricing, list)} — ${model.id}`;
}

function parseListedModel(value: unknown, index: number): OpenRouterListedModel {
  const path = `OpenRouter.models[${String(index)}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    id: parseOpenRouterModelId(requireString(record, "id", path)),
    name: requireString(record, "name", path),
    pricing: parsePricing(record.pricing, path),
  };
}

function byNameThenId(left: OpenRouterListedModel, right: OpenRouterListedModel): number {
  const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }
  return left.id.localeCompare(right.id);
}

type OutputModalityFilter = "text" | "image";

async function listModelsByOutput(
  apiKey: OpenRouterApiKey | null,
  modality: OutputModalityFilter,
): Promise<OpenRouterListedModel[]> {
  const rows: unknown[] = [];
  let url: string | null = `${MODELS_URL}?limit=500&output_modalities=${modality}`;
  while (url !== null) {
    const page = await fetchModelsPage(url, apiKey);
    rows.push(...page.data);
    url = page.next;
  }
  return rows.map((item, index) => parseListedModel(item, index)).sort(byNameThenId);
}

export async function listOpenRouterModels(
  apiKey: OpenRouterApiKey | null,
): Promise<OpenRouterModelCatalog> {
  const [chat, image] = await Promise.all([
    listModelsByOutput(apiKey, "text"),
    listModelsByOutput(apiKey, "image"),
  ]);
  return { chat, image };
}

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const IMAGES_URL = "https://openrouter.ai/api/v1/images";

export type ImageAspectRatio = "1:1" | "3:4" | "16:9";

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": window.location.origin,
    "X-Title": "GM Cockpit",
  };
}

async function postChat(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ChatCompletionResponse> {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenRouter HTTP ${response.status}`);
  }
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  return payload;
}

function textFromMessage(message: NonNullable<ChatCompletionResponse["choices"]>[number]["message"]): string {
  if (!message) {
    throw new Error("OpenRouter returned no message");
  }
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    if (text.length > 0) {
      return text;
    }
  }
  throw new Error("OpenRouter returned no text content");
}

export async function completeJson(config: OpenRouterConfig, messages: ReadonlyArray<ChatMessage>): Promise<string> {
  const payload = await postChat(config.apiKey, {
    model: config.chatModel,
    messages,
    response_format: { type: "json_object" },
  });
  const choice = payload.choices?.[0];
  if (!choice) {
    throw new Error("OpenRouter returned no choices");
  }
  return textFromMessage(choice.message);
}

export async function generateImagePng(
  config: OpenRouterConfig,
  prompt: string,
  aspectRatio: ImageAspectRatio = "1:1",
): Promise<Blob> {
  return postImages(config, {
    model: config.imageModel,
    prompt,
    n: 1,
    aspect_ratio: aspectRatio,
  });
}

/** Image-to-image edit: prompt + one reference image via OpenRouter input_references. */
export async function editImagePng(
  config: OpenRouterConfig,
  prompt: string,
  reference: Blob,
): Promise<Blob> {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    throw new Error("Modification instructions are empty");
  }
  const dataUrl = await blobToDataUrl(reference);
  return postImages(config, {
    model: config.imageModel,
    prompt: trimmed,
    n: 1,
    input_references: [
      {
        type: "image_url",
        image_url: { url: dataUrl },
      },
    ],
  });
}

async function postImages(
  config: OpenRouterConfig,
  body: Record<string, unknown>,
): Promise<Blob> {
  const response = await fetch(IMAGES_URL, {
    method: "POST",
    headers: headers(config.apiKey),
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    data?: ReadonlyArray<{ b64_json?: unknown; media_type?: unknown }>;
    error?: { message?: unknown };
  };
  if (!response.ok) {
    const message =
      typeof payload.error?.message === "string"
        ? payload.error.message
        : `OpenRouter images HTTP ${String(response.status)}`;
    throw new Error(message);
  }
  if (typeof payload.error?.message === "string") {
    throw new Error(payload.error.message);
  }
  const first = payload.data?.[0];
  if (!first || typeof first.b64_json !== "string" || first.b64_json.length === 0) {
    throw new Error("OpenRouter images returned no image bytes");
  }
  const mime =
    typeof first.media_type === "string" && first.media_type.length > 0 ? first.media_type : "image/png";
  return base64ToBlob(first.b64_json, mime);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const mime = blob.type.length > 0 ? blob.type : "image/png";
  return `data:${mime};base64,${btoa(binary)}`;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export type LiftedCard = {
  title: string;
  tags: string[];
  text: string;
  facts: ReadonlyArray<{ label: string; value: string }>;
  secret: string | null;
  tracks: ReadonlyArray<{ label: string; current: number; max: number | null }>;
};

export function parseLiftedCard(raw: string): LiftedCard {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI lift did not return an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.title !== "string") {
    throw new Error("AI lift missing title");
  }
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const text = typeof record.text === "string" ? record.text : "";
  const factsRaw = Array.isArray(record.facts) ? record.facts : [];
  const facts = factsRaw.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const fact = item as Record<string, unknown>;
    if (typeof fact.label !== "string" || typeof fact.value !== "string") {
      return [];
    }
    return [{ label: fact.label, value: fact.value }];
  });
  const secret = typeof record.secret === "string" && record.secret.length > 0 ? record.secret : null;
  const tracksRaw = Array.isArray(record.tracks) ? record.tracks : [];
  const tracks = tracksRaw.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const track = item as Record<string, unknown>;
    if (typeof track.label !== "string" || typeof track.current !== "number") {
      return [];
    }
    const max = typeof track.max === "number" ? track.max : null;
    return [{ label: track.label, current: track.current, max }];
  });
  return { title: record.title, tags, text, facts, secret, tracks };
}

export type GeneratedNpc = {
  title: string;
  text: string;
};

export function parseGeneratedNpc(raw: string): GeneratedNpc {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("NPC generation did not return an object");
  }
  const record = parsed as Record<string, unknown>;
  const title = record.title;
  const text = record.text;
  if (typeof title !== "string" || typeof text !== "string") {
    throw new Error("NPC generation missing required fields");
  }
  return { title, text };
}
