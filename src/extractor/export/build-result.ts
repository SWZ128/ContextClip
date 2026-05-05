import type { DocumentMetadata, NormalizedDocument } from "../domain/types";
import { renderDocument } from "../markdown/render";
import type { ExtractMode, ExtractResult } from "../../contracts/extract-result";

type AssetEntry = ExtractResult["assets"][number];

function sanitizeFileName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function makeFileName(title: string, mode: ExtractMode, ext: "md" | "zip"): string {
  const stem = sanitizeFileName(title);
  return `${stem}.${mode}.${ext}`;
}

function collectAssets(root: ParentNode): AssetEntry[] {
  const assets: AssetEntry[] = [];

  root.querySelectorAll("img, audio, video").forEach((node) => {
    if (node instanceof HTMLImageElement) {
      const url = node.currentSrc || node.src || node.getAttribute("src") || "";
      if (url) {
        assets.push({
          url,
          kind: "image",
          alt: node.alt || undefined,
          downloaded: false
        });
      }
      return;
    }

    if (node instanceof HTMLAudioElement) {
      const url = node.currentSrc || node.src || node.getAttribute("src") || "";
      if (url) {
        assets.push({ url, kind: "audio", downloaded: false });
      }
      return;
    }

    if (node instanceof HTMLVideoElement) {
      const url = node.currentSrc || node.src || node.getAttribute("src") || "";
      if (url) {
        assets.push({ url, kind: "video", downloaded: false });
      }
    }
  });

  return assets;
}

function shouldZip(root: ParentNode, assets: AssetEntry[]): boolean {
  const paragraphs = root.querySelectorAll("p, li").length;
  const heavyMediaCount = assets.filter((asset) => asset.kind !== "image").length;
  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  return heavyMediaCount > 0 || (imageCount >= 8 && paragraphs <= 10);
}

export function buildMetadata(base: Omit<DocumentMetadata, "capturedAt">, selectionHint?: string): DocumentMetadata {
  return {
    ...base,
    capturedAt: new Date().toISOString(),
    selectionHint
  };
}

export function buildExtractResult(
  mode: ExtractMode,
  normalizedDocument: NormalizedDocument,
  root: HTMLElement,
  selectionHint?: string
): ExtractResult {
  const assets = collectAssets(root);
  const markdown = renderDocument(normalizedDocument);
  const needsZip = shouldZip(root, assets);

  return {
    mode,
    title: normalizedDocument.meta.title,
    site: normalizedDocument.meta.site,
    sourceUrl: normalizedDocument.meta.sourceUrl,
    author: normalizedDocument.meta.author,
    createdAt: normalizedDocument.meta.createdAt,
    modifiedAt: normalizedDocument.meta.modifiedAt,
    capturedAt: normalizedDocument.meta.capturedAt,
    selectionHint: selectionHint ?? normalizedDocument.meta.selectionHint,
    markdown,
    fileName: makeFileName(normalizedDocument.meta.title, mode, needsZip ? "zip" : "md"),
    needsZip,
    assets
  };
}
