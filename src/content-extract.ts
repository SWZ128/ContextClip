import { Readability } from "@mozilla/readability";
import { toMarkdown } from "./content-markdown";
import type { AssetEntry, ExtractMode, ExtractResult } from "./lib/types";

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "aside",
  "footer",
  "form",
  "[role='dialog']",
  "[aria-hidden='true']",
  "#saladict",
  "#immersiveTranslator",
  "#wechatsync-fab",
  ".comment-app",
  ".Comments-container",
  ".RichContent-actions",
  ".RichContent-cover",
  ".RichContent-actions.is-fixed",
  ".ContentItem-actions",
  ".ContentItem-time",
  ".RichText-actions",
  ".AppHeader",
  ".Sticky",
  ".CornerButtons",
  ".Rich_media_tool",
  ".rich_media_extra",
  ".js_uneditable_area",
  "#js_tags",
  "#js_pc_qr_code",
  "#js_share_content",
  "#js_append_comment",
  "#js_hotspot_area",
  "#js_preview_reward_author",
  ".original_primary_card",
  ".wx_profile_card_inner",
  ".code-toolbar",
  ".react-code-size-details",
  ".js-timeline-item",
  ".file-actions",
  ".prc-UnderlineNav-UnderlineNavItem-syRjR",
  ".Link--primary[href^='#user-content-']"
];

const SITE_ROOT_SELECTORS: Array<{ site: string; selectors: string[] }> = [
  {
    site: "github",
    selectors: [
      "article.markdown-body",
      ".markdown-body",
      ".entry-content.markdown-body"
    ]
  },
  {
    site: "weixin",
    selectors: [
      "#img-content",
      "#js_article",
      ".rich_media_area_primary",
      ".rich_media_content"
    ]
  },
  {
    site: "zhihu",
    selectors: [
      "article.Post-RichText",
      ".Post-RichText",
      ".RichContent .RichText",
      ".RichContent",
      "main article"
    ]
  }
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

function toIsoNow(): string {
  return new Date().toISOString();
}

function cloneAndClean(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  for (const selector of NOISE_SELECTORS) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }

  clone.querySelectorAll("img").forEach((img) => {
    const element = img as HTMLImageElement;
    const lazySrc =
      element.getAttribute("data-src") ||
      element.getAttribute("data-original") ||
      element.getAttribute("data-actualsrc");

    if (lazySrc && !element.getAttribute("src")) {
      element.setAttribute("src", lazySrc);
    }
  });

  clone.querySelectorAll("pre code").forEach((code) => {
    const block = code as HTMLElement;
    const className = block.className;
    if (className && !block.getAttribute("data-language")) {
      const match = className.match(/language-([a-z0-9_-]+)/i);
      if (match) {
        block.setAttribute("data-language", match[1]);
      }
    }
  });

  return clone;
}

function detectSite(): string {
  const host = window.location.hostname;
  const canonical =
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    "";
  const probe = `${host} ${canonical}`.toLowerCase();

  if (probe.includes("github.com")) {
    return "github";
  }
  if (probe.includes("mp.weixin.qq.com") || document.querySelector("#img-content, #js_article")) {
    return "weixin";
  }
  if (probe.includes("zhihu.com") || document.querySelector(".Post-RichText, .RichContent")) {
    return "zhihu";
  }
  return host || "page";
}

function buildSiteSpecificRoot(site: string): HTMLElement | null {
  if (site === "weixin") {
    return buildWeixinRoot();
  }
  if (site === "zhihu") {
    return buildZhihuRoot();
  }
  if (site === "github") {
    return buildGithubRoot();
  }
  return null;
}

function buildGithubRoot(): HTMLElement | null {
  const body = document.querySelector<HTMLElement>("article.markdown-body, .markdown-body, .entry-content.markdown-body");
  if (!body) {
    return null;
  }

  const article = document.createElement("article");
  const title = document.querySelector<HTMLElement>("h1");
  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }
  article.appendChild(body.cloneNode(true));
  return article;
}

function buildWeixinRoot(): HTMLElement | null {
  const content = document.querySelector<HTMLElement>("#js_content, #img-content");
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title = document.querySelector<HTMLElement>("#activity-name, .rich_media_title");
  const meta = document.querySelector<HTMLElement>(".rich_media_meta_list");

  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  if (meta) {
    article.appendChild(meta.cloneNode(true));
  }

  article.appendChild(content.cloneNode(true));
  return article;
}

