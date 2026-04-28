import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

function buildGithubRoot(root: HTMLElement): HTMLElement | null {
  const body = root.querySelector<HTMLElement>("article.markdown-body, .markdown-body, .entry-content.markdown-body");
  if (!body) {
    return null;
  }

  const article = document.createElement("article");
  const title = root.querySelector<HTMLElement>("h1");
  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  article.appendChild(body.cloneNode(true));
  return article;
}

export const githubAdapter: DomainAdapter = {
  name: "github",
  match(root, context) {
    return context.site === "github" && Boolean(buildGithubRoot(root));
  },
  transform(root, context) {
    const adaptedRoot = buildGithubRoot(root);
    if (!adaptedRoot) {
      return null;
    }

    return makeAdaptedContent(adaptedRoot, context, {
      site: "github",
      title: getText(adaptedRoot.querySelector("h1")) || context.documentTitle
    });
  }
};
