import { Readability } from "@mozilla/readability";
import { makeAdaptedContent } from "./shared";
import type { AdaptedContent, ExtractionContext } from "./types";

function buildGenericRoot(root: HTMLElement): { root: HTMLElement; title?: string; author?: string } {
  const doc = document.implementation.createHTMLDocument(document.title);
  doc.body.innerHTML = root.outerHTML;

  const parsed = new Readability(doc).parse();
  const article = document.createElement("article");

  if (parsed?.content) {
    article.innerHTML = parsed.content;
  } else {
    article.innerHTML = root.innerHTML;
  }

  return {
    root: article,
    title: parsed?.title?.trim() || undefined,
    author: parsed?.byline?.trim() || undefined
  };
}

export function adaptGeneric(root: HTMLElement, context: ExtractionContext): AdaptedContent {
  const { root: adaptedRoot, title, author } = buildGenericRoot(root);
  return makeAdaptedContent(adaptedRoot, context, {
    title: title || context.documentTitle,
    author: author || context.author
  });
}
