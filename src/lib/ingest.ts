import { newChunkId, newSourceId, type CampaignId, type SourceId } from "../host/ids";
import type { Source, SourceChunk, SourceKind } from "../host/types";
import { nowIso } from "../host/types";
import { openPdfDocument } from "./pdfjsRuntime";

export type IngestResult = {
  source: Source;
  chunks: ReadonlyArray<SourceChunk>;
};

function kindOf(file: File): SourceKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (file.type === "text/markdown" || name.endsWith(".md")) {
    return "markdown";
  }
  if (file.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm")) {
    return "html";
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name)) {
    return "image";
  }
  if (file.type === "text/plain" || name.endsWith(".txt")) {
    return "markdown";
  }
  throw new Error(`Unsupported source type: ${file.type || file.name}`);
}

function splitMarkdown(text: string): ReadonlyArray<{ heading: string; body: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: { heading: string; body: string }[] = [];
  let heading = "Untitled";
  let body: string[] = [];
  const flush = (): void => {
    const joined = body.join("\n").trim();
    if (joined.length > 0) {
      sections.push({ heading, body: joined });
    }
    body = [];
  };
  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (match?.[2]) {
      flush();
      heading = match[2].trim();
      continue;
    }
    body.push(line);
  }
  flush();
  return sections.length > 0 ? sections : [{ heading: "Document", body: text.trim() }];
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
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
  const kind = kindOf(file);
  const source: Source = {
    id: newSourceId(),
    campaignId,
    title: file.name,
    kind,
    createdAt: nowIso(),
    mimeType: file.type.length > 0 ? file.type : null,
    bytes: file,
  };

  if (kind === "image") {
    return {
      source,
      chunks: toChunks(campaignId, source.id, [
        { heading: file.name, body: `Image source: ${file.name}`, page: null },
      ]),
    };
  }

  if (kind === "pdf") {
    const pages = await pdfPages(file);
    return {
      source,
      chunks: toChunks(
        campaignId,
        source.id,
        pages.map((page) => ({
          heading: headingFrom(page.text, `${file.name} p.${page.page}`),
          body: page.text,
          page: page.page,
        })),
      ),
    };
  }

  const raw = await file.text();
  const text = kind === "html" ? htmlToText(raw) : raw;
  const sections = splitMarkdown(text);
  return {
    source,
    chunks: toChunks(
      campaignId,
      source.id,
      sections.map((section) => ({ heading: section.heading, body: section.body, page: null })),
    ),
  };
}
