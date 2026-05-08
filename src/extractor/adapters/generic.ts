import { Readability } from "@mozilla/readability";
import { cleanText, makeAdaptedContent } from "./shared";
import type { AdaptedContent, ExtractionContext } from "./types";

type Candidate = {
  root: HTMLElement;
  title?: string;
  author?: string;
  score: number;
  source: string;
};

const STRUCTURAL_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  "#main",
  "#Main",
  "#content",
  "#search",
  "#rso",
  "#center_col",
  ".main-content",
  ".mainContent",
  ".content",
  ".content-body",
  ".contentBody",
  ".article",
  ".article-body",
  ".articleBody",
  ".entry-content",
  ".post-content",
  ".post-body",
  ".postBody",
  ".page-content",
  ".pageContent",
  ".markdown-body",
  ".prose",
  ".document",
  ".doc-content",
  ".RichText",
  ".rich_media_content",
  ".topic_content",
  ".reply_content",
  ".thread",
  ".thread-content",
  ".search-results",
  ".results"
];

const PRIORITY_SELECTORS = [
  "#rso",
  "#Main",
  "#main",
  "article",
  "main",
  "[role='main']"
];

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "aside",
  "footer",
  "form",
  "button",
  "dialog",
  "[role='dialog']",
  "[role='navigation']",
  "[aria-hidden='true']"
];

const NOISE_CLASS_PATTERN =
  /\b(comment|comments|share|related|recommend|sidebar|toolbar|toc|breadcrumb|pagination|newsletter|subscribe|signup|signin|login|footer|header|cookie|modal|popup|advert|ads?|social|reaction|actions?)\b/i;

const NOISE_TEXT_PATTERNS = [
  /copyright/i,
  /all rights reserved/i,
  /sign in/i,
  /log in/i,
  /subscribe/i,
  /recommended/i,
  /related/i,
  /share/i,
  /comments?/i
];

const SEARCH_PRELUDE_PATTERNS = [
  /^any time$/i,
  /^past (hour|24 hours|week|month|year)$/i,
  /^custom range\.\.\.$/i,
  /^all results$/i,
  /^verbatim$/i,
  /^advanced search$/i,
  /^about [\d,.]+ results$/i,
  /^\([\d.]+s\)$/
];

function cloneIntoDocument(root: HTMLElement): Document {
  const doc = document.implementation.createHTMLDocument(document.title);
  doc.body.innerHTML = root.outerHTML;
  return doc;
}

function wrapArticle(root: HTMLElement): HTMLElement {
  const article = document.createElement("article");
  article.appendChild(root);
  return article;
}

function cloneRoot(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const selector of NOISE_SELECTORS) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }

  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const signature = `${element.id} ${element.className} ${element.getAttribute("role") || ""}`;
    if (NOISE_CLASS_PATTERN.test(signature)) {
      element.remove();
    }
  });

  trimLeadingResultPrelude(clone);

  return clone;
}

function trimLeadingResultPrelude(root: HTMLElement): void {
  const headings = Array.from(root.querySelectorAll("h3"));
  if (headings.length < 3) {
    return;
  }

  const firstHeading = headings[0];
  const leadingBlocks = Array.from(root.children);
  const cutoff = leadingBlocks.findIndex((child) => child.contains(firstHeading));
  if (cutoff <= 0) {
    return;
  }

  for (const child of leadingBlocks.slice(0, cutoff)) {
    const textLength = cleanText(child.textContent)?.length || 0;
    if (textLength <= 200) {
      child.remove();
    }
  }
}

function trimSearchPrelude(root: HTMLElement): void {
  const children = Array.from(root.children);
  let removed = false;

  for (const child of children) {
    const text = cleanText(child.textContent);
    if (!text) {
      child.remove();
      removed = true;
      continue;
    }

    if (SEARCH_PRELUDE_PATTERNS.some((pattern) => pattern.test(text))) {
      child.remove();
      removed = true;
      continue;
    }

    if (removed && child.querySelector("h3")) {
      break;
    }

    if (!removed) {
      break;
    }
  }
}

function prependDocumentHeading(root: HTMLElement, documentRoot: HTMLElement): HTMLElement {
  if (root.querySelector("h1")) {
    return root;
  }

  const heading = documentRoot.querySelector("h1");
  const text = cleanText(heading?.textContent);
  if (!heading || !text) {
    return root;
  }

  const clone = root.cloneNode(true) as HTMLElement;
  const title = document.createElement("h1");
  title.textContent = text;
  clone.prepend(title);
  return clone;
}

