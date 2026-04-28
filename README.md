# MDContextClaw

Chrome extension. Turn a few high-value web pages into AI-ready context.

Built for focused extraction, not "save the whole web".

## Highlights

- `Extract This Page`
  - Pull main content from current page
  - Strip common noise
  - Add YAML frontmatter metadata

- `Pick & Extract`
  - Hover and pick semantic blocks
  - Extract article / section / code / table
  - Copy or download fast

- Smart output fallback
  - Pure text page -> `.md`
  - Rich page with light media -> Markdown + media links
  - Heavy media page -> `.zip` with `page.md` + `manifest.json`

- AI-ready by default
  - Clean headings
  - Fenced code blocks
  - Absolute links
  - Source metadata

## Focus

This project does **not** aim to support every site equally.

Initial product shape:

- General extraction for normal article pages
- Deep cleanup for a small number of high-value sites
- Better output quality over broader site coverage

Current likely priority sites:

- `GitHub` single file / rendered docs
- `微信公众号`
- `知乎`

## Install Locally

### 1. Build

```bash
pnpm install
pnpm build
```

### 2. Load in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `dist/`

## Use

### Extract current page

1. Open target page
2. Click extension icon
3. Click `Extract This Page`
4. Review preview
5. Click `Copy Last Result` or `Download Last Result`

### Pick part of page

1. Open target page
2. Click extension icon
3. Click `Pick & Extract`
4. Hover block on page
5. Click target block
6. Use floating `Copy` or `Download`
7. Press `Esc` or `Cancel` to quit picker

## Output

### Markdown

- YAML frontmatter
- Clean body content
- Code fences
- Image links

### ZIP fallback

Used when page is media-heavy.

```text
page-export/
  page.md
  manifest.json
```

## Chrome Web Store

Not live yet.

After publish, install section will add:

1. Chrome Web Store link
2. One-click install path
3. Version update notes

## Project Structure

```text
public/manifest.json         Chrome extension manifest
src/app/popup/index.ts       Popup UI
src/app/popup/popup.css      Popup styles
src/app/content/index.ts     In-page selection entry
src/app/background/index.ts  Runtime result store
src/extractor/               Extraction engine
src/contracts/               Shared runtime contracts
```

## Development

### Start watch build

```bash
pnpm install
pnpm dev
```

This watches source and rebuilds `dist/`.

### Reload extension during dev

1. Open `chrome://extensions`
2. Find `MDContextClaw`
3. Click reload after each rebuild
4. Refresh target page if content script changed

### Dev loop

1. Edit files in `src/` or `public/manifest.json`
2. Let Vite rebuild `dist/`
3. Reload extension
4. Re-test on real pages

## Status And Roadmap

### Current

- Chrome `Manifest V3`
- Local extraction only
- `Extract This Page`
- `Pick & Extract`
- Markdown / ZIP fallback

### Later

- `Crawl This Site`
- Site-specific cleanup rules
- Better media packaging
- `arXiv` adapter
