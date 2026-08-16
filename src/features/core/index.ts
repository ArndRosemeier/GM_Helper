import { EntityCard } from "../../ui/EntityCard";
import type { FeatureModule } from "../../host/features/types";

export const coreFeature: FeatureModule = {
  id: "core",
  register(registry) {
    registry.registerFocusCard({ tag: "*", component: EntityCard });
  },
};
