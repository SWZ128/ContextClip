import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

function buildWeixinRoot(root: HTMLElement): HTMLElement | null {
  const content = root.querySelector<HTMLElement>("#js_content, #img-content");
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title = root.querySelector<HTMLElement>("#activity-name, .rich_media_title");
  const meta = root.querySelector<HTMLElement>(".rich_media_meta_list");

  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  if (meta) {
    article.appendChild(meta.cloneNode(true));
  }

  article.appendChild(content.cloneNode(true));
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
