import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import {
  parseAppSettings,
  parseOpenRouterApiKeyInput,
  parseOpenRouterModelId,
  type OpenRouterModelId,
} from "../host/settings";
import {
  listOpenRouterModels,
  modelOptionLabel,
  UNKNOWN_MODEL_PRICING,
  type OpenRouterListedModel,
  type OpenRouterModelCatalog,
} from "../lib/openrouter";

type OpenRouterDraft = {
  apiKey: string;
  chatModel: string;
  imageModel: string;
};

function draftFromSettings(
  apiKey: string | null,
  chatModel: string,
  imageModel: string,
): OpenRouterDraft {
  return {
    apiKey: apiKey ?? "",
    chatModel,
    imageModel,
  };
}

function optionsWithCurrent(
  models: ReadonlyArray<OpenRouterListedModel>,
  current: OpenRouterModelId,
): ReadonlyArray<OpenRouterListedModel> {
  if (models.some((model) => model.id === current)) {
    return models;
  }
  return [{ id: current, name: current, pricing: UNKNOWN_MODEL_PRICING }, ...models];
}

function ModelSelect({
  label,
  list,
  value,
  models,
  onChange,
}: {
  label: string;
  list: "chat" | "image";
  value: string;
  models: ReadonlyArray<OpenRouterListedModel> | null;
  onChange: (id: OpenRouterModelId) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        disabled={models === null}
        onChange={(event) => onChange(parseOpenRouterModelId(event.target.value))}
      >
        {models === null ? <option value={value}>Loading models…</option> : null}
        {models?.map((model) => (
          <option key={model.id} value={model.id}>
            {modelOptionLabel(model, list)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsView() {
  const { store, snap } = useHost();
  const [draft, setDraft] = useState<OpenRouterDraft>(() =>
    draftFromSettings(
      snap.settings.openRouterApiKey,
      snap.settings.openRouterModelChat,
      snap.settings.openRouterModelImage,
    ),
  );
  const [catalog, setCatalog] = useState<OpenRouterModelCatalog | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.run(
      listOpenRouterModels(snap.settings.openRouterApiKey).then((next) => {
        if (!cancelled) {
          setCatalog(next);
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [store, snap.settings.openRouterApiKey]);

  const saveOpenRouter = (): void => {
    try {
      const next = parseAppSettings({
        ...snap.settings,
        openRouterApiKey: parseOpenRouterApiKeyInput(draft.apiKey),
        openRouterModelChat: parseOpenRouterModelId(draft.chatModel),
        openRouterModelImage: parseOpenRouterModelId(draft.imageModel),
      });
      store.run(store.replaceSettings(next));
    } catch (error: unknown) {
      store.report(error);
    }
  };

  return (
    <div className="settings">
      <header className="prep-bar">
        <button type="button" onClick={() => store.setMode("home")}>
          Back to Home
        </button>
        <h1>Settings</h1>
      </header>
      <section>
        <h2>OpenRouter</h2>
        <p className="muted">Key stays on this device. AI tasks fail loud if it is missing.</p>
        <label>
          API key
          <input
            type="password"
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            autoComplete="off"
          />
        </label>
        <ModelSelect
          label="Chat model"
          list="chat"
          value={draft.chatModel}
          models={
            catalog === null
              ? null
              : optionsWithCurrent(catalog.chat, parseOpenRouterModelId(draft.chatModel))
          }
          onChange={(id) => setDraft({ ...draft, chatModel: id })}
        />
        <ModelSelect
          label="Image model"
          list="image"
          value={draft.imageModel}
          models={
            catalog === null
              ? null
              : optionsWithCurrent(catalog.image, parseOpenRouterModelId(draft.imageModel))
          }
          onChange={(id) => setDraft({ ...draft, imageModel: id })}
        />
        <button type="button" onClick={saveOpenRouter}>
          Save OpenRouter
        </button>
      </section>
    </div>
  );
}
