import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

const GITHUB_BODY_SELECTORS = [
  "[data-testid='readme'] .markdown-body",
  "main .markdown-body",
  "article.markdown-body",
  ".entry-content.markdown-body"
];

function getGithubBody(root: HTMLElement): HTMLElement | null {
  const candidates = GITHUB_BODY_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  ).filter((element) => {
    if (element.closest("[aria-modal='true'], .Overlay, [role='dialog']")) {
      return false;
    }

    return element.textContent?.trim();
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    return (right.textContent?.trim().length || 0) - (left.textContent?.trim().length || 0);
  });

  return candidates[0];
}

function getGithubAuthor(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "github.com") {
      return undefined;
    }

    const [owner] = url.pathname.split("/").filter(Boolean);
    return owner || undefined;
  } catch {
    return undefined;
  }
}

function buildGithubRoot(root: HTMLElement): HTMLElement | null {
  const body = getGithubBody(root);
  if (!body) {
    return null;
  }

  const article = document.createElement("article");
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
      title: getText(adaptedRoot.querySelector("h1")) || context.documentTitle,
      author: getGithubAuthor(context.sourceUrl) || context.author
    });
  }
};
