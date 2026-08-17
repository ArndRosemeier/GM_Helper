import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import {
  parseAppSettings,
  parseOpenRouterApiKeyInput,
  parseOpenRouterModelId,
  SURFACE_LOCK_LABEL,
  SURFACE_LOCKS,
  type OpenRouterModelId,
} from "../host/settings";
import {
  requestOrientationPermission,
  type OrientationPermission,
} from "../lib/posture";
import {
  listOpenRouterModels,
  modelOptionLabel,
  UNKNOWN_MODEL_PRICING,
  type OpenRouterListedModel,
  type OpenRouterModelCatalog,
} from "../lib/openrouter";
import { featureRegistry } from "../host/features/singleton";

type OrientationUiState = "idle" | OrientationPermission;

const ORIENTATION_LABEL: Record<OrientationUiState, string> = {
  idle: "not requested",
  granted: "granted",
  denied: "denied",
  unsupported: "unsupported",
  prompt: "prompt",
};

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
  const [orient, setOrient] = useState<OrientationUiState>("idle");
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
        <label className="check">
          <input
            type="checkbox"
            checked={snap.settings.allowCampaignContext}
            onChange={(event) =>
              store.run(
                store.applySettingsPatch({
                  field: "allowCampaignContext",
                  value: event.target.checked,
                }),
              )
            }
          />
          Allow campaign context in prompts
        </label>
        <ul className="task-list">
          {featureRegistry.aiTasks.map((task) => (
            <li key={task.id}>
              {task.label} {task.tableAllowed ? "(table ok)" : "(prep)"}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Table surface</h2>
        <p className="muted">Flat on the table shows the battleground. Pick up to return. Lock beats the sensor.</p>
        <label className="check">
          <input
            type="checkbox"
            checked={snap.settings.startEncounterOnFlat}
            onChange={(event) =>
              store.run(
                store.applySettingsPatch({
                  field: "startEncounterOnFlat",
                  value: event.target.checked,
                }),
              )
            }
          />
          Show the defined encounter when the tablet is laid flat
        </label>
        <div className="card-actions">
          {SURFACE_LOCKS.map((lock) => (
            <button
              key={lock}
              type="button"
              className={snap.settings.surfaceLock === lock ? "active" : ""}
              onClick={() => store.setSurfaceLock(lock)}
            >
              {SURFACE_LOCK_LABEL[lock]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            store.run(requestOrientationPermission().then((result) => setOrient(result)));
          }}
        >
          Allow orientation ({ORIENTATION_LABEL[orient]})
        </button>
      </section>
      <section>
        <h2>Campaigns</h2>
        <ul>
          {snap.campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button type="button" onClick={() => store.run(store.selectCampaign(campaign.id))}>
                {campaign.name}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => store.run(store.createCampaign("New campaign"))}>
          New campaign
        </button>
      </section>
    </div>
  );
}
