import type { FeatureModule } from "../../host/features/types";
import { TableSurface } from "../../ui/TableSurface";

export const battlegroundFeature: FeatureModule = {
  id: "battleground",
  register(registry) {
    registry.registerPlayerSurface({ id: "battleground", component: TableSurface });
    registry.registerAiTask({
      id: "sketchBattleground",
      label: "Sketch battleground",
      tableAllowed: false,
    });
  },
};
