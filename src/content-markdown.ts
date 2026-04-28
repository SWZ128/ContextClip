function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeInline(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([*_`[\]])/g, "\\$1");
}

function textContent(node: Node): string {
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function block(children: string): string {
  const trimmed = children.trim();
  return trimmed ? `${trimmed}\n\n` : "";
}

function renderChildren(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) => renderNode(child))
    .join("");
}

function renderList(element: HTMLElement, ordered: boolean): string {
  const items = Array.from(element.children)
    .filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
    .map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : "- ";
      const content = renderChildren(item).trim().replace(/\n/g, "\n  ");
      return `${prefix}${content}`;
    });

  return items.length > 0 ? `${items.join("\n")}\n\n` : "";
}

function renderTable(element: HTMLTableElement): string {
  const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).map((cell) => textContent(cell))
  );

  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const headerLine = `| ${header.join(" | ")} |`;
  const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);
  return `${[headerLine, dividerLine, ...bodyLines].join("\n")}\n\n`;
}

function renderNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeInline(node.textContent ?? "");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "h1":
      return block(`# ${renderChildren(node)}`);
    case "h2":
      return block(`## ${renderChildren(node)}`);
    case "h3":
      return block(`### ${renderChildren(node)}`);
    case "h4":
      return block(`#### ${renderChildren(node)}`);
    case "h5":
      return block(`##### ${renderChildren(node)}`);
    case "h6":
      return block(`###### ${renderChildren(node)}`);
    case "p":
      return block(renderChildren(node));
    case "br":
      return "  \n";
    case "strong":
    case "b":
      return `**${renderChildren(node).trim()}**`;
    case "em":
    case "i":
      return `*${renderChildren(node).trim()}*`;
    case "code":
      return node.closest("pre") ? textContent(node) : `\`${textContent(node)}\``;
    case "pre": {
      const code = node.querySelector("code");
      const language = code?.getAttribute("data-language") ?? code?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ?? "";
      const raw = (code?.textContent ?? node.textContent ?? "").trimEnd();
      return `\n\`\`\`${language}\n${raw}\n\`\`\`\n\n`;
    }
    case "a": {
      const href = node.getAttribute("href") ?? "";
      const label = renderChildren(node).trim() || href;
      return href ? `[${label}](${href})` : label;
    }
    case "img": {
      const src = node.getAttribute("src") || node.getAttribute("data-src") || "";
      const alt = node.getAttribute("alt") || "image";
      return src ? `![${alt}](${src})` : "";
    }
    case "ul":
      return renderList(node, false);
    case "ol":
      return renderList(node, true);
    case "blockquote": {
      const content = renderChildren(node)
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `${content}\n\n`;
    }
    case "table":
      return renderTable(node as HTMLTableElement);
    case "audio":
    case "video": {
      const media = node as HTMLMediaElement;
      const src = media.currentSrc || media.src || "";
      return src ? `[${tag}](${src})\n\n` : "";
    }
    case "hr":
      return "\n---\n\n";
    default:
      return renderChildren(node);
  }
}

export function toMarkdown(node: HTMLElement): string {
  return renderChildren(node)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function withFrontmatterLocal(result: {
  title: string;
  sourceUrl: string;
  site: string;
  author?: string;
  capturedAt: string;
  mode: string;
  selectionHint?: string;
  markdown: string;
}): string {
  const lines = [
    "---",
    `title: "${escapeYaml(result.title)}"`,
    `source_url: "${escapeYaml(result.sourceUrl)}"`,
    `site: "${escapeYaml(result.site)}"`,
    `author: "${escapeYaml(result.author ?? "")}"`,
    `captured_at: "${result.capturedAt}"`,
    `mode: "${result.mode}"`,
    `selection_hint: "${escapeYaml(result.selectionHint ?? "")}"`,
    "---"
  ];

  return `${lines.join("\n")}\n\n${result.markdown}\n`;
}
