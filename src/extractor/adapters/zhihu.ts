import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

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

  article.appendChild(content.cloneNode(true));
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
