import type { ExtractResult } from "./types";

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function withFrontmatter(result: ExtractResult): string {
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
