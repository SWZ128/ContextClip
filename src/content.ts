import { extractCurrentPage, extractElement } from "./content-extract";
import { withFrontmatterLocal } from "./content-markdown";
import type { ExtractResult, RuntimeMessage } from "./lib/types";

const OVERLAY_ID = "md-context-claw-overlay";
const TOOLBAR_ID = "md-context-claw-toolbar";
const IGNORE_CLICK_ATTR = "data-md-context-claw-ignore";

let hoveredElement: HTMLElement | null = null;
let cleanupSelectionMode: (() => void) | null = null;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "extract-page") {
    sendResponse({ result: extractCurrentPage() });
    return false;
  }

  if (message.type === "start-selection") {
    activateSelectionMode();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function activateSelectionMode(): void {
  cleanupSelectionMode?.();
  const theme = getHostTheme();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    `outline:2px solid ${theme.accent}`,
    `background:${theme.overlay}`,
    "border-radius:14px",
    `box-shadow:0 0 0 1px ${theme.overlayBorder}, 0 18px 36px rgba(15,23,42,0.12)`,
    "transition:all 120ms ease"
  ].join(";");

  const toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "top:16px",
    "right:16px",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:10px 12px",
    `background:${theme.surface}`,
    `color:${theme.text}`,
    "border-radius:14px",
    `border:1px solid ${theme.line}`,
    "font:13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    "box-shadow:0 18px 44px rgba(15,23,42,0.16)",
    "backdrop-filter:blur(16px)"
  ].join(";");
  toolbar.innerHTML = `
    <span data-role="label">Pick block</span>
    <button data-action="copy">Copy</button>
    <button data-action="download">Download</button>
    <button data-action="cancel">Cancel</button>
  `;

  const label = toolbar.querySelector<HTMLElement>("[data-role='label']")!;
  label.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "min-height:36px",
    "padding:0 2px 0 0",
    "font-weight:600",
    "white-space:nowrap"
  ].join(";");

  for (const button of toolbar.querySelectorAll("button")) {
    const action = button.getAttribute("data-action");
    (button as HTMLButtonElement).style.cssText = [
      "appearance:none",
      "border:0",
      "min-width:88px",
      "height:36px",
      "border-radius:10px",
      "padding:0 14px",
      "cursor:pointer",
      "font:inherit",
      "font-weight:600",
      "transition:transform 120ms ease, background-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
      action === "copy"
        ? `background:${theme.accent};color:${theme.accentText};box-shadow:inset 0 0 0 1px ${theme.accent}`
        : action === "download"
          ? `background:${theme.soft};color:${theme.accent};box-shadow:inset 0 0 0 1px ${theme.softBorder}`
          : `background:${theme.button};color:${theme.text};box-shadow:inset 0 0 0 1px ${theme.line}`
    ].join(";");
  }

  let currentResult: ExtractResult | null = null;
  let pinnedElement: HTMLElement | null = null;

  const handleMove = (event: MouseEvent) => {
    if (pinnedElement) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target || target.closest(`#${TOOLBAR_ID}`)) {
      return;
    }

    hoveredElement = pickSemanticElement(target);
    if (!hoveredElement) {
      return;
    }

    const rect = hoveredElement.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };

  const handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${TOOLBAR_ID}`) || target?.closest(`[${IGNORE_CLICK_ATTR}]`)) {
      return;
    }

    if (!hoveredElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pinnedElement = hoveredElement;
    currentResult = extractElement(pinnedElement);
    void chrome.runtime.sendMessage({
      type: "selection-complete",
      payload: currentResult
    } satisfies RuntimeMessage);

    label.textContent = currentResult.title.slice(0, 40);
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!pinnedElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pinnedElement = null;
    label.textContent = currentResult ? currentResult.title.slice(0, 40) : "Pick block";
  };

  const handleToolbar = async (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const action = target?.getAttribute("data-action");
    if (!action) {
      return;
    }

    if (action === "cancel") {
      cleanup();
      return;
    }

    if (!currentResult) {
      label.textContent = "Pick block first";
      return;
    }

    if (action === "copy") {
      await copyText(withFrontmatterLocal(currentResult));
      label.textContent = "Copied";
      return;
    }

    if (action === "download") {
      try {
        downloadSelectionMarkdown(currentResult);
        label.textContent = "Download started";
      } catch {
        label.textContent = "Download failed";
      }
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (pinnedElement) {
        pinnedElement = null;
        label.textContent = currentResult ? currentResult.title.slice(0, 40) : "Pick block";
        return;
      }
      cleanup();
    }
  };

  document.body.append(overlay, toolbar);
  document.addEventListener("mousemove", handleMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  toolbar.addEventListener("click", handleToolbar, true);
  document.addEventListener("keydown", handleEscape, true);

  function cleanup(): void {
    document.removeEventListener("mousemove", handleMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("contextmenu", handleContextMenu, true);
    toolbar.removeEventListener("click", handleToolbar, true);
    document.removeEventListener("keydown", handleEscape, true);
    overlay.remove();
    toolbar.remove();
    hoveredElement = null;
    pinnedElement = null;
    cleanupSelectionMode = null;
  }

  cleanupSelectionMode = cleanup;
}

function getHostTheme(): {
  surface: string;
  text: string;
  line: string;
  accent: string;
  accentText: string;
  soft: string;
  softBorder: string;
  button: string;
  overlay: string;
  overlayBorder: string;
} {
  const host = window.location.hostname;
  const body = getComputedStyle(document.body);
  const baseText = normalizeColor(body.color, "#1f2937");
  const baseSurface = normalizeColor(body.backgroundColor, "#ffffff");

  let accent = normalizeColor(
    getComputedStyle(document.documentElement).getPropertyValue("--color-accent-fg") ||
      getComputedStyle(document.documentElement).getPropertyValue("--MapBrand") ||
      getComputedStyle(document.documentElement).getPropertyValue("--theme-color"),
    "#2563eb"
  );

  if (host.includes("zhihu.com")) {
    accent = "#1772f6";
  } else if (host.includes("weixin.qq.com")) {
    accent = "#07c160";
  } else if (host.includes("github.com")) {
    accent = "#0969da";
  }

  return {
    surface: rgba(baseSurface, 0.96),
    text: baseText,
    line: rgba(baseText, 0.12),
    accent,
    accentText: "#ffffff",
    soft: rgba(accent, 0.12),
    softBorder: rgba(accent, 0.18),
    button: rgba(baseText, 0.05),
    overlay: rgba(accent, 0.1),
    overlayBorder: rgba(accent, 0.18)
  };
}

function normalizeColor(input: string, fallback: string): string {
  const value = input.trim();
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") {
    return fallback;
  }
  return value;
}

function rgba(color: string, alpha: number): string {
  const normalized = color.trim();
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
    const red = Number.parseInt(full.slice(0, 2), 16);
    const green = Number.parseInt(full.slice(2, 4), 16);
    const blue = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const match = normalized.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) {
    return normalized;
  }

  return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
}

function pickSemanticElement(start: HTMLElement): HTMLElement | null {
  const blocked = start.closest(`#${TOOLBAR_ID}`);
  if (blocked) {
    return null;
  }

  let node: HTMLElement | null = start;
  while (node && node !== document.body) {
    if (matchesSemantic(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return start;
}

function matchesSemantic(node: HTMLElement): boolean {
  return Boolean(
    node.matches("article, main, section, pre, table, figure, blockquote") ||
      node.getAttribute("role") === "article" ||
      node.childElementCount >= 2
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function downloadSelectionMarkdown(result: ExtractResult): void {
  const markdown = withFrontmatterLocal(result);
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  const anchor = document.createElement("a");
  anchor.setAttribute(IGNORE_CLICK_ATTR, "true");
  anchor.href = url;
  anchor.download = result.fileName.replace(/\.zip$/, ".md");
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
