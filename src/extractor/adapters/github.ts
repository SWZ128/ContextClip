import { getSourceUrl, getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

const GITHUB_BODY_SELECTORS = [
  "article.markdown-body.entry-content",
  "[data-testid='readme'] article.markdown-body",
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

function decodeHexUrl(value: string): string | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return undefined;
  }

  let output = "";
  for (let index = 0; index < value.length; index += 2) {
    output += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16));
  }
  return /^https?:\/\//i.test(output) ? output : undefined;
}

function decodeGithubCamo(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "camo.githubusercontent.com") {
      return url;
    }

    const encoded = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
    return decodeHexUrl(encoded) || url;
  } catch {
    return url;
  }
}

const GITHUB_EXTENSIONLESS_FILE_NAMES = new Set([
  "license",
  "readme",
  "changelog",
  "notice",
  "authors",
  "contributors",
  "dockerfile",
  "makefile",
  "justfile",
  "procfile",
  "gemfile",
  "rakefile",
  "guardfile",
  "brewfile",
  "podfile",
  "cartfile",
  "vagrantfile",
  "workspace",
  "build",
  "bazel",
  "bazelrc",
  "cmakelists.txt"
]);

function normalizeGithubBlobUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return url;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 5 || parts[2] !== "blob") {
      return url;
    }

    const targetPath = parts.slice(4).join("/");
    const leaf = parts.at(-1)?.toLowerCase() || "";
    if (!targetPath || targetPath.endsWith("/")) {
      parts[2] = "tree";
      parsed.pathname = `/${parts.join("/")}`;
      return parsed.toString();
    }

    if (leaf.includes(".") || GITHUB_EXTENSIONLESS_FILE_NAMES.has(leaf)) {
      return url;
    }

    parts[2] = "tree";
    parsed.pathname = `/${parts.join("/")}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeGithubAssets(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>("img[src]").forEach((element) => {
    const src = element.getAttribute("src") || "";
    const canonical = element.getAttribute("data-canonical-src") || "";
    element.setAttribute("src", canonical || decodeGithubCamo(src));
  });

  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((element) => {
    const href = element.getAttribute("href") || "";
    if (href.startsWith("./") && element.querySelector("img[data-canonical-src]")) {
      const image = element.querySelector<HTMLImageElement>("img[data-canonical-src]");
      const canonical = image?.getAttribute("data-canonical-src");
      if (canonical) {
        element.setAttribute("href", canonical);
        return;
      }
    }
    element.setAttribute("href", normalizeGithubBlobUrl(decodeGithubCamo(href)));
  });
}

function cleanupGithubRichText(root: ParentNode): void {
  root
    .querySelectorAll(
      ".anchor, clipboard-copy, .zeroclipboard-container, .sr-only, .AnimatedImagePlayer, [data-target='animated-image.player'], [data-target='animated-image.replacedLink'], [data-target='animated-image.imageContainer'], [data-target='animated-image.replacedImage'], [data-target='animated-image.controls'], [data-target='animated-image.playButton'], [data-target='animated-image.openButton'], [data-target='animated-image.imageButton']"
    )
    .forEach((element) => {
      element.remove();
    });
}

function getGithubOverviewHtml(): string | undefined {
  try {
    const url = new URL(getSourceUrl(document));
    if (url.hostname !== "github.com" || url.pathname.split("/").filter(Boolean).length > 2) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const script = document.querySelector<HTMLScriptElement>("script[data-target='react-app.embeddedData']");
  const raw = script?.textContent?.trim();
  if (!raw) {
    return undefined;
  }

  try {
    const payload = JSON.parse(raw);
    const html =
      payload?.payload?.codeViewRepoRoute?.overview?.overviewFiles?.find((item: { richText?: string }) => item?.richText)
        ?.richText ||
      payload?.payload?.overview?.overviewFiles?.find((item: { richText?: string }) => item?.richText)?.richText;
    return typeof html === "string" ? html : undefined;
  } catch {
    return undefined;
  }
}

function buildGithubRoot(root: HTMLElement): HTMLElement | null {
  const overviewHtml = getGithubOverviewHtml();
  if (overviewHtml) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = overviewHtml;
    cleanupGithubRichText(wrapper);
    const richText = wrapper.querySelector("article.markdown-body.entry-content") as HTMLElement | null;
    if (richText?.textContent?.trim()) {
      normalizeGithubAssets(richText);
      const article = document.createElement("article");
      article.appendChild(richText.cloneNode(true));
      return article;
    }
  }

  const body = getGithubBody(root);
  if (!body) {
    return null;
  }

  const article = document.createElement("article");
  const clone = body.cloneNode(true) as HTMLElement;
  cleanupGithubRichText(clone);
  normalizeGithubAssets(clone);
  article.appendChild(clone);
  return article;
}

function buildGithubSelectionRoot(root: HTMLElement): HTMLElement {
  const article = document.createElement("article");
  const clone = root.cloneNode(true) as HTMLElement;
  cleanupGithubRichText(clone);
  normalizeGithubAssets(clone);
  article.appendChild(clone);
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
      title:
        getText(adaptedRoot.querySelector("h1")) ||
        getText(root.querySelector("nav[aria-label='Breadcrumbs'] li:last-child span")) ||
        context.documentTitle,
      author: getGithubAuthor(context.sourceUrl) || context.author
    });
  },
  transformSelection(root, context) {
    return makeAdaptedContent(buildGithubSelectionRoot(root), context, {
      site: "github",
      author: getGithubAuthor(context.sourceUrl) || context.author
    });
  }
};
