# CLAUDE.md

Conventions for GEAR — a worship-resources site for Church Of the True Light,
deployed straight from the `gh-pages` branch of `github.com/ryan2706/GEAR3`.
Read this before touching `index.html`, `js/*.js`, `css/*.css`, `data/songs.json`,
or anything under `charts/`.

## Zero dependencies at runtime — this is the whole architecture

There is no build step. No `package.json`, no bundler, no npm install. What's in
the repo is byte-for-byte what gh-pages serves.

- `js/app.js` is the vanilla ES module loaded via `<script type="module">`, plus
  four small modules it imports: `chart-parser.js` (text → Chart AST),
  `chart-render.js` (Chart AST → HTML, transposition), `chord-theory.js`
  (note/chord math shared by both), and `chart-constants.js` (the section-header
  vocabulary). All plain ES modules, no bundler — `<script type="module">` and
  browser-native `import` resolve them directly off gh-pages. Don't introduce a
  framework, a bundler, or a `node_modules` runtime dependency.
- The only third-party runtime scripts are CDN `<script>` tags in `index.html`
  (`docx` and `FileSaver.js`, used solely by the Word-doc chord-chart generator),
  plus Google Fonts `<link>` tags for Noto Serif/Manrope/Noto Sans SC/TC. Any new
  dependency must justify itself the same way: loaded via CDN, used client-side
  only, no install step. The one exception is `fonts/*.woff2` (a CJK monospace
  face) — self-hosted because Google Fonts doesn't serve that family at all; see
  below.
- Build-time tooling is a different story — `BILINGUAL-SPEC.md` describes Node
  scripts under `tools/` (e.g. `build-index.mjs` using `pinyin-pro`/`opencc-js`,
  `subset-cjk-font.mjs` using `subset-font`) that run locally and commit their
  output — generated `data/songs.json` fields, chart `py:` lines, and the
  `fonts/*.woff2` files loaded by `style.css`. That's fine: nothing runs at
  request time on gh-pages, so it doesn't violate this rule. Don't blur the two —
  runtime code stays dependency-free even as build-time tooling grows.
- `tools/validate-charts.mjs` runs in CI on every push/PR
  (`.github/workflows/validate-charts.yml`) — validation only, it never builds or
  deploys anything. Run it locally (`node tools/validate-charts.mjs`) before
  pushing so failures surface before Actions does.

## The router (`js/app.js`)

Hand-rolled hash router, no library:

```js
const routes = { '/': renderHome, '/search': renderSearch, '/generate': renderGenerate, '/about': renderAbout };
```

- `handleNavigation()` reads `location.hash`, looks up `routes`, and falls back to
  a `/song/<title>` prefix match for song detail pages, then `renderNotFound()`.
- Each `render*` function does a full `mainContent.innerHTML = ...` replace — there
  is no virtual DOM, no diffing. Keep new pages consistent with this pattern rather
  than introducing partial updates or component state.
- Wired on `hashchange` and `load`. A new route means: add a `render*` function,
  add it to `routes`, add a nav link in `index.html` if it should be visible.
- Global handlers exposed for inline `onclick=""` attributes (`window.changeKey`,
  `window.addToSetlist`, etc.) are the existing pattern for DOM-generated event
  wiring — match it rather than switching to `addEventListener` everywhere, unless
  refactoring the whole file.

## Chart fragments (`charts/<LETTER>/<name>.html`)

Every chart file is an **HTML fragment**, not a full document — no `<html>`,
`<head>`, or `<body>`. It contains exactly one:

```html
<pre class="chord-chart" data-key="F">
[Verse 1]
       F                     C
For my waking breath, for my daily bread
...
</pre>
```

- `js/app.js`'s `fetchSongContent()` fetches this file with a plain `fetch()`,
  then uses `DOMParser` to pull the `<pre>` element's text and every `data-*`
  attribute (spread into a generic `meta` object, not a fixed field list) and
  hands both to `parseChartBody()` in `chart-parser.js` — it does not parse a
  full page, and a chart can gain a new `data-*` attribute without this call
  site needing to know its name. `tools/validate-charts.mjs` (no DOM, plain
  Node) calls the same `parseChartBody()` with its own regex-extracted
  attributes/text, so the v1/v2 grammar itself lives in exactly one place.
