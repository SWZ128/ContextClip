const WEIXIN_TAIL_MARKERS = [
  /^(?:\*\*)?END(?:\*\*)?$/,
  /^(?:\*\*)?送你一个新闻盲盒(?:\*\*)?$/,
  /^(?:\*\*)?快来打开看看吧(?:\*\*)?$/,
  /^(?:\*\*)?综合自[:：]/,
  /^(?:\*\*)?编辑[:：]/,
  /^(?:\*\*)?转载请注明/,
  /^(?:\*\*)?编撰\s*[|｜:：]/,
  /^(?:\*\*)?审稿\s*[|｜:：]/,
  /^(?:\*\*)?初审\s*[|｜:：]/,
  /^(?:\*\*)?终审\s*[|｜:：]/
];

function cleanupArxivMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/(Figure \d+:)(?=\S)/g, "$1 ")
        .replace(/(Table \d+:)(?=\S)/g, "$1 ")
        .replace(/\$\s*([^$\n]*?)\s*\$/g, (_match, body) => `$${String(body).trim()}$`)
        .replace(/(Cohen’s)(\$[^$\n]+\$)/g, "$1 $2")
        .replace(/(\$[^$\n]+\$)(?=\d)/g, "$1 ")
        .replace(/([A-Za-z)])\.([A-Z0-9$])/g, "$1. $2")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanupGithubMarkdown(markdown: string): string {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      lines[index] = "--------------------------------------------------------------------------------";
    }

    if (
      /^\[[^\n]+\]\s*\|$/.test(lines[index] ?? "") &&
      /^\[[^\n]+\](?:\s*\|)?$/.test(lines[index + 1] ?? "")
    ) {
      const merged = [lines[index].trim()];
      while (/^\[[^\n]+\](?:\s*\|)?$/.test(lines[index + 1] ?? "")) {
        merged.push(lines[index + 1].trim());
        index += 1;
      }
      lines[index - merged.length + 1] = merged.join(" ").replace(/\s+/g, " ");
      for (let offset = index - merged.length + 2; offset <= index; offset += 1) {
        lines[offset] = "";
      }
    }

    if (/^\|(?:\s*---\s*\|)+$/.test(lines[index] ?? "") && /^\|.+\|$/.test(lines[index - 1] ?? "")) {
      const cells = lines[index - 1]
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      lines[index] = `|${cells.map((cell) => "-".repeat(Math.max(3, cell.length + 2))).join("|")}|`;
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanupWeixinMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => WEIXIN_TAIL_MARKERS.some((pattern) => pattern.test(line.trim())));
  return (index === -1 ? lines : lines.slice(0, index)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function cleanupMarkdown(site: string, markdown: string): string {
  if (site === "arxiv") {
    return cleanupArxivMarkdown(markdown);
  }

  if (site === "github") {
    return cleanupGithubMarkdown(markdown);
  }

  if (site === "weixin") {
    return cleanupWeixinMarkdown(markdown);
  }

  return markdown;
}
