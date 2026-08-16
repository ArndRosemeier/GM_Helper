import type { FeatureModule } from "../../host/features/types";
import { hostStore } from "../../host/store/HostStore";

export const npcFeature: FeatureModule = {
  id: "npc",
  register(registry) {
    registry.registerAiTask({
      id: "generateNpc",
      label: "Generate NPC",
      tableAllowed: true,
    });
    registry.registerAiTask({
      id: "generatePortrait",
      label: "Generate portrait",
      tableAllowed: true,
    });
    registry.registerCommand({
      id: "someone-here",
      title: "Someone here",
      keywords: ["npc", "someone", "improv"],
      run: () => {
        void hostStore.generateNpc(false, false);
      },
    });
  },
};
