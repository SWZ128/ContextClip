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
  capturedAt: string;
  selectionHint?: string;
  markdown: string;
  fileName: string;
  needsZip: boolean;
  assets: AssetEntry[];
};

export type RuntimeMessage =
  | { type: "ping" }
  | { type: "extract-page" }
  | { type: "start-selection" }
  | { type: "selection-complete"; payload: ExtractResult }
  | { type: "store-result"; payload: ExtractResult; tabId: number }
  | { type: "get-last-result"; tabId: number };
