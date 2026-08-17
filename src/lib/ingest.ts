import { newChunkId, newSourceId, type CampaignId, type SourceId } from "../host/ids";
import type { Source, SourceChunk } from "../host/types";
import { nowIso } from "../host/types";
import { openPdfDocument } from "./pdfjsRuntime";

export type IngestResult = {
  source: Source;
  chunks: ReadonlyArray<SourceChunk>;
};

function requirePdf(file: File): void {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return;
  }
  throw new Error(`Only PDF sources are supported right now (got ${file.type || file.name})`);
}

async function pdfPages(file: File): Promise<ReadonlyArray<{ page: number; text: string }>> {
  const pdf = await openPdfDocument(await file.arrayBuffer());
  const pages: { page: number; text: string }[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: pageNumber, text });
  }
  return pages;
}

function headingFrom(text: string, fallback: string): string {
  const first = text.split(/[.!?]/)[0]?.trim() ?? fallback;
  if (first.length > 0 && first.length <= 80) {
    return first;
  }
  return fallback;
}

function toChunks(
  campaignId: CampaignId,
  sourceId: SourceId,
  parts: ReadonlyArray<{ heading: string; body: string; page: number | null }>,
): SourceChunk[] {
  return parts.map((part) => ({
    id: newChunkId(),
    sourceId,
    campaignId,
    heading: part.heading,
    page: part.page,
    text: part.body.trim().length > 0 ? part.body.trim() : part.heading,
  }));
}

export async function ingestFile(campaignId: CampaignId, file: File): Promise<IngestResult> {
  requirePdf(file);
  const source: Source = {
    id: newSourceId(),
    campaignId,
    title: file.name,
    kind: "pdf",
    createdAt: nowIso(),
    mimeType: file.type.length > 0 ? file.type : "application/pdf",
    bytes: file,
  };
  const pages = await pdfPages(file);
  return {
    source,
    chunks: toChunks(
      campaignId,
      source.id,
      pages.map((page) => ({
        heading: headingFrom(page.text, `${file.name} p.${String(page.page)}`),
        body: page.text,
        page: page.page,
      })),
    ),
  };
}
