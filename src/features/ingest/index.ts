import type { FeatureModule } from "../../host/features/types";
import { hostStore } from "../../host/store/HostStore";

export const ingestFeature: FeatureModule = {
  id: "ingest",
  register(registry) {
    registry.registerIngest({
      id: "files",
      label: "PDF",
      accept: [".pdf", "application/pdf"],
      ingest: async (file) => {
        await hostStore.ingestUserFile(file);
      },
    });
    registry.registerAiTask({
      id: "liftRunCard",
      label: "Lift excerpt into a run card",
      tableAllowed: false,
    });
  },
};