function toArticle(root: HTMLElement): HTMLElement {
  return wrapArticle(cloneRoot(root));
}

function scoreCandidate(root: HTMLElement, source: string): number {
  const text = cleanText(root.textContent) || "";
  const textLength = text.length;
  const paragraphNodes = Array.from(root.querySelectorAll("p"));
  const paragraphCount = paragraphNodes.length;
  const longParagraphCount = paragraphNodes.filter((node) => (cleanText(node.textContent)?.length || 0) >= 80).length;
  const headingCount = root.querySelectorAll("h1, h2, h3").length;
  const listCount = root.querySelectorAll("ul, ol").length;
  const codeCount = root.querySelectorAll("pre, code").length;
  const tableCount = root.querySelectorAll("table").length;
  const imageCount = root.querySelectorAll("img").length;
  const resultHeadingCount = root.querySelectorAll("a h3, h3 a, h3").length;
  const discussionBlockCount = root.querySelectorAll("[class*='reply'], [class*='comment']").length;
  const linkNodes = Array.from(root.querySelectorAll("a"));
  const linkCount = linkNodes.length;
  const linkTextLength = linkNodes
    .map((node) => cleanText(node.textContent)?.length || 0)
    .reduce((sum, value) => sum + value, 0);
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;
  const topLevelChildren = root.children.length;
  const semanticBonus = /^(article|main)$/i.test(root.tagName) ? 250 : 0;
  const noisePenalty = NOISE_TEXT_PATTERNS.reduce((sum, pattern) => sum + (pattern.test(text) ? 30 : 0), 0);
  const wholePagePenalty =
    source === "raw"
      ? topLevelChildren * 18 + Math.max(0, linkCount - paragraphCount) * 5
      : topLevelChildren > 16
        ? topLevelChildren * 8
        : 0;

  return (
    Math.min(textLength, 12000) +
    paragraphCount * 90 +
    longParagraphCount * 140 +
    headingCount * 120 +
    resultHeadingCount * 45 +
    discussionBlockCount * 35 +
    listCount * 40 +
    codeCount * 40 +
    tableCount * 70 +
    imageCount * 20 +
    semanticBonus -
    Math.round(linkDensity * 900) -
    linkCount * 3 -
    noisePenalty -
    wholePagePenalty
  );
}

function pickTitle(root: HTMLElement): string | undefined {
  return (
    cleanText(root.querySelector("h1")?.textContent) ||
    cleanText(root.querySelector("h2")?.textContent) ||
    cleanText(root.querySelector("header h1, header h2")?.textContent)
  );
}

function buildReadabilityCandidate(root: HTMLElement): Candidate | null {
  const parsed = new Readability(cloneIntoDocument(root)).parse();
  if (!parsed?.content) {
    return null;
  }

  const article = document.createElement("article");
  article.innerHTML = parsed.content;
  const wrapped = toArticle(article);
  return {
    root: wrapped,
    title: cleanText(parsed.title) || pickTitle(wrapped),
    author: cleanText(parsed.byline),
    score: scoreCandidate(wrapped, "readability") + 220,
    source: "readability"
  };
}

function buildStructuralCandidate(root: HTMLElement): Candidate | null {
  const candidates = STRUCTURAL_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  ).filter((element) => Boolean(cleanText(element.textContent)));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => scoreCandidate(right, "structural") - scoreCandidate(left, "structural"));
  const wrapped = toArticle(candidates[0]);
  return {
    root: wrapped,
    title: pickTitle(wrapped),
    score: scoreCandidate(wrapped, "structural") + 120,
    source: "structural"
  };
}

function buildPriorityCandidate(root: HTMLElement): Candidate | null {
  const winner = PRIORITY_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  )
    .filter((element) => Boolean(cleanText(element.textContent)))
    .sort((left, right) => scoreCandidate(right, "priority") - scoreCandidate(left, "priority"))[0];

  if (!winner) {
    return null;
  }

  const wrapped = toArticle(winner);
  return {
    root: wrapped,
    title: pickTitle(wrapped),
    score: scoreCandidate(wrapped, "priority") + 260,
    source: "priority"
  };
}