- `data-key` is the written key of the chords in the file; transposition is
  computed as an offset from it, and the accidental (sharp vs. flat) is chosen
  from the *target* key, not hardcoded — see `chord-theory.js`.
- Section headers are bracketed lines from a fixed allow-list (`Intro`, `Verse`,
  `Pre-Chorus`, `Chorus`, `Bridge`, `Interlude`, `Tag`, `Instrumental`, `Ending`,
  `Coda`, `Outro`, optionally suffixed with a number) — the list lives in
  `chart-constants.js`. Don't invent new bracket syntax without updating it.
- This is the **v1** format, used by the large majority of existing charts.
  **v2 (bilingual)** is a distinct wrapper (`data-format="bilingual"`, a
  growing minority) — see below. Never migrate a v1 chart to v2 just to
  "clean it up"; v1 stays valid indefinitely. The one real exception: a v1
  chart that already contains `{goto:}`/`{repeat:}`/`{segue:}`/`{modulate:}`/
  `{chords:}` marker syntax (BILINGUAL-SPEC.md §5.4) *must* migrate — v1 has
  no curly-brace parsing at all, so the marker silently renders as literal
  text instead of failing loudly. `tools/validate-charts.mjs` rule 10 fails
  the build on this; if it fires, the fix is migrating that chart, not
  muting the rule.

## `data/songs.json` is the single index

Fetched at runtime (`loadSongs()` in `app.js`), cache-busted with a timestamp
query param, held in memory as `songsData`. It is the only index — there's no
database and no directory listing.

- Every song has `title` and `url` (a percent-encoded path into `charts/`).
  `ccli`, `bpm`, `timeSignature`, and `artist` are optional metadata chips.
- Adding a song means: drop the chart fragment under `charts/<LETTER>/`, add a
  matching entry to `songs.json`. Both directions matter — an orphaned chart file
  or a `songs.json` entry with a dead `url` are both bugs.
- Song identity is currently the `title` string (used as a lookup key throughout
  `app.js` and in the URL hash `#/song/<title>`). Keep titles unique.
- `titleZhAlt`, `pinyin`, and `pinyinInitials` on bilingual entries are
  **generated** by `tools/build-index.mjs` from `titleZh` — never hand-edit
  them, they're silently overwritten on the next run. Fix `titleZh` (or the
  script) and re-run `node tools/build-index.mjs` instead.

## Design tokens (`DESIGN.md`) are the only source of colour and typography

`css/style.css` defines CSS custom properties (`--color-*`, `--font-*`,
spacing/radius tokens) transcribed directly from `DESIGN.md`'s tables. Never
hardcode a hex colour, font-family, or spacing value in a component or inline
style — reference the existing `var(--...)` token, or add a new token to both
`DESIGN.md` and `:root` in `style.css` if the palette genuinely needs to grow.
`css/responsive.css` layers breakpoints on top of the same tokens; it doesn't
define its own colours.

## Bilingual work: `BILINGUAL-SPEC.md` is the contract

Any change touching multiple languages in a chart — Mandarin lyrics, pinyin, the
`data-format="bilingual"` wrapper, changes to `fetchSongContent()`'s parsing, or
new fields in `songs.json` like `titleZh` / `langs` — must follow
`BILINGUAL-SPEC.md`, not be improvised. It covers file naming (ASCII-only paths
— Han characters in filenames break across macOS/Linux/git), the
`data-langs`/`data-primary` attributes, and line-group chord-sequence
validation. Read it in full before starting bilingual work; don't partially
implement a v2 feature without it. Per-section language selection is a setlist-
builder / docx-export-only feature now (BILINGUAL-SPEC.md §6.3) — the song page
itself has no per-section control, so don't reintroduce one there.

Setlist sidecars record what a specific team performed at a specific service.
Never infer a language plan, planLabel, or section order from chart content or
from another service's plan. If the source document doesn't state it, leave it
out — a missing entry falls back to the default, a fabricated one is silently
wrong. The same song legitimately has different plans under different leaders.
