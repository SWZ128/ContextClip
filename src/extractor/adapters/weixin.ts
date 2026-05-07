import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

function removeLeadingMediaOnlyBlocks(root: HTMLElement): void {
  let current = root.firstElementChild as HTMLElement | null;

  while (current) {
    const next = current.nextElementSibling as HTMLElement | null;
    const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const hasMedia = Boolean(current.querySelector("img, video, audio")) || current.matches("img, video, audio");

    if (text || !hasMedia) {
      return;
    }

    current.remove();
    current = next;
  }
}

function buildWeixinRoot(root: HTMLElement): HTMLElement | null {
  const content = root.querySelector<HTMLElement>("#js_content") || root.querySelector<HTMLElement>("#img-content");
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title = root.querySelector<HTMLElement>("#activity-name, .rich_media_title");

  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  const body = content.cloneNode(true) as HTMLElement;
  body.querySelectorAll("#activity-name, .rich_media_title, #meta_content, .rich_media_meta_list").forEach((element) => {
    element.remove();
  });
  removeLeadingMediaOnlyBlocks(body);
  article.appendChild(body);
  return article;
}

export const weixinAdapter: DomainAdapter = {
  name: "weixin",
  match(root, context) {
    return context.site === "weixin" && Boolean(buildWeixinRoot(root));
  },
  transform(root, context) {
    const adaptedRoot = buildWeixinRoot(root);
    if (!adaptedRoot) {
      return null;
    }

    return makeAdaptedContent(adaptedRoot, context, {
      site: "weixin",
      title: getText(adaptedRoot.querySelector("h1")) || context.documentTitle
    });
  }
};
