export type DocumentMetadata = {
  title: string;
  sourceUrl: string;
  site: string;
  author?: string;
  capturedAt: string;
  selectionHint?: string;
};

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "inlineCode"; value: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "lineBreak" };

export type BlockNode =
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: BlockNode[][] }
  | { type: "code"; language?: string; code: string }
  | { type: "quote"; children: BlockNode[] }
  | { type: "table"; rows: string[][] }
  | { type: "image"; src: string; alt?: string }
  | { type: "media"; kind: "audio" | "video"; src: string }
  | { type: "thematicBreak" };

export type NormalizedDocument = {
  meta: DocumentMetadata;
  blocks: BlockNode[];
};
