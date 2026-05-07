import type { DocumentMetadata, NormalizedDocument } from "../domain/types";
import { renderDocument } from "../markdown/render";
import type { ExtractMode, ExtractResult } from "../../contracts/extract-result";

type AssetEntry = ExtractResult["assets"][number];

const WEIXIN_TAIL_MARKERS = [
  /^(?:\*\*)?END(?:\*\*)?$/,
  /^(?:\*\*)?送你一个新闻盲盒(?:\*\*)?$/,
  /^(?:\*\*)?快来打开看看吧(?:\*\*)?$/,
  /^(?:\*\*)?综合自[:：]/,
  /^(?:\*\*)?编辑[:：]/,
  /^(?:\*\*)?转载请注明/,
  /^(?:\*\*)?编撰\s*[|｜:：]/,
  /^(?:\*\*)?审稿\s*[|｜:：]/,
  /^(?:\*\*)?初审\s*[|｜:：]/,
  /^(?:\*\*)?终审\s*[|｜:：]/
];

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

function cleanupMarkdown(site: string, markdown: string): string {
  if (site === "arxiv") {
    return markdown
      .split("\n")
      .map((line) =>
        line
          .replace(/(Figure \d+:)(?=\S)/g, "$1 ")
          .replace(/(Table \d+:)(?=\S)/g, "$1 ")
          .replace(/\$\s*([^$\n]*?)\s*\$/g, (_match, body) => `$${String(body).trim()}$`)
          .replace(/(Cohen’s)(\$[^$\n]+\$)/g, "$1 $2")
          .replace(/(\$[^$\n]+\$)(?=\d)/g, "$1 ")
          .replace(/([A-Za-z)])\.([A-Z0-9$])/g, "$1. $2")
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (site === "github") {
    const lines = markdown.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] === "---") {
        lines[index] = "--------------------------------------------------------------------------------";
      }

      if (
        /^\[[^\n]+\]\s*\|$/.test(lines[index] ?? "") &&
        /^\[[^\n]+\](?:\s*\|)?$/.test(lines[index + 1] ?? "")
      ) {
        const merged = [lines[index].trim()];
        while (/^\[[^\n]+\](?:\s*\|)?$/.test(lines[index + 1] ?? "")) {
          merged.push(lines[index + 1].trim());
          index += 1;
        }
        lines[index - merged.length + 1] = merged.join(" ").replace(/\s+/g, " ");
        for (let offset = index - merged.length + 2; offset <= index; offset += 1) {
          lines[offset] = "";
        }
      }

      if (/^\|(?:\s*---\s*\|)+$/.test(lines[index] ?? "") && /^\|.+\|$/.test(lines[index - 1] ?? "")) {
        const cells = lines[index - 1]
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        lines[index] = `|${cells.map((cell) => "-".repeat(Math.max(3, cell.length + 2))).join("|")}|`;
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (site !== "weixin") {
    return markdown;
  }

  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => WEIXIN_TAIL_MARKERS.some((pattern) => pattern.test(line.trim())));
  return (index === -1 ? lines : lines.slice(0, index)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const markdown = cleanupMarkdown(normalizedDocument.meta.site, renderDocument(normalizedDocument));
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
