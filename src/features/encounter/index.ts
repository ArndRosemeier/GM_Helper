import type { FeatureModule } from "../../host/features/types";
import { EncounterAmbient } from "../../ui/EncounterPanel";

export const encounterFeature: FeatureModule = {
  id: "encounter",
  register(registry) {
    registry.registerAmbient({ id: "encounter", component: EncounterAmbient });
  },
};
