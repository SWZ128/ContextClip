export type ExtractMode = "page" | "selection";

export type AssetEntry = {
  url: string;
  kind: "image" | "audio" | "video";
  alt?: string;
  downloaded: boolean;
};

export type ExtractResult = {
  mode: ExtractMode;
  title: string;
  site: string;
  sourceUrl: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
  capturedAt: string;
  selectionHint?: string;
  markdown: string;
  fileName: string;
  needsZip: boolean;
  assets: AssetEntry[];
};

function escapeYamlValue(value: string): string {
  if (value.includes("\n")) {
    const lines = value.split("\n").map((l) => escapeYamlValue(l));
    return lines.join("\n  ");
  }
  const single = value.replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${single}'`;
}

export function withFrontmatter(result: ExtractResult): string {
  const lines = [
    "---",
    `title: ${escapeYamlValue(result.title)}`,
    `source_url: ${escapeYamlValue(result.sourceUrl)}`,
    `site: ${escapeYamlValue(result.site)}`,
    `author: ${escapeYamlValue(result.author ?? "")}`,
    ...(result.createdAt ? [`created_at: ${escapeYamlValue(result.createdAt)}`] : []),
    ...(result.modifiedAt ? [`modified_at: ${escapeYamlValue(result.modifiedAt)}`] : []),
    `captured_at: ${escapeYamlValue(result.capturedAt)}`,
    `mode: ${escapeYamlValue(result.mode)}`,
    `selection_hint: ${escapeYamlValue(result.selectionHint ?? "")}`,
    "---"
  ];

  return `${lines.join("\n")}\n\n${result.markdown}\n`;
}
