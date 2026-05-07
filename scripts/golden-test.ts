import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { JSDOM } from "jsdom";
import { withFrontmatter } from "../src/contracts/extract-result.ts";
import { extractCurrentPage } from "../src/extractor/index.ts";

type FixtureCase = {
  name: string;
  dir: string;
  htmlPath: string;
  expectPath: string;
  site: string;
};

const ROOT = process.cwd();
const TEST_DATA_DIR = path.join(ROOT, "test_data");
const UPDATE = process.argv.includes("--update");
const FORCE = process.argv.includes("--force");
const REAL_FETCH = globalThis.fetch.bind(globalThis);
const CAPTURED_AT_PATTERN = /^captured_at: .+$/m;
const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n\n?/;

function stripFrontmatter(value: string): string {
  return value.replace(FRONTMATTER_PATTERN, "");
}

function normalizeTableDivider(line: string): string {
  if (!/^\|(?:[\s:-]+\|)+$/.test(line.trim())) {
    return line;
  }

  const cells = line
    .trim()
    .split("|")
    .slice(1, -1)
    .map(() => "---");
  return `| ${cells.join(" | ")} |`;
}

function normalizeThematicBreak(line: string): string {
  return /^\s*-{3,}\s*$/.test(line) ? "---" : line;
}

function normalizeCosmeticSpacing(line: string): string {
  return line
    .replace(/([A-Za-z0-9_])\s+([\u3400-\u9fff])/g, "$1$2")
    .replace(/([\u3400-\u9fff])\s+([A-Za-z0-9_])/g, "$1$2");
}

function normalizeAssetVariantUrls(line: string): string {
  return line.replace(
    /(https:\/\/[^)\s?#]+?)(?:_(?:\d+w|r))(\.[a-z0-9]+(?:\?[^)\s#]+)?)/gi,
    "$1$2"
  );
}

function normalizeImageIdentityUrls(line: string): string {
  return line.replace(/https?:\/\/[^)\s]+/g, (raw) => {
    const match = raw.match(/\/(?:\d+\/)?(v2-[a-f0-9]{32})(?:_[a-z0-9]+)?\.(?:jpg|jpeg|png|webp)(\?[^)\s#]+)?/i);
    if (!match) {
      return raw;
    }

    return `asset://${match[1].toLowerCase()}${match[2] ?? ""}`;
  });
}

function normalizeLooseUrls(line: string): string {
  return line.replace(/(?:https?|asset):\/\/[^)\s]+/g, (raw) => {
    let value = raw.replace(/xn--[a-z0-9-]+\/?$/i, "").replace(/\/$/, "");

    try {
      const parsed = new URL(value);
      parsed.hash = parsed.hash.replace(/xn--[a-z0-9-]+\/?$/i, "");
      value = parsed.toString().replace(/\/$/, "");
    } catch {
      return value;
    }

    return value;
  });
}

function normalizeCodeFenceLanguage(line: string): string {
  return line
    .replace(/^```cpp$/i, "```c++")
    .replace(/^```shell$/i, "```bash");
}

function normalizeImageAlt(line: string): string {
  return line.replace(/!\[[^\]]*\]\(((?:https?|asset):\/\/[^)\s]+)\)/g, "![]($1)");
}

function normalizeCosmeticEscapes(line: string): string {
  return line.replace(/\\([[\]_])/g, "$1");
}

function normalizeForCompare(value: string, expectFrontmatter: boolean): string {
  const normalized = (expectFrontmatter ? value : stripFrontmatter(value))
    .replace(/\r\n/g, "\n")
    .replace(CAPTURED_AT_PATTERN, "captured_at: '<ignored>'")
    .split("\n")
    .map((line) => normalizeThematicBreak(line))
    .map((line) => normalizeTableDivider(line))
    .map((line) => normalizeCosmeticSpacing(line))
    .map((line) => normalizeAssetVariantUrls(line))
    .map((line) => normalizeImageIdentityUrls(line))
    .map((line) => normalizeLooseUrls(line))
    .map((line) => normalizeCodeFenceLanguage(line))
    .map((line) => normalizeImageAlt(line))
    .map((line) => normalizeCosmeticEscapes(line))
    .filter((line) => line.trim() !== "\\")
    .join("\n")
    .trim();
  return normalized;
}

function mergeStableFrontmatter(existing: string, actual: string): string {
  const capturedAt = existing.match(CAPTURED_AT_PATTERN)?.[0];
  if (!capturedAt) {
    return actual;
  }

  return actual.replace(CAPTURED_AT_PATTERN, capturedAt);
}

function firstDiffLine(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const limit = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < limit; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return `line ${index + 1}\nEXPECT: ${expectedLines[index] ?? "<missing>"}\nACTUAL: ${actualLines[index] ?? "<missing>"}`;
    }
  }

  return "unknown diff";
}

