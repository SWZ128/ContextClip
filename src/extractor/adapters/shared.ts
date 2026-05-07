import type { AdaptedContent, ExtractionContext } from "./types";

const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;

export type ChatProvider = "chatgpt" | "gemini" | "deepseek";

function stripDescriptor(value: string, label: string): string {
  return value.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "").trim();
}

function getSavedFromUrl(document: Document): string | undefined {
  for (const node of Array.from(document.childNodes)) {
    if (node.nodeType !== Node.COMMENT_NODE) {
      continue;
    }

    const value = node.textContent ?? "";
    const match = value.match(/saved from url=\(\d+\)(https?:\/\/\S+)/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function isBrokenSourceUrl(value: string): boolean {
  return /\/undefined(?:\/|$)/.test(value);
}

function shouldPreferSavedUrl(candidate: string | undefined, savedUrl: string | undefined): boolean {
  if (!savedUrl) {
    return false;
  }

  if (!candidate) {
    return true;
  }

  if (isBrokenSourceUrl(candidate)) {
    return true;
  }

  try {
    const current = new URL(candidate);
    const saved = new URL(savedUrl);

    if (current.hostname !== saved.hostname) {
      return false;
    }

    if (current.pathname === "/" || current.pathname === "") {
      return true;
    }

    if (saved.pathname.length > current.pathname.length && current.pathname.split("/").filter(Boolean).length <= 2) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export function cleanText(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(ZERO_WIDTH_PATTERN, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function toIsoString(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function normalizeChineseDate(value: string): string | undefined {
  const match = value.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/
  );
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const local = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}

function normalizeTimestampSeconds(value: string): string | undefined {
  if (!/^\d{10}$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value) * 1000;
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function normalizeDateValue(value: string | null | undefined): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  return (
    normalizeChineseDate(cleaned) ||
    normalizeTimestampSeconds(cleaned) ||
    toIsoString(cleaned.replace(" UTC", " GMT")) ||
    cleaned
  );
}

function getArxivSubmissionHistoryText(document: Document): string | undefined {
  return getText(document.querySelector(".submission-history"));
}

function getArxivModifiedTime(document: Document): string | undefined {
  const history = getArxivSubmissionHistoryText(document);
  if (!history) {
    return undefined;
  }

  const matches = Array.from(
    history.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+UTC\b/g)
  );
  const value = matches.at(-1)?.[0];
  if (!value) {
    return undefined;
  }

  return normalizeDateValue(value);
}

export function detectSite(document: Document): string {
  const host = document.location.hostname;
  const canonical =
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    "";
  const probe = `${host} ${canonical}`.toLowerCase();

  if (detectChatProvider(document)) {
    return "chat";
  }

  if (probe.includes("github.com")) {
    return "github";
  }
  if (
    probe.includes("arxiv.org") ||
    document.querySelector(".submission-history, #abs, article.ltx_document, .ltx_title_document")
  ) {
    return "arxiv";
  }
  if (probe.includes("mp.weixin.qq.com") || document.querySelector("#img-content, #js_article")) {
    return "weixin";
  }
  if (probe.includes("zhihu.com") || document.querySelector(".Post-RichText, .RichContent")) {
    return "zhihu";
  }
  return host || "page";
}

export function detectChatProvider(document: Document): ChatProvider | undefined {
  const host = document.location.hostname.toLowerCase();
  const title = cleanText(document.title)?.toLowerCase() || "";
  const siteName = cleanText(document.querySelector("meta[property='og:site_name']")?.getAttribute("content"))?.toLowerCase() || "";
  const ogTitle = cleanText(document.querySelector("meta[property='og:title']")?.getAttribute("content"))?.toLowerCase() || "";
  const probe = `${host} ${title} ${siteName} ${ogTitle}`;

  if (
    host.includes("chatgpt.com") ||
    siteName.includes("chatgpt") ||
    rootHasSelector(document, "[data-message-author-role]")
  ) {
    return "chatgpt";
  }

  if (
    host.includes("gemini.google.com") ||
    siteName.includes("gemini") ||
    rootHasSelector(document, "user-query, model-response, chat-window")
  ) {
    return "gemini";
  }

  if (
    host.includes("chat.deepseek.com") ||
    siteName.includes("deepseek") ||
    ogTitle.includes("deepseek") ||
    rootHasSelector(document, ".ds-message, .ds-markdown")
  ) {
    return "deepseek";
  }

  return undefined;
}

function rootHasSelector(root: ParentNode, selector: string): boolean {
  return Boolean(root.querySelector(selector));
}

export function getSourceUrl(document: Document): string {
  const candidate =
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    document.location.href;
  const savedUrl = getSavedFromUrl(document);
  return shouldPreferSavedUrl(candidate, savedUrl) ? (savedUrl as string) : candidate;
}

export function getDocumentTitle(document: Document): string {
  const site = detectSite(document);

  if (site === "chat") {
    const provider = detectChatProvider(document);

    if (provider === "gemini") {
      return (
        getText(document.querySelector("[data-test-id='conversation-title']")) ||
        cleanText(document.title.replace(/\s*-\s*Google Gemini$/i, "")) ||
        document.title ||
        "Gemini Chat"
      );
    }

    if (provider === "deepseek") {
      return cleanText(document.title.replace(/\s*-\s*DeepSeek$/i, "")) || document.title || "DeepSeek Chat";
    }

    if (provider === "chatgpt") {
      return cleanText(document.title) || "ChatGPT Chat";
    }
  }

  if (site === "arxiv") {
    const title =
      document.querySelector<HTMLMetaElement>("meta[property='og:title']")?.content?.trim() ||
      document.querySelector<HTMLMetaElement>("meta[name='citation_title']")?.content?.trim() ||
      getText(document.querySelector(".ltx_title_document")) ||
      getText(document.querySelector("h1.title")) ||
      getText(document.querySelector("main h1")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return stripDescriptor(title, "Title");
    }
  }

  if (site === "zhihu") {
    const title =
      getText(document.querySelector("h1.QuestionHeader-title")) ||
      getText(document.querySelector("h1.Post-Title")) ||
      getText(document.querySelector(".QuestionHeader h1")) ||
      getText(document.querySelector("main h1")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return title;
    }
  }

  if (site === "weixin") {
    const title =
      getText(document.querySelector("#activity-name")) ||
      getText(document.querySelector(".rich_media_title")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return title;
    }
  }

  if (site === "github") {
    const title =
      getText(document.querySelector("[data-testid='readme'] .markdown-body h1")) ||
      getText(document.querySelector("main .markdown-body h1")) ||
      getText(document.querySelector("article.markdown-body h1")) ||
      getText(document.querySelector(".entry-content.markdown-body h1")) ||
      getText(document.querySelector("nav[aria-label='Breadcrumbs'] li:last-child span"));
    if (title) {
      return title;
    }
  }

  return document.title || "Untitled Page";
}

export function getMetaAuthor(document: Document): string | undefined {
  const site = detectSite(document);
  const citationAuthors = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name='citation_author']"))
    .map((element) => cleanText(element.content))
    .filter(Boolean);
  if (citationAuthors.length > 0) {
    return citationAuthors.join(", ");
  }

  if (site === "weixin") {
    return (
      getText(document.querySelector("#js_name")) ||
      getText(document.querySelector(".rich_media_meta_nickname")) ||
      cleanText(document.documentElement.innerHTML.match(/var nickname = htmlDecode\("([^"]+)"\)/)?.[1])
    );
  }

  if (site === "arxiv") {
    const authors =
      getText(document.querySelector(".authors")) ||
      getText(document.querySelector(".ltx_authors")) ||
      getText(document.querySelector(".ltx_creator"));
    if (authors) {
      return stripDescriptor(authors, "Authors");
    }
  }

  const meta = document.querySelector("meta[name='author'], meta[property='article:author']");
  return cleanText(meta?.getAttribute("content"));
}

function getMetaContent(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = cleanText(document.querySelector(selector)?.getAttribute("content"));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getWeixinPublishedTime(document: Document): string | undefined {
  const scriptMatch = document.documentElement.innerHTML.match(
    /(?:var\s+oriCreateTime|var\s+createTimestamp)\s*=\s*['"](\d{10})['"]/
  );
  if (scriptMatch?.[1]) {
    return normalizeDateValue(scriptMatch[1]);
  }

  return normalizeDateValue(document.querySelector("#publish_time")?.textContent);
}

export function getCreatedAt(document: Document): string | undefined {
  return normalizeDateValue(
    getMetaContent(document, [
      "meta[property='article:published_time']",
      "meta[name='article:published_time']",
      "meta[property='og:published_time']",
      "meta[name='og:published_time']",
      "meta[itemprop='datePublished']",
      "meta[name='datePublished']",
      "meta[name='citation_date']",
      "meta[name='citation_online_date']",
      "meta[name='publishdate']",
      "meta[name='publish_date']",
      "meta[name='pubdate']",
      "meta[name='date']"
    ]) ||
    getWeixinPublishedTime(document)
  );
}

export function getModifiedAt(document: Document): string | undefined {
  return normalizeDateValue(
    getMetaContent(document, [
      "meta[property='article:modified_time']",
      "meta[name='article:modified_time']",
      "meta[property='og:updated_time']",
      "meta[name='og:updated_time']",
      "meta[itemprop='dateModified']",
      "meta[name='dateModified']",
      "meta[name='lastmod']",
      "meta[name='last-modified']"
    ]) ||
    getArxivModifiedTime(document)
  );
}

export function getText(element: Element | null | undefined): string | undefined {
  return cleanText(element?.textContent);
}

export function buildContext(document: Document): ExtractionContext {
  return {
    documentTitle: getDocumentTitle(document),
    sourceUrl: getSourceUrl(document),
    site: detectSite(document),
    author: getMetaAuthor(document),
    createdAt: getCreatedAt(document),
    modifiedAt: getModifiedAt(document)
  };
}

export function makeAdaptedContent(root: HTMLElement, context: ExtractionContext, overrides?: Partial<AdaptedContent>): AdaptedContent {
  return {
    title: overrides?.title || context.documentTitle,
    sourceUrl: overrides?.sourceUrl || context.sourceUrl,
    site: overrides?.site || context.site,
    author: overrides?.author ?? context.author,
    createdAt: overrides?.createdAt ?? context.createdAt,
    modifiedAt: overrides?.modifiedAt ?? context.modifiedAt,
    root,
  };
}
