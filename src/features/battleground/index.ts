import { lazy } from "react";
import type { FeatureModule } from "../../host/features/types";

const TableSurface = lazy(() =>
  import("../../ui/TableSurface").then((module) => ({ default: module.TableSurface })),
);

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