async function collectFixtures(): Promise<FixtureCase[]> {
  const fixtures: FixtureCase[] = [];
  const siteDirs = await readdir(TEST_DATA_DIR, { withFileTypes: true });

  async function walk(dir: string, site: string, parts: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    const names = entries.map((entry) => entry.name);
    const htmlName = names.find(
      (entry) =>
        entry.endsWith(".html") &&
        entry !== "frame.html" &&
        !entry.includes(":Zone.Identifier")
    );

    if (htmlName && names.includes("expect.md")) {
      fixtures.push({
        name: [site, ...parts].join("/"),
        dir,
        htmlPath: path.join(dir, htmlName),
        expectPath: path.join(dir, "expect.md"),
        site: site.toLowerCase()
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(path.join(dir, entry.name), site, [...parts, entry.name]);
    }
  }

  for (const siteDir of siteDirs) {
    if (!siteDir.isDirectory()) {
      continue;
    }
    await walk(path.join(TEST_DATA_DIR, siteDir.name), siteDir.name, []);
  }

  fixtures.sort((left, right) => left.name.localeCompare(right.name));
  return fixtures;
}

function installDomGlobals(dom: JSDOM): void {
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    DOMParser: window.DOMParser,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    HTMLAudioElement: window.HTMLAudioElement,
    HTMLImageElement: window.HTMLImageElement,
    HTMLLIElement: window.HTMLLIElement,
    HTMLMediaElement: window.HTMLMediaElement,
    HTMLSourceElement: window.HTMLSourceElement,
    HTMLTableElement: window.HTMLTableElement,
    HTMLVideoElement: window.HTMLVideoElement
  });
}

function buildFetch(caseItem: FixtureCase): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (caseItem.site === "arxiv" && /^https:\/\/arxiv\.org\/(?:api\/query|html\/)/.test(url)) {
      return REAL_FETCH(input as RequestInfo, init);
    }

    throw new Error(`Network disabled in golden test: ${url}`);
  };
}

async function runFixture(caseItem: FixtureCase): Promise<string> {
  const html = await readFile(caseItem.htmlPath, "utf8");
  const dom = new JSDOM(html, {
    url: `file://${caseItem.htmlPath}`,
    contentType: "text/html"
  });

  installDomGlobals(dom);
  const fetch = buildFetch(caseItem);
  globalThis.fetch = fetch;
  dom.window.fetch = fetch;

  const result = await extractCurrentPage();
  return withFrontmatter(result);
}

async function main(): Promise<void> {
  const fixtures = await collectFixtures();
  const failures: string[] = [];

  for (const caseItem of fixtures) {
    const expected = await readFile(caseItem.expectPath, "utf8");
    const actual = await runFixture(caseItem);
    const expectFrontmatter = expected.startsWith("---\n");
    const normalizedExpected = normalizeForCompare(expected, expectFrontmatter);
    const normalizedActual = normalizeForCompare(actual, expectFrontmatter);

    if (normalizedExpected === normalizedActual) {
      process.stdout.write(`ok ${caseItem.name}\n`);
      continue;
    }

    if (UPDATE) {
      const actualPath = path.join(caseItem.dir, "actual.md");
      await writeFile(actualPath, mergeStableFrontmatter(expected, actual), "utf8");

      if (!FORCE) {
        failures.push(`${caseItem.name}\nreview ${path.relative(ROOT, actualPath)} then rerun with --force to accept`);
        process.stdout.write(`wrote ${caseItem.name} -> ${path.relative(ROOT, actualPath)}\n`);
        continue;
      }

      await writeFile(caseItem.expectPath, mergeStableFrontmatter(expected, actual), "utf8");
      process.stdout.write(`accepted ${caseItem.name}\n`);
      continue;
    }

    failures.push(`${caseItem.name}\n${firstDiffLine(normalizedExpected, normalizedActual)}`);
    process.stdout.write(`fail ${caseItem.name}\n`);
  }

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.join("\n\n")}\n`);
    process.exitCode = 1;
  }
}

await main();
