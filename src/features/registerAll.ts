import { featureRegistry } from "../host/features/singleton";
import { battlegroundFeature } from "./battleground";
import { coreFeature } from "./core";
import { encounterFeature } from "./encounter";
import { ingestFeature } from "./ingest";
import { npcFeature } from "./npc";
import { openRouterFeature } from "./openrouter";

const modules = [
  coreFeature,
  npcFeature,
  ingestFeature,
  battlegroundFeature,
  encounterFeature,
  openRouterFeature,
] as const;

for (const module of modules) {
  module.register(featureRegistry);
}

export { featureRegistry };
