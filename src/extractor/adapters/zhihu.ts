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

function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  element.remove();
}

function decodeZhihuRedirect(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "link.zhihu.com") {
      return decodeURIComponent(parsed.searchParams.get("target") || url);
    }
  } catch {
    return url;
  }

  return url;
}

function cleanupZhihuContent(root: HTMLElement): void {
  root.querySelectorAll("a[href*='zhida.zhihu.com/search']").forEach((element) => {
    unwrapElement(element as HTMLElement);
  });

  root.querySelectorAll("a[href]").forEach((element) => {
    const anchor = element as HTMLAnchorElement;
    const href = anchor.getAttribute("href") || "";
    anchor.setAttribute("href", decodeZhihuRedirect(href));
  });

  root.querySelectorAll(".RichText-LinkCardContainer").forEach((element) => {
    const container = element as HTMLElement;
    const anchor = container.querySelector<HTMLAnchorElement>("a[href]");
    const target = anchor?.getAttribute("data-text")?.trim() || decodeZhihuRedirect(anchor?.href || "");
    if (!target) {
      container.remove();
      return;
    }

    const previous = container.previousElementSibling;
    if (previous instanceof HTMLElement && previous.tagName === "P" && /[:：]\s*$/.test(previous.textContent ?? "")) {
      previous.textContent = `${previous.textContent ?? ""}${target}`;
      container.remove();
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = target;
    container.replaceWith(paragraph);
  });

  root.querySelectorAll("svg").forEach((element) => {
    if (element.closest("a")) {
      element.remove();
    }
  });
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
  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  const body = content.cloneNode(true) as HTMLElement;
  cleanupZhihuContent(body);
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
