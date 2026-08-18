import type { SourceId } from "../host/ids";
import type { HostStore } from "../host/store/HostStore";

export async function runAddCardWithAi(
  store: HostStore,
  sourceId: SourceId,
  page: number,
  topic: string,
): Promise<void> {
  const includeImages = await store.chatModelAcceptsImages();
  if (!includeImages) {
    const proceed = window.confirm(
      "This chat model cannot look at pictures. Continue with the page text only?",
    );
    if (!proceed) {
      return;
    }
  }
  await store.generateAiCardFromPdfPage(sourceId, page, topic, includeImages);
}
