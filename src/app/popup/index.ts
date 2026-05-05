import JSZip from "jszip";
import { type ExtractResult, withFrontmatter } from "../../contracts/extract-result";
import type { RuntimeMessage } from "../../contracts/runtime";
import "./popup.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup mount node not found.");
}

let lastResult: ExtractResult | null = null;

app.innerHTML = `
  <main class="shell">
    <header class="hero panel">
      <div class="hero-copy">
        <h1>ContextClip</h1>
        <p class="subhead">Clip web context to clean Markdown.</p>
      </div>
    </header>

    <section class="action-grid">
      <button id="extract-page" class="action-card action-card-primary">
        <span class="action-kicker">Fast path</span>
        <strong>Copy This Page</strong>
        <span class="action-copy">Extract, clean, then copy Markdown in one click.</span>
      </button>

      <button id="pick-extract" class="action-card action-card-secondary">
        <span class="action-kicker">Precise path</span>
        <strong>Pick & Extract</strong>
        <span class="action-copy">Click a block or drag a rectangle for a precise snippet.</span>
      </button>
    </section>

    <section class="panel workflow">
      <div class="section-head">
        <div>
          <p class="section-eyebrow">Result</p>
          <h2>Saved output</h2>
        </div>
        <div class="status-pill" id="status-pill">Idle</div>
      </div>

      <div class="meta-row">
        <span class="meta-chip" id="mode">No result</span>
        <span class="meta-chip" id="asset-count">0 assets</span>
      </div>

      <div class="action-row">
        <button id="download-result" class="mini-action" disabled>Download File</button>
        <button id="download-zip" class="mini-action" disabled>Download ZIP</button>
      </div>
    </section>

    <section class="panel preview-panel">
      <div class="section-head">
        <div>
          <p class="section-eyebrow">Preview</p>
          <h2 id="preview-title">Nothing extracted yet</h2>
        </div>
      </div>

      <pre id="preview">Click Copy This Page or Pick & Extract to generate Markdown.</pre>
    </section>
  </main>
`;

const statusNode = document.querySelector<HTMLDivElement>("#status-pill")!;
const modeNode = document.querySelector<HTMLSpanElement>("#mode")!;
const assetCountNode = document.querySelector<HTMLSpanElement>("#asset-count")!;
const previewTitleNode = document.querySelector<HTMLHeadingElement>("#preview-title")!;
const previewNode = document.querySelector<HTMLPreElement>("#preview")!;

document.querySelector<HTMLButtonElement>("#extract-page")!.addEventListener("click", async () => {
  const result = await runExtractPage();
  if (!result) {
    return;
  }

  await navigator.clipboard.writeText(withFrontmatter(result));
  setStatus("Copied");
});

document.querySelector<HTMLButtonElement>("#pick-extract")!.addEventListener("click", async () => {
  await runPickExtract();
});

document.querySelector<HTMLButtonElement>("#download-result")!.addEventListener("click", async () => {
  if (!lastResult) {
    return;
  }

  try {
    if (lastResult.needsZip) {
      await downloadZipLocally(lastResult);
    } else {
      await downloadMarkdownLocally(lastResult);
    }
    setStatus("Downloaded");
  } catch {
    setStatus("Download failed");
  }
});

document.querySelector<HTMLButtonElement>("#download-zip")!.addEventListener("click", async () => {
  if (!lastResult) {
    return;
  }

  try {
    await downloadZipLocally(lastResult);
    setStatus("Downloaded ZIP");
  } catch {
    setStatus("ZIP download failed");
  }
});

void hydrateLastResult();

async function hydrateLastResult(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab.id) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "get-last-result",
    tabId: tab.id
  } satisfies RuntimeMessage);

  if (response.result) {
    lastResult = response.result as ExtractResult;
    renderResult(lastResult);
  }
}

async function runExtractPage(): Promise<ExtractResult | null> {
  const tab = await getActiveTab();
  if (!tab.id) {
    setStatus("No active tab");
    return null;
  }

  try {
    await ensurePageMessaging(tab.id);
    setStatus("Extracting");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "extract-page" } satisfies RuntimeMessage);
    if (!response?.result) {
      throw new Error((response?.error as string | undefined) || "Extract failed");
    }
    lastResult = response.result as ExtractResult;

    await chrome.runtime.sendMessage({
      type: "store-result",
      tabId: tab.id,
      payload: lastResult
    } satisfies RuntimeMessage);

    renderResult(lastResult);
    return lastResult;
  } catch (error) {
    setStatus(toUserMessage(error));
    return null;
  }
}

