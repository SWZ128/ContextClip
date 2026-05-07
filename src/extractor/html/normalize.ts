import type { BlockNode, DocumentMetadata, InlineNode, NormalizedDocument } from "../domain/types";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul"
]);

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

type NormalizeOptions = {
  preserveSoftBreaks: boolean;
  inlineContainersAsInline: boolean;
};

function mergeInlineText(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];

  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") {
      last.value += node.value;
      continue;
    }
    if (node.type === "softBreak" && last?.type === "softBreak") {
      continue;
    }
    if (node.type === "lineBreak" && last?.type === "lineBreak") {
      continue;
    }
    merged.push(node);
  }

  while (merged[0]?.type === "lineBreak" || merged[0]?.type === "softBreak") {
    merged.shift();
  }

  while (merged[merged.length - 1]?.type === "lineBreak" || merged[merged.length - 1]?.type === "softBreak") {
    merged.pop();
  }

  const first = merged[0];
  if (first?.type === "text") {
    first.value = first.value.replace(/^\s+/, "");
    if (!first.value) {
      merged.shift();
    }
  }

  const last = merged[merged.length - 1];
  if (last?.type === "text") {
    last.value = last.value.replace(/\s+$/, "");
    if (!last.value) {
      merged.pop();
    }
  }

  return merged.filter((node) => node.type !== "text" || node.value.length > 0);
}

function normalizeTextNode(text: string, options: NormalizeOptions): InlineNode[] {
  if (!options.preserveSoftBreaks) {
    const value = collapseWhitespace(text);
    return value ? [{ type: "text", value }] : [];
  }

  const compact = text.replace(/\s+/g, "");
  if (!compact) {
    return [{ type: "text", value: " " }];
  }

  if (!/[A-Za-z0-9\u3400-\u9fff]/.test(compact)) {
    const value = collapseWhitespace(text);
    return value ? [{ type: "text", value }] : [];
  }

  const normalized = text.replace(/\r\n?/g, "\n");
  const parts = normalized.split("\n");
  const nodes: InlineNode[] = [];

  parts.forEach((part, index) => {
    const value = part.replace(/[ \t\f\v]+/g, " ");
    if (value) {
      nodes.push({ type: "text", value });
    }
    if (index < parts.length - 1) {
      nodes.push({ type: "softBreak" });
    }
  });

  return nodes;
}

function normalizeInlineChildren(node: ParentNode, options: NormalizeOptions): InlineNode[] {
  const nodes: InlineNode[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      nodes.push(...normalizeTextNode(child.textContent ?? "", options));
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const tag = child.tagName.toLowerCase();
    switch (tag) {
      case "br":
        nodes.push({ type: "lineBreak" });
        break;
      case "strong":
      case "b": {
        const children = normalizeInlineChildren(child, options);
        if (children.length > 0) {
          nodes.push({ type: "strong", children });
        }
        break;
      }
      case "em":
      case "i": {
        const children = normalizeInlineChildren(child, options);
        if (children.length > 0) {
          nodes.push({ type: "em", children });
        }
        break;
      }
      case "code":
        if (!child.closest("pre")) {
          const value = child.textContent?.replace(/\s+/g, " ").trim();
          if (value) {
            nodes.push({ type: "inlineCode", value });
          }
        }
        break;
      case "img": {
        const src = (child as HTMLImageElement).currentSrc || child.getAttribute("src") || "";
        if (src) {
          nodes.push({ type: "inlineImage", src, alt: child.getAttribute("alt") || undefined });
        }
        break;
      }
      case "a": {
        const href = child instanceof HTMLAnchorElement ? child.href : child.getAttribute("href") ?? "";
        const children = normalizeInlineChildren(child, options);
        if (
          children.length === 1 &&
          children[0].type === "inlineImage" &&
          (href === children[0].src || href.startsWith("file:"))
        ) {
          nodes.push(children[0]);
          break;
        }
        nodes.push({
          type: "link",
          href,
          children: children.length > 0 ? children : [{ type: "text", value: href }]
        });
        break;
      }
      default:
        nodes.push(...normalizeInlineChildren(child, options));
        break;
    }
  }

  return mergeInlineText(nodes);
}

function elementText(node: Element): string {
  return collapseWhitespace(node.textContent ?? "").trim();
}

function normalizeTable(element: HTMLTableElement, options: NormalizeOptions): BlockNode[] {
  const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).map((cell) => normalizeInlineChildren(cell, options))
  );

  return rows.length > 0 ? [{ type: "table", rows }] : [];
}

function hasBlockChildren(node: ParentNode): boolean {
  return Array.from(node.childNodes).some(
    (child) => child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName.toLowerCase())
  );
}

function normalizeListItem(item: HTMLLIElement, options: NormalizeOptions): BlockNode[] {
  if (!hasBlockChildren(item)) {
    const children = normalizeInlineChildren(item, options);
    return children.length > 0 ? [{ type: "paragraph", children }] : [];
  }

  const blocks = normalizeBlockChildren(item, options);
  if (blocks.length > 0) {
    return blocks;
  }

  const children = normalizeInlineChildren(item, options);
  return children.length > 0 ? [{ type: "paragraph", children }] : [];
}

function inlineBlockFromNode(node: HTMLElement, options: NormalizeOptions): BlockNode[] {
  const children = normalizeInlineChildren(node, options);
  return children.length > 0 ? [{ type: "paragraph", children }] : [];
}

