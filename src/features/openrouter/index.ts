import type { FeatureModule } from "../../host/features/types";

export const openRouterFeature: FeatureModule = {
  id: "openrouter",
  register(registry) {
    if (!registry.hasAiTask("generateNpc")) {
      registry.registerAiTask({ id: "generateNpc", label: "Generate NPC", tableAllowed: true });
    }
    if (!registry.hasAiTask("generatePortrait")) {
      registry.registerAiTask({ id: "generatePortrait", label: "Generate portrait", tableAllowed: true });
    }
    if (!registry.hasAiTask("generateToken")) {
      registry.registerAiTask({ id: "generateToken", label: "Generate token", tableAllowed: true });
    }
    if (!registry.hasAiTask("liftRunCard")) {
      registry.registerAiTask({ id: "liftRunCard", label: "Lift run card", tableAllowed: false });
    }
    if (!registry.hasAiTask("sketchBattleground")) {
      registry.registerAiTask({
        id: "sketchBattleground",
        label: "Sketch battleground",
        tableAllowed: false,
      });
    }
  },
};
