import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

const ZHIHU_TAIL_SELECTORS = [
  ".Reward"
];

const ZHIHU_TAIL_MARKERS = [
  /^送礼物$/,
  /^还没有人送礼物/,
  /^继续追问$/,
  /^由知乎直答提供$/
];

const BLOCK_SELECTOR = "p, div, section, article, h1, h2, h3, h4, h5, h6, li";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isTailMarker(value: string): boolean {
  return ZHIHU_TAIL_MARKERS.some((pattern) => pattern.test(value));
}

function getClosestBlock(root: HTMLElement, node: Node | null): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node?.parentElement ?? null;

  while (current && current !== root) {
    if (current.matches(BLOCK_SELECTOR)) {
      return current;
    }
    current = current.parentElement;
  }

  return current === root ? root : null;
}

function findTailMarkerElement(root: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const value = normalizeText(current.textContent ?? "");
    if (isTailMarker(value)) {
      return getClosestBlock(root, current);
    }
    current = walker.nextNode();
  }

  return null;
}

function truncateFrom(root: HTMLElement, start: Node | null): void {
  let current = start;

  while (current && current !== root) {
    while (current.nextSibling) {
      current.nextSibling.remove();
    }

    const parent = current.parentNode;
    current.remove();
    current = parent;
  }
}

function cleanupZhihuTail(root: HTMLElement): void {
  const candidates: HTMLElement[] = [];

  for (const selector of ZHIHU_TAIL_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      candidates.push(element);
    }
  }

  const markerElement = findTailMarkerElement(root);
  if (markerElement) {
    candidates.push(markerElement);
  }

  const tailStart = candidates.sort((left, right) => {
    if (left === right) {
      return 0;
    }

    const relation = left.compareDocumentPosition(right);
    return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  })[0];

  if (tailStart) {
    truncateFrom(root, tailStart);
  }
}

function buildZhihuRoot(root: HTMLElement): HTMLElement | null {
  const content = root.querySelector<HTMLElement>(
    "article.Post-RichText, .Post-RichText, .RichContent .RichText, .RichContent"
  );
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title =
    root.querySelector<HTMLElement>("h1.Post-Title") ||
    root.querySelector<HTMLElement>("h1");
  const author =
    root.querySelector<HTMLElement>(".AuthorInfo-name") ||
    root.querySelector<HTMLElement>("[class*='AuthorInfo']");

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

  const body = content.cloneNode(true) as HTMLElement;
  cleanupZhihuTail(body);
  article.appendChild(body);
  return article;
}

export const zhihuAdapter: DomainAdapter = {
  name: "zhihu",
  match(root, context) {
    return context.site === "zhihu" && Boolean(buildZhihuRoot(root));
  },
  transform(root, context) {
    const adaptedRoot = buildZhihuRoot(root);
    if (!adaptedRoot) {
      return null;
    }

    return makeAdaptedContent(adaptedRoot, context, {
      site: "zhihu",
      title: getText(adaptedRoot.querySelector("h1")) || context.documentTitle,
      author:
        getText(root.querySelector(".AuthorInfo-name")) ||
        getText(root.querySelector("[class*='AuthorInfo']")) ||
        context.author
    });
  }
};