function buildSearchResultsCandidate(root: HTMLElement): Candidate | null {
  const resultRoot =
    root.querySelector<HTMLElement>("#rso") ||
    root.querySelector<HTMLElement>("#search");
  const title = cleanText(root.querySelector("title")?.textContent) || "";
  const looksLikeSearchPage =
    /google search/i.test(title) ||
    resultRoot?.querySelectorAll("h3").length! >= 2;

  if (!resultRoot || !looksLikeSearchPage) {
    return null;
  }

  const clone = cloneRoot(resultRoot);
  trimSearchPrelude(clone);
  const wrapped = wrapArticle(clone);
  return {
    root: wrapped,
    title: "Search Results",
    score: scoreCandidate(wrapped, "search") + 420,
    source: "search"
  };
}

function buildDenseBlockCandidate(root: HTMLElement): Candidate | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("article, section, div, main"))
    .filter((element) => {
      const textLength = cleanText(element.textContent)?.length || 0;
      const blockCount = element.querySelectorAll("p, li, pre, table").length;
      return textLength >= 300 && blockCount >= 2;
    })
    .sort((left, right) => scoreCandidate(right, "dense") - scoreCandidate(left, "dense"));

  if (candidates.length === 0) {
    return null;
  }

  const wrapped = toArticle(candidates[0]);
  return {
    root: wrapped,
    title: pickTitle(wrapped),
    score: scoreCandidate(wrapped, "dense") + 80,
    source: "dense"
  };
}

function buildClusterCandidate(root: HTMLElement): Candidate | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("article, section, div, main"))
    .filter((element) => {
      const textLength = cleanText(element.textContent)?.length || 0;
      const resultHeadingCount = element.querySelectorAll("a h3, h3 a, h3").length;
      const discussionBlockCount = element.querySelectorAll("[class*='reply'], [class*='comment']").length;
      return textLength >= 300 && (resultHeadingCount >= 3 || discussionBlockCount >= 3);
    })
    .sort((left, right) => scoreCandidate(right, "cluster") - scoreCandidate(left, "cluster"));

  if (candidates.length === 0) {
    return null;
  }

  const wrapped = toArticle(candidates[0]);
  return {
    root: wrapped,
    title: pickTitle(wrapped),
    score: scoreCandidate(wrapped, "cluster") + 110,
    source: "cluster"
  };
}

function buildMarkitdownStyleCandidate(root: HTMLElement): Candidate {
  const structural = STRUCTURAL_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  ).sort((left, right) => (cleanText(right.textContent)?.length || 0) - (cleanText(left.textContent)?.length || 0))[0];

  const article = toArticle(structural || root);
  return {
    root: article,
    title: pickTitle(article),
    score: scoreCandidate(article, "markitdown") + 40,
    source: "markitdown"
  };
}

function buildRawCandidate(root: HTMLElement): Candidate {
  const article = toArticle(root);
  return {
    root: article,
    title: pickTitle(article),
    score: scoreCandidate(article, "raw"),
    source: "raw"
  };
}

function buildGenericRoot(root: HTMLElement): { root: HTMLElement; title?: string; author?: string } {
  const search = buildSearchResultsCandidate(root);
  if (search && (cleanText(search.root.textContent)?.length || 0) >= 200) {
    return {
      root: search.root,
      title: search.title,
      author: search.author
    };
  }

  const priority = buildPriorityCandidate(root);
  if (priority && (cleanText(priority.root.textContent)?.length || 0) >= 300) {
    return {
      root: prependDocumentHeading(priority.root, root),
      title: priority.title,
      author: priority.author
    };
  }

  const candidates = [
    buildReadabilityCandidate(root),
    buildStructuralCandidate(root),
    buildDenseBlockCandidate(root),
    buildClusterCandidate(root),
    buildMarkitdownStyleCandidate(root),
    buildRawCandidate(root)
  ].filter(Boolean) as Candidate[];

  candidates.sort((left, right) => right.score - left.score);
  let winner = candidates[0];
  const focused = candidates.find(
    (candidate) =>
    (candidate.source === "structural" || candidate.source === "dense") &&
      candidate.score >= winner.score * 0.72
  ) || candidates.find(
    (candidate) =>
      (candidate.source === "cluster" || candidate.source === "priority") &&
      candidate.score >= winner.score * 0.72
  );
  if (focused) {
    winner = focused;
  }

  return {
    root: prependDocumentHeading(winner.root, root),
    title: winner.title,
    author: winner.author
  };
}

export function adaptGeneric(root: HTMLElement, context: ExtractionContext): AdaptedContent {
  const { root: adaptedRoot, title, author } = buildGenericRoot(root);
  return makeAdaptedContent(adaptedRoot, context, {
    title: title || context.documentTitle,
    author: author || context.author
  });
}