function buildZhihuRoot(): HTMLElement | null {
  const content = document.querySelector<HTMLElement>(
    "article.Post-RichText, .Post-RichText, .RichContent .RichText, .RichContent"
  );
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title =
    document.querySelector<HTMLElement>("h1.Post-Title") ||
    document.querySelector<HTMLElement>("h1");
  const author =
    document.querySelector<HTMLElement>(".AuthorInfo-name") ||
    document.querySelector<HTMLElement>("[class*='AuthorInfo']");

  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  if (author?.textContent?.trim()) {
    const byline = document.createElement("p");
    byline.textContent = author.textContent.trim();
    article.appendChild(byline);
  }

  article.appendChild(content.cloneNode(true));
  return article;
}

function findSiteSpecificRoot(): HTMLElement | null {
  const site = detectSite();
  const configured = SITE_ROOT_SELECTORS.find((entry) => entry.site === site);
  if (!configured) {
    return null;
  }

  const matched = configured.selectors.some((selector) => document.querySelector(selector));
  if (!matched) {
    return null;
  }

  return buildSiteSpecificRoot(site);
}

function collectAssets(root: ParentNode): AssetEntry[] {
  const assets: AssetEntry[] = [];

  root.querySelectorAll("img, audio, video").forEach((node) => {
    if (node instanceof HTMLImageElement) {
      const url = node.src || node.getAttribute("data-src") || "";
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
      const url = node.currentSrc || node.src || "";
      if (url) {
        assets.push({ url, kind: "audio", downloaded: false });
      }
      return;
    }

    if (node instanceof HTMLVideoElement) {
      const url = node.currentSrc || node.src || "";
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

function findAuthor(): string | undefined {
  const meta = document.querySelector("meta[name='author'], meta[property='article:author']");
  return meta?.getAttribute("content")?.trim() || undefined;
}

function describeElement(element: HTMLElement): string {
  const parts = [element.tagName.toLowerCase()];

  if (element.id) {
    parts.push(`#${element.id}`);
  }

  const className = element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  for (const item of className) {
    parts.push(`.${item}`);
  }

  return parts.join("");
}

function baseResult(
  mode: ExtractMode,
  title: string,
  markdown: string,
  assets: AssetEntry[],
  zipRoot: ParentNode,
  selectionHint?: string
): ExtractResult {
  const sourceUrl =
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    window.location.href;
  const result: ExtractResult = {
    mode,
    title,
    site: detectSite(),
    sourceUrl,
    author: findAuthor(),
    capturedAt: toIsoNow(),
    selectionHint,
    markdown,
    fileName: "",
    needsZip: false,
    assets
  };

  result.needsZip = shouldZip(zipRoot, assets);
  result.fileName = makeFileName(title, mode, result.needsZip ? "zip" : "md");
  return result;
}

export function extractCurrentPage(): ExtractResult {
  const siteRoot = findSiteSpecificRoot();
  const readabilityDoc = document.cloneNode(true) as Document;
  const parsed = siteRoot ? null : new Readability(readabilityDoc).parse();
  const container = siteRoot ?? document.createElement("article");

  if (!siteRoot) {
    if (parsed?.content) {
      container.innerHTML = parsed.content;
    } else {
      container.innerHTML = document.body.innerHTML;
    }
  }

  const cleanRoot = cloneAndClean(container);
  const assets = collectAssets(cleanRoot);
  const markdown = toMarkdown(cleanRoot);
  const title =
    cleanRoot.querySelector("h1")?.textContent?.trim() ||
    parsed?.title?.trim() ||
    document.title ||
    "Untitled Page";

  return baseResult("page", title, markdown, assets, cleanRoot);
}

export function extractElement(element: HTMLElement): ExtractResult {
  const cleanRoot = cloneAndClean(element);
  const assets = collectAssets(cleanRoot);
  const markdown = toMarkdown(cleanRoot);
  const title =
    cleanRoot.querySelector("h1,h2,h3")?.textContent?.trim() ||
    element.getAttribute("aria-label") ||
    document.title ||
    "Selected Content";

  const selectionHint = describeElement(element);
  return baseResult("selection", title, markdown, assets, cleanRoot, selectionHint);
}