function normalizeList(element: HTMLElement, ordered: boolean, options: NormalizeOptions): BlockNode[] {
  const items: BlockNode[][] = [];
  let currentItem: BlockNode[] | null = null;

  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLLIElement) {
      currentItem = normalizeListItem(child, options);
      if (currentItem.length > 0) {
        items.push(currentItem);
      }
      continue;
    }

    const tag = child.tagName.toLowerCase();
    if ((tag === "ul" || tag === "ol") && items.length > 0) {
      const nested = normalizeList(child, tag === "ol", options);
      if (nested.length > 0) {
        items[items.length - 1].push(...nested);
      }
    }
  }

  return items.length > 0 ? [{ type: "list", ordered, items }] : [];
}

function detectCodeLanguage(node: HTMLElement): string | undefined {
  const code = node.querySelector("code");
  const direct =
    code?.getAttribute("data-language") ||
    code?.className.match(/language-([a-z0-9_+-]+)/i)?.[1] ||
    node.getAttribute("lang") ||
    code?.getAttribute("lang");
  const highlightClass =
    node.closest<HTMLElement>("[class*='highlight-source-']")?.className.match(/highlight-source-([a-z0-9_+-]+)/i)?.[1] ||
    node.closest<HTMLElement>("[class*='highlight-text-']")?.className.match(/highlight-text-([a-z0-9_+-]+)/i)?.[1] ||
    node.parentElement?.className.match(/highlight-source-([a-z0-9_+-]+)/i)?.[1] ||
    node.parentElement?.className.match(/highlight-text-([a-z0-9_+-]+)/i)?.[1] ||
    node.className.match(/highlight-source-([a-z0-9_+-]+)/i)?.[1];
  const language = (direct || highlightClass || "").toLowerCase();

  if (!language) {
    return undefined;
  }
  if (language === "shell" || language === "sh") {
    return "bash";
  }
  if (language === "plaintext") {
    return "text";
  }
  if (language === "md") {
    return "markdown";
  }
  if (language === "c++") {
    return "cpp";
  }
  return language;
}

function normalizeBlockNode(node: Node, options: NormalizeOptions): BlockNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = collapseWhitespace(node.textContent ?? "").trim();
    return value ? [{ type: "paragraph", children: [{ type: "text", value }] }] : [];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const depth = Number.parseInt(tag.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const children = normalizeInlineChildren(node, options);
      return children.length > 0 ? [{ type: "heading", depth, children }] : [];
    }
    case "p": {
      const children = normalizeInlineChildren(node, options);
      return children.length > 0 ? [{ type: "paragraph", children }] : [];
    }
    case "pre": {
      const code = node.querySelector("code");
      const language = detectCodeLanguage(node);
      const raw = (code?.textContent ?? node.textContent ?? "").trimEnd();
      return raw ? [{ type: "code", language: language || undefined, code: raw }] : [];
    }
    case "ul":
    case "ol": {
      return normalizeList(node, tag === "ol", options);
    }
    case "blockquote": {
      if (!hasBlockChildren(node)) {
        const inline = inlineBlockFromNode(node, options);
        return inline.length > 0 ? [{ type: "quote", children: inline }] : [];
      }
      const children = normalizeBlockChildren(node, options);
      return children.length > 0 ? [{ type: "quote", children }] : [];
    }
    case "table":
      return normalizeTable(node as HTMLTableElement, options);
    case "details": {
      const summaryElement = Array.from(node.children).find((child) => child.tagName.toLowerCase() === "summary");
      const summary = summaryElement ? normalizeInlineChildren(summaryElement, options) : undefined;
      const fragment = node.ownerDocument.createElement("div");
      Array.from(node.childNodes).forEach((child) => {
        if (child !== summaryElement) {
          fragment.appendChild(child.cloneNode(true));
        }
      });
      const children = normalizeBlockChildren(fragment, options);
      return [{ type: "details", summary, children }];
    }
    case "img": {
      const src = (node as HTMLImageElement).currentSrc || node.getAttribute("src") || "";
      return src ? [{ type: "image", src, alt: node.getAttribute("alt") || undefined }] : [];
    }
    case "audio":
    case "video": {
      const media = node as HTMLMediaElement;
      const src = media.currentSrc || media.src || node.getAttribute("src") || "";
      return src ? [{ type: "media", kind: tag, src }] : [];
    }
    case "hr":
      return [{ type: "thematicBreak" }];
    case "article":
    case "main":
    case "section":
    case "div":
    case "figure":
    case "header":
    case "footer":
      return normalizeBlockChildren(node, options);
    default: {
      if (options.inlineContainersAsInline && !hasBlockChildren(node)) {
        return inlineBlockFromNode(node, options);
      }
      const nested = normalizeBlockChildren(node, options);
      return nested.length > 0 ? nested : inlineBlockFromNode(node, options);
    }
  }
}

export function normalizeBlockChildren(node: ParentNode, options: NormalizeOptions): BlockNode[] {
  return Array.from(node.childNodes).flatMap((child) => normalizeBlockNode(child, options));
}

export function normalizeRoot(root: HTMLElement, meta: DocumentMetadata): NormalizedDocument {
  const options: NormalizeOptions = {
    preserveSoftBreaks: meta.site === "github",
    inlineContainersAsInline: meta.site === "arxiv"
  };

  return {
    meta,
    blocks: normalizeBlockChildren(root, options)
  };
}
