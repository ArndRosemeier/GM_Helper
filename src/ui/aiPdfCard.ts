import type { SourceId } from "../host/ids";
import type { HostStore } from "../host/store/HostStore";

export async function runAddCardWithAi(
  store: HostStore,
  sourceId: SourceId,
  page: number,
  topic: string,
  tryGetImage: boolean,
  category = "",
): Promise<void> {
  await store.generateAiCardFromPdfPage(sourceId, page, topic, tryGetImage, category);
}
