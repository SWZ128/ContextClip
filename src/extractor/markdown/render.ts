import type { BlockNode, InlineNode, NormalizedDocument } from "../domain/types";

function longestBacktickRun(value: string): number {
  let max = 0;
  let current = 0;
  for (const ch of value) {
    if (ch === "`") {
      current += 1;
      if (current > max) {
        max = current;
      }
    } else {
      current = 0;
    }
  }
  return max;
}

function escapeText(value: string, inHeading: boolean): string {
  return inHeading ? value.replace(/([`])/g, "\\$1") : value.replace(/([`])/g, "\\$1");
}

function renderInline(nodes: InlineNode[], inHeading = false): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeText(node.value, inHeading);
        case "strong":
          return `**${renderInline(node.children, inHeading)}**`;
        case "em":
          return `*${renderInline(node.children, inHeading)}*`;
        case "inlineCode": {
          const backtickCount = longestBacktickRun(node.value);
          const fence = "`".repeat(backtickCount + 1);
          const pad = node.value.startsWith("`") ? " " : "";
          const padEnd = node.value.endsWith("`") ? " " : "";
          return `${fence}${pad}${node.value}${padEnd}${fence}`;
        }
        case "inlineImage":
          return node.src ? `![${node.alt ?? ""}](${node.src})` : "";
        case "link": {
          const label = renderInline(node.children, inHeading).trim() || node.href;
          return node.href ? `[${label}](${node.href})` : label;
        }
        case "softBreak":
          return "\n";
        case "lineBreak":
          return "\\\n";
      }
    })
    .join("");
}

function block(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `${trimmed}\n\n` : "";
}

function isIgnorableInline(node: InlineNode): boolean {
  return (
    (node.type === "text" && node.value.trim().length === 0) ||
    node.type === "softBreak" ||
    node.type === "lineBreak"
  );
}

function renderImageParagraph(nodes: InlineNode[]): string | null {
  const meaningful = nodes.filter((node) => !isIgnorableInline(node));
  if (meaningful.length === 0 || meaningful.some((node) => node.type !== "inlineImage")) {
    return null;
  }

  const lines = meaningful
    .map((node) => (node.type === "inlineImage" && node.src ? `![${node.alt ?? ""}](${node.src})` : ""))
    .filter(Boolean);
  return lines.length > 0 ? `${lines.join("\n")}\n\n` : null;
}

function stripCosmeticEscapes(markdown: string): string {
  const lines = markdown.split("\n");
  let inFence = false;

  return lines
    .map((line) => {
      if (/^```/.test(line)) {
        inFence = !inFence;
        return line;
      }

      if (inFence) {
        return line;
      }

      return line.replace(/\\([[\]_()*])/g, "$1");
    })
    .join("\n");
}

function renderListItem(blocks: BlockNode[]): string {
  return blocks
    .map((b) => renderBlock(b).trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n/g, "\n  ");
}

function renderTable(rows: InlineNode[][][]): string {
  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const headerLine = `| ${header.map((cell) => renderInline(cell)).join(" | ")} |`;
  const dividerLine = `|${header.map(() => "---").join("|")}|`;
  const bodyLines = body.map((row) => `| ${row.map((cell) => renderInline(cell)).join(" | ")} |`);
  return `${[headerLine, dividerLine, ...bodyLines].join("\n")}\n\n`;
}

export function renderBlock(node: BlockNode): string {
  switch (node.type) {
    case "heading":
      return block(`${"#".repeat(node.depth)} ${renderInline(node.children, true)}`);
    case "paragraph": {
      const imageOnly = renderImageParagraph(node.children);
      return imageOnly ?? block(renderInline(node.children));
    }
    case "list": {
      const lines = node.items.map((item, index) => {
        const prefix = node.ordered ? `${index + 1}. ` : "- ";
        return `${prefix}${renderListItem(item)}`;
      });
      return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
    }
    case "code":
      return `\n\`\`\`${node.language ?? ""}\n${node.code}\n\`\`\`\n\n`;
    case "quote": {
      const content = renderBlocks(node.children)
        .trim()
        .replace(/\\\n/g, "\n")
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
      return content ? `${content}\n\n` : "";
    }
    case "table":
      return renderTable(node.rows);
    case "details": {
      const summary = node.summary && node.summary.length > 0 ? `<summary>${renderInline(node.summary)}</summary>\n\n` : "";
      const content = renderBlocks(node.children).trim();
      return `<details>\n${summary}${content}\n\n</details>\n\n`;
    }
    case "image":
      return node.src ? `![${node.alt ?? ""}](${node.src})\n\n` : "";
    case "media":
      return node.src ? `[${node.kind}](${node.src})\n\n` : "";
    case "thematicBreak":
      return "\n---\n\n";
  }
}

export function renderBlocks(blocks: BlockNode[]): string {
  return stripCosmeticEscapes(
    blocks
      .map((blockNode) => renderBlock(blockNode))
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+$/gm, "")
      .trim()
  );
}

export function renderDocument(document: NormalizedDocument): string {
  return renderBlocks(document.blocks);
}