async function runPickExtract(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab.id) {
    setStatus("No active tab");
    return;
  }

  try {
    await ensurePageMessaging(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "start-selection" } satisfies RuntimeMessage);
    setStatus("Pick block in page");
    window.close();
  } catch (error) {
    setStatus(toUserMessage(error));
  }
}

async function ensurePageMessaging(tabId: number): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies RuntimeMessage);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies RuntimeMessage);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

async function downloadMarkdownLocally(result: ExtractResult): Promise<void> {
  const markdown = withFrontmatter(result);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: result.fileName.replace(/\.zip$/, ".md"),
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

async function downloadZipLocally(result: ExtractResult): Promise<void> {
  const packaged = await packageAssets(result);
  const manifest = {
    title: result.title,
    source_url: result.sourceUrl,
    site: result.site,
    captured_at: result.capturedAt,
    mode: result.mode,
    assets: packaged.assets
  };

  const zip = new JSZip();
  zip.file("page.md", packaged.markdown);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const asset of packaged.files) {
    zip.file(asset.path, asset.blob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: result.fileName.replace(/\.md$/, ".zip"),
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Cannot access")) {
    return "Page blocked by Chrome";
  }

  if (message.includes("Receiving end does not exist")) {
    return "Refresh page and retry";
  }

  return "Action failed";
}

type PackagedAsset = {
  path: string;
  blob: Blob;
};

type PackagedZip = {
  markdown: string;
  assets: ExtractResult["assets"];
  files: PackagedAsset[];
};

function getAssetExtension(url: string, contentType: string | null, kind: ExtractResult["assets"][number]["kind"]): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {
    // ignore
  }

  const fromType = contentType?.split(";")[0].split("/")[1]?.toLowerCase();
  if (fromType) {
    if (fromType === "jpeg") {
      return "jpg";
    }
    if (fromType === "svg+xml") {
      return "svg";
    }
    return fromType;
  }

  if (kind === "image") {
    return "png";
  }
  if (kind === "audio") {
    return "mp3";
  }
  return "mp4";
}

function getAssetBaseName(index: number, kind: ExtractResult["assets"][number]["kind"]): string {
  if (kind === "image") {
    return `image-${index + 1}`;
  }
  if (kind === "audio") {
    return `audio-${index + 1}`;
  }
  return `video-${index + 1}`;
}

function replaceAssetReferences(markdown: string, replacements: Array<{ from: string; to: string }>): string {
  let nextMarkdown = markdown;
  for (const replacement of replacements) {
    nextMarkdown = nextMarkdown.split(replacement.from).join(replacement.to);
  }
  return nextMarkdown;
}

async function packageAssets(result: ExtractResult): Promise<PackagedZip> {
  const replacements: Array<{ from: string; to: string }> = [];
  const files: PackagedAsset[] = [];
  const assets = await Promise.all(
    result.assets.map(async (asset, index) => {
      try {
        const response = await fetch(asset.url, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const ext = getAssetExtension(asset.url, response.headers.get("content-type"), asset.kind);
        const path = `assets/${getAssetBaseName(index, asset.kind)}.${ext}`;
        files.push({ path, blob });
        replacements.push({ from: asset.url, to: path });
        return {
          ...asset,
          url: path,
          downloaded: true
        };
      } catch {
        return {
          ...asset,
          downloaded: false
        };
      }
    })
  );

  return {
    markdown: replaceAssetReferences(withFrontmatter(result), replacements),
    assets,
    files
  };
}

function renderResult(result: ExtractResult): void {
  setStatus("Ready");
  modeNode.textContent = result.mode === "selection" ? "Picked block" : "Whole page";
  assetCountNode.textContent = result.needsZip
    ? `ZIP export · ${result.assets.length} asset${result.assets.length === 1 ? "" : "s"}`
    : `${result.assets.length} asset${result.assets.length === 1 ? "" : "s"}`;
  previewTitleNode.textContent = result.title;
  previewNode.textContent = result.markdown.slice(0, 1400) || "(empty)";
  document.querySelector<HTMLButtonElement>("#download-result")!.disabled = false;
  document.querySelector<HTMLButtonElement>("#download-zip")!.disabled = false;
}

function setStatus(text: string): void {
  statusNode.textContent = text;
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
