const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "aside",
  "footer",
  "form",
  "[role='dialog']",
  "[aria-hidden='true']",
  "#saladict",
  "#immersiveTranslator",
  "#wechatsync-fab",
  ".comment-app",
  ".Comments-container",
  ".RichContent-actions",
  ".RichContent-cover",
  ".RichContent-actions.is-fixed",
  ".ContentItem-actions",
  ".ContentItem-time",
  ".RichText-actions",
  ".AppHeader",
  ".Sticky",
  ".CornerButtons",
  ".Rich_media_tool",
  ".rich_media_extra",
  ".js_uneditable_area",
  "#js_tags",
  "#js_pc_qr_code",
  "#js_share_content",
  "#js_append_comment",
  "#js_hotspot_area",
  "#js_preview_reward_author",
  ".original_primary_card",
  ".wx_profile_card_inner",
  ".code-toolbar",
  ".react-code-size-details",
  ".js-timeline-item",
  ".file-actions",
  ".prc-UnderlineNav-UnderlineNavItem-syRjR",
  ".Link--primary[href^='#user-content-']"
];

function absolutize(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}

function decodeHexUrl(value: string): string | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return undefined;
  }

  try {
    let output = "";
    for (let index = 0; index < value.length; index += 2) {
      output += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16));
    }
    return /^https?:\/\//i.test(output) ? output : undefined;
  } catch {
    return undefined;
  }
}

function normalizeGithubCamoUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname !== "camo.githubusercontent.com") {
      return value;
    }

    const encoded = url.pathname.split("/").filter(Boolean).at(-1) || "";
    return decodeHexUrl(encoded) || value;
  } catch {
    return value;
  }
}

function isPlaceholderDataImage(value: string): boolean {
  return /^data:image\/svg\+xml/i.test(value);
}

function isAbsoluteWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveImageSrc(element: HTMLImageElement): string {
  const canonical = element.getAttribute("data-canonical-src") || "";
  if (canonical && !isPlaceholderDataImage(canonical)) {
    return canonical;
  }

  const dataSrc = element.getAttribute("data-src") || "";
  if (dataSrc && !isPlaceholderDataImage(dataSrc)) {
    return dataSrc;
  }

  const src = element.getAttribute("src") || "";
  if (src && isAbsoluteWebUrl(src) && !isPlaceholderDataImage(src)) {
    return src;
  }

  const lazy =
    element.getAttribute("data-actualsrc") ||
    element.getAttribute("data-original") ||
    "";
  return lazy || src;
}

function normalizeMedia(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("img").forEach((node) => {
    const element = node as HTMLImageElement;
    const src = resolveImageSrc(element);
    if (!src || isPlaceholderDataImage(src)) {
      element.remove();
      return;
    }

    element.setAttribute("src", normalizeGithubCamoUrl(absolutize(src, baseUrl)));
  });

  root.querySelectorAll("audio, video, source").forEach((node) => {
    const element = node as HTMLMediaElement | HTMLSourceElement;
    const src = element.getAttribute("src") || "";
    if (src) {
      element.setAttribute("src", absolutize(src, baseUrl));
    }
  });
}

function normalizeLinks(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href");
    if (href) {
      node.setAttribute("href", normalizeGithubCamoUrl(absolutize(href, baseUrl)));
    }
  });
}

function normalizeCodeLanguage(root: HTMLElement): void {
  root.querySelectorAll("pre code").forEach((node) => {
    const block = node as HTMLElement;
    if (block.getAttribute("data-language")) {
      return;
    }

    const match = block.className.match(/language-([a-z0-9_-]+)/i);
    if (match) {
      block.setAttribute("data-language", match[1]);
    }
  });
}

export function preprocessRoot(root: HTMLElement, baseUrl = document.baseURI): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const selector of NOISE_SELECTORS) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }

  normalizeMedia(clone, baseUrl);
  normalizeLinks(clone, baseUrl);
  normalizeCodeLanguage(clone);

  return clone;
}
