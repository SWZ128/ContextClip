import type { AdaptedContent, ExtractionContext } from "./types";

export function detectSite(document: Document): string {
  const host = document.location.hostname;
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

export function getSourceUrl(document: Document): string {
  return (
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    document.location.href
  );
}

export function getMetaAuthor(document: Document): string | undefined {
  const meta = document.querySelector("meta[name='author'], meta[property='article:author']");
  return meta?.getAttribute("content")?.trim() || undefined;
}

export function getText(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.trim();
  return value || undefined;
}

export function buildContext(document: Document): ExtractionContext {
  return {
    documentTitle: document.title || "Untitled Page",
    sourceUrl: getSourceUrl(document),
    site: detectSite(document),
    author: getMetaAuthor(document)
  };
}

export function makeAdaptedContent(root: HTMLElement, context: ExtractionContext, overrides?: Partial<AdaptedContent>): AdaptedContent {
  return {
    title: overrides?.title || context.documentTitle,
    sourceUrl: overrides?.sourceUrl || context.sourceUrl,
    site: overrides?.site || context.site,
    author: overrides?.author ?? context.author,
    root,
  };
}
