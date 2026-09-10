# GEAR — Bilingual Chart Format (v2)

Drop this file in the repo root next to `DESIGN.md`. Claude Code reads it automatically
when it's referenced from `CLAUDE.md`, so it becomes the contract for every bilingual
change instead of something you re-explain each session.

---

## 1. Goals & non-goals

**Goals**

- One song = one entity = one chart file, regardless of how many languages it has.
- Chord/lyric alignment that does not depend on monospace character counting.
- Per-section language selection ("Verse in Chinese, Chorus in English") as data
  — scoped to the setlist builder and its Word doc export (§6.3), not the song
  page itself; see that section for why.
- Mandarin-only songs handled by the same code path as bilingual ones.
- Zero required changes to the v1 English charts, except the rare one that
  already contains v2-only marker syntax (§5.4) it can't actually render.

**Non-goals**

- Migrating the existing English-only library. v1 charts stay v1 forever unless a
  Mandarin layer is added to one.
- Replacing `data/songs.json` with a database. It stays a single fetched JSON array.

---

## 2. Backward compatibility

`data-format` is the discriminator.

| Wrapper | Parser | Notes |
|---|---|---|
| `<pre class="chord-chart" data-key="G">` | v1 | The large majority of charts. |
| `<pre class="chord-chart" data-key="A" data-format="bilingual">` | v2 | A growing minority — bilingual + Mandarin-only. |

`fetchSongContent()` branches on `data-format`; everything without it goes through
`parseChartBody()`'s v1 path exactly as before.

It extracts the chart with `DOMParser`, not a regex, so every `data-*` attribute rides
through as-is:

```js
const doc  = new DOMParser().parseFromString(html, 'text/html');
const pre  = doc.querySelector('pre.chord-chart');
const meta = { ...pre.dataset };            // { key, format, langs, ... }
const body = pre.textContent;
```

A chart can gain a new `data-*` attribute without this call site needing to know its
name — `parseChartBody()` (`js/chart-parser.js`) is the only place that reads specific
keys out of `meta`.

---

## 3. File layout & naming

```
charts/<LETTER>/<ascii-slug>.html
```

- `<LETTER>` — first letter of the **English** title. For Mandarin-only songs, use the
  first letter of the **pinyin** of the Chinese title (圣洁到永远 → `S`). This keeps the
  existing A–Z browse structure coherent.
- `<ascii-slug>` — lowercase ASCII, hyphenated. `holy-forever.html`, `for-you-alone.html`.

### Never put Han characters in filenames

macOS stores filenames as NFD (decomposed), Linux serves them as NFC (composed), and git
commits whatever the filesystem gave it. `charts/S/圣洁到永远.html` will work on your Mac
and 404 on gh-pages. Percent-encoding in `songs.json` does not save you — the bytes on
disk differ. Keep Chinese titles in `songs.json`, keep filenames ASCII.

### Case matters too, for the same reason

macOS's default filesystem is case-*insensitive but case-preserving* — `Captain.html` and
`captain.html` are the same file to git status, `git status` shows nothing changed, and
`songs.json` can point at the lowercase URL while the tracked path is still capitalized,
and everything still works locally. gh-pages serves from a case-*sensitive* Linux
filesystem, where those are two different paths and the mismatched one 404s. If a rename
changes *only* case, plain `git mv` on macOS won't register it — go through a temporary
name (`git mv Foo.html Foo.html.tmp && git mv Foo.html.tmp foo.html`) so git's tracked
path actually changes, then confirm with `git ls-files` (not `git status`, which is what
missed it originally).

All existing v1 filenames are already normalised to ASCII, lowercase, hyphenated slugs
(`god-be-praised.html`), matching `songs.json`'s `url` for every entry — `songs.json` is
the only thing that references a chart's path, so this removes a whole class of
URL-encoding and case-mismatch bugs at once. Keep new charts on the same convention.

---

## 4. Wrapper attributes

```html
<pre class="chord-chart"
     data-format="bilingual"
     data-key="A"
     data-langs="en,zh-Hant"
     data-primary="en">
```

| Attribute | Required | Meaning |
|---|---|---|
| `data-format` | yes | Always `bilingual` for v2. |
| `data-key` | yes | Written key of the chords in the file. |
| `data-langs` | yes | Comma-separated, in authoring order. `en,zh-Hant`, `en,zh-Hans`, or `zh-Hans` alone. |
| `data-primary` | no | Authoring metadata only — recorded but not read by the renderer. The site's default language mode is fixed to English-first (§6.2), regardless of this attribute. |

Use `zh-Hant` / `zh-Hans` precisely, not bare `zh` — it drives the `lang` attribute on
rendered lines, which is what makes browsers pick the right regional glyph variants. Your
current material mixes both scripts (聖潔 vs 圣洁), so this matters.

---

## 5. Body syntax

### 5.1 Section headers

A line whose entire trimmed content is a bracketed section name:

```
[Intro]  [Verse]  [Verse 1]  [Pre-Chorus]  [Chorus 1]  [Bridge]
[Interlude]  [Tag]  [Instrumental]  [Ending]  [Coda]  [Outro]
[Turnaround]  [End]  [Final Chorus]  [Echo]  [High Praise]  [Build-up]
```

Same allow-list your v1 renderer already uses. Anything else in brackets on its own line
is a validation error, not a header — that's what keeps section headers and inline chords
unambiguous.

Matching is case- and separator-insensitive: `[high-praise]`, `[HIGH_PRAISE]`, and
`[High Praise]` are the same header. A number or short free-text suffix is allowed after
the header word, separated or not (`[Verse1]`, `[Chorus 2]`, `[Bridge tag]`) — the suffix
is kept verbatim, only the header word itself is canonicalized. Whatever spelling a chart
author used, the parser, renderer, and validator all agree on one canonical display form
(`Pre-Chorus`, `High Praise`, …) — `js/chart-constants.js`'s `matchSectionHeader()` is the
single implementation all three call, so this can't drift into three slightly-different
regexes the way it did before.

### 5.2 Lyric lines

Prefix `<lang>:` then the lyric with chords inline in square brackets. A chord binds to
the character immediately after it.

```
[Verse]
en: [A]You are the [C#m7]peace that guards my [F#m]heart
zh: [A]祢是平[C#m7]安保守我[F#m]心
en: [Bm7]My help in [E7]times of need
zh: [Bm7]我随时的[E7]帮助
```

Consecutive lines with different language prefixes form one **line group** — two
renditions of the same musical phrase. A blank line or a section header closes the group.

Chords are repeated on each language line **on purpose**: Chinese syllable counts differ
from English, so chord positions genuinely differ. The validator (§8) enforces that the
chord *sequence* matches across a group, which is what stops the two from drifting.

Column binding differs by script. On an `en:` (or any Latin-script) line, a chord binds
to the character at its literal string column. On a `zh:` (or other CJK) line, it binds
by **display width** instead: Han characters and full-width punctuation count as 2
columns, everything else counts as 1. This is what keeps a chord's rendered position
lined up with the syllable it's sung on even though a CJK character renders about twice
as wide as a Latin one.

Adjacent chord clusters with no lyric between them — `[F][Gm][F]Glo` — bind all of those
chords to the single syllable that follows, not to three separate syllables. This is a
**melisma**: one syllable stretched across a chord change (or several) before the lyric
moves on, common in refrains like "Glo-o-o-ria." The grammar doesn't need a special case
for it — `[F][Gm][F]` is just three ordinary chord tokens in a row with no text between
their brackets — but it's worth calling out explicitly, since reading it as three
one-character syllables would be wrong. See §6.1 for how a cluster renders.

### 5.3 Chord-only lines

No prefix. Used for intros, turnarounds, instrumentals. Rendered once, shared by all
language modes.

```
[Intro]
| D | F#m | Esus4 | . |
| A/C# | F#m | Esus4 | . |
```

`|` and `.` are passed through as-is. Bare chords without pipes also work: `Em D G C`.

### 5.4 Performance notes and repeats

```
{note: Drums in}
{note: Guitar & Keys hold A at the end}
{repeat: x2}
{goto: Chorus}
{segue: Amazing Grace}
{chords: Verse 1}
{modulate: +2}
```

Rendered as an italic aside, never transposed, excluded from language filtering. These are
the `*Drums in*` / `*Soft*` annotations from your Word doc's Song Order table.

`{goto: <section>}` is a navigation cue to a section elsewhere in the same chart ("go back
to the Chorus"), replacing what used to get hand-written as a fake section header like
`[To Chorus]` — those aren't section names, and forcing them through the §5.1 allow-list
was never right. `{segue: <title>}` is the same idea pointed at a *different* song ("go
straight into I Have Decided to Follow Jesus") rather than a section of this one. Neither
is validated against the section allow-list or any other chart's contents — `<section>` and
`<title>` are free text, exactly like `{note: ...}`'s.

`{chords: <section>}` declares that this section reuses another section's chord
progression rather than writing it out again — the common case being a later verse that
repeats verse 1's changes under new lyrics, with no chord line of its own. Unlike
`{goto: ...}`/`{segue: ...}`, `<section>` here is **not** free text: it must resolve to a
section name that actually exists in the same chart, matched the same case-/
separator-insensitive way as §5.1 header matching (§8, rule 9 — fails the build
otherwise). The section's own lyric lines still carry no inline `[chord]` tokens.

**This marker is data-only — it's never rendered as its own line, in either the on-screen
chart or the docx chart body.** Its one surfaced form is the `*<section>` suffix
`buildSongOrderTable()` adds to this section's row in the docx's Song Order table —
`Verse 2 *Verse 1` — which already states the reuse in context, right next to the section it
applies to. Printing it a second time, as its own bare `Verse 1` line at the top of the
chordless verse's lyrics, read as a stray or duplicated line, not a note — the Song Order
table said it more clearly already. The on-screen chart page renders nothing for it either:
a chordless verse repeating the previous section's progression is the same convention v1
charts always used with no on-screen note at all, and it isn't ambiguous in that context —
the previous section's chords are right there on the same screen. Don't add a "chords as
`<section>`" note (or the bare `<section>` line the docx body used to print) back into
`js/chart-render.js` or `js/app.js`'s `buildSectionParagraphs()` thinking either absence is
an oversight; neither is. `tools/docx-to-chart.mjs` still writes the marker into new
conversions, and rule 9 (§8) still validates it — only what gets *printed* from it changed.

`{modulate: <semitones>}` documents a genuine key change written into the chart, in place
(e.g. a final verse repeated a step higher). `<semitones>` is a signed integer — `+2`, `-3`
— **relative** to whatever key the section it precedes was already going to be in. Because
it's a relative offset rather than an absolute key name, transposing the whole chart with
the key selector doesn't touch it: every chord shifts by the same amount, so the interval
the marker describes is preserved automatically. Like `{note: ...}`, it's rendered as an
aside, never transposed itself, and excluded from language filtering — it's metadata about
the chart's structure, not a chord or a lyric. Unlike the others, it's not purely
decorative: `tools/validate-charts.mjs` reads it (rule 8, §8) to check that whatever follows
it actually *is* in the resulting key, and the renderer reads it to show the chart's key as
e.g. `D → E` instead of just `D`.

### 5.5 Comments

`#` at the start of a line. Stripped at parse time, never rendered. Use for source notes,
translator credits, TODOs.

### 5.6 Generated layers

`py:` (pinyin) is **generated at build time by default, never hand-edited**. `tools/
build-index.mjs` derives it from the `zh-*` line immediately above (via `pinyin-pro`,
corrected by `tools/pinyin-exceptions.json`) and writes it back — idempotent, safe to
re-run any time a lyric or the exception map changes. Hand-edits to a `py:` line get
overwritten on the next run; if a reading is wrong, fix it in `tools/pinyin-exceptions.json`,
not the chart. The first time a chart file gets a `py:` line written into it, the script also
prepends an HTML comment directly above the `<pre>` saying so — the file itself carries the
warning, not only this spec. `tools/validate-charts.mjs` rule 12 (§8) warns when a chart's
`py:` lines don't match what the generator would currently produce (missing, or stale after
a hand-edit or an unregenerated lyric change).

**`py!:` is the deliberate exception to all of that.** Write `py!:` instead of `py:` beneath
a `zh-*` line to mark that one reading as hand-authored: `tools/build-index.mjs` never
writes to it and `tools/validate-charts.mjs` rule 12 never checks it against what the
generator would produce. Every other line in the file still renders identically either way —
the renderer (`js/chart-parser.js`) treats `py:` and `py!:` the same, since a reader doesn't
care where a reading came from.

Two real reasons to reach for it, both confirmed against this corpus rather than
hypothetical:

- **pinyin-pro's punctuation spacing reads worse than a person would write it.** It always
  inserts a space *before* an ASCII comma when tokenizing (`那,那` → `nà , nà`, not `nà, nà`)
  — there's no option to turn this off, and it's true regardless of anything in the source
  `zh-*` line.
- **A `zh-*` line carries literal whitespace copied from a source document**, usually
  cosmetic alignment padding matching the `en:` line above it (BILINGUAL-SPEC.md §6.1's
  rendering model doesn't need it — chords attach to units, not character columns — so it's
  inert on screen, just present in the text). This isn't fixable by making the generator
  "tolerate" the space: pinyin-pro's own token separator *is* a space, so once a literal
  space is joined into the generated string alongside its neighboring token-separator
  spaces, nothing downstream can tell "a real space that was content" apart from "the
  boundary between two syllables" — whitespace can't be both the delimiter and a delimited
  value in the same plain-text encoding. A `zh-*` line with this kind of padding needs
  `py!:`, not a smarter generator.

---

## 6. Rendering model

Parse to:

```
Chart
 ├ meta: { key, langs, primary }
 └ sections: [{
     name: "Verse",
     groups: [{
       lines: [{ lang: "en", units: [{ chord: "A", text: "You are the " }, ...] }, ...],
       notes: []
     }]
   }]
```

### 6.1 Alignment

Each unit renders as an inline-block stack. No monospace requirement, no whitespace
counting, reflows on narrow screens:

```html
<span class="unit">
  <span class="chord">
    <span class="chord-name" data-chord="A">A</span>
  </span>
  <span class="syl">You are the </span>
</span>
```

A melisma (§5.2's `[F][Gm][F]Glo`) is the same shape with more than one `.chord-name` —
laid out horizontally inside the same chord slot, not stacked:

```html
<span class="unit">
  <span class="chord">
    <span class="chord-name" data-chord="F">F</span>
    <span class="chord-name" data-chord="Gm">Gm</span>
    <span class="chord-name" data-chord="F">F</span>
  </span>
  <span class="syl">Glo</span>
</span>
```

```css
.unit       { display: inline-block; vertical-align: bottom; }
.chord      { display: flex; gap: 0.2em; }
.chord-name { font-weight: 600; font-size: 0.8125em; color: var(--color-secondary); }
.lyric-line[lang^="zh"] { font-family: var(--font-mono-cjk); }
```

`.chord` is always a flex container of one or more `.chord-name` children — a single
chord is just a one-item cluster, which is why `data-chord` lives on `.chord-name` now
rather than on `.chord` itself.

`style.css`'s token set:

```css
--font-mono-cjk: 'Noto Sans Mono CJK SC', 'Noto Sans Mono CJK TC',
                 'Noto Sans Mono', 'PingFang SC', 'Microsoft YaHei', monospace;
```

`PingFang SC` covers iOS/macOS as a real system-font fallback if the webfont fails to
load; there's no equally universal Android equivalent in the chain, so a load failure or
missing glyph there falls all the way to generic `monospace`, which isn't guaranteed to
carry CJK glyphs on every Android build.

The two faces the stack's first two entries name are self-hosted (`fonts/*.woff2`, one
per script so Simplified and Traditional charts each keep correct glyph shapes) and
`<link rel="preload">`ed in `index.html` — Google Fonts doesn't serve this family at all.
`tools/subset-cjk-font.mjs` builds them from the ~16MB source OTFs down to only the Han
characters actually used across the repo's `zh-Hans`/`zh-Hant` chart content (currently
~30KB / ~78KB) — **re-run it after adding or editing bilingual charts with new
characters**; it's a superset-of-current-usage snapshot, not a fixed character list, and
a chart added without a re-run will fall back past the subset font for any character it
doesn't cover.

### 6.2 Language modes

Persist the choice in `localStorage` under `chartLang`, same pattern as your existing
`theme` key.

| Mode | Renders |
|---|---|
| `en` | English only |
| `zh` | Chinese only |
| `en-zh` | English above Chinese |
| `zh-en` | Chinese above English |

Modes unavailable for a given chart (`en` on a Mandarin-only song) are disabled, not hidden.

**Default:** English-first (`en-zh`) site-wide, for every bilingual chart, regardless of
`data-primary` — one saved `localStorage` choice carries across songs, same as before; this
only governs what a chart shows the very first time, before any choice has been saved.

**Fallback:** in a single-language mode (`en` or `zh`), a section with no line in that
language renders its available language rather than rendering empty. A bilingual song can
have an English-only bridge or a Mandarin-only outro (§5.2's per-section mixed-language
case); switching to `zh` mode shouldn't blank those sections out just because they don't
have a `zh:` line. This fallback doesn't apply to the two-language modes (`en-zh`/`zh-en`),
which already show whichever language(s) a section actually has.

### 6.3 Per-section override (setlist builder only — not on the song page)

The song page has no per-section language control and no plan picker: every section of
every chart renders exactly once, in the one global mode (§6.2), in its natural document
position. A section is never shown twice. This was tried (a `sectionOverrides` map plus an
additive `repeats` list, loaded from a per-song sidecar at `data/setlists/<slug>.json`,
picked from on the song page) and deliberately walked back — showing a whole section once
in one language and then again in the other was harder to follow than this format's
ordinary line-by-line pairing (§6.2's `en-zh`/`zh-en` modes), which already interleaves both
languages line by line within a section.

`sectionOverrides` survives only as a **setlist-entry** field, set by hand in the setlist
builder (never inferred, never loaded from a sidecar) for the Word doc export:

```json
{ "planLabel": "Main", "sectionOverrides": { "Verse": "zh", "Chorus": "en" } }
```

This is the builder's own per-song-in-this-setlist override — it belongs to the entry, not
the chart file, exists only in memory for the life of the setlist, and only ever affects the
generated Word document, never the live chart page. `data/setlists/<slug>.json` sidecar
files may still exist in the repo as a historical record of past services' plans; nothing at
runtime reads them.

### 6.4 Transposition

Operate on parsed `unit.chords` tokens. Delete the "is every token on this line a chord?"
heuristic — it's no longer needed and it was the fragile part.

While rewriting, fix the enharmonic spelling. `transposeNote()` currently always returns
from the sharp array, so transposing into E♭ yields `G#` where a chart should read `A♭`.
Choose the accidental from the target key:

```
sharp keys: G D A E B F#
flat keys:  F Bb Eb Ab Db Gb
```

### 6.5 Pinyin rendering

A "Show Pinyin" toggle appears on the song page whenever the chart has at least one
generated `.pinyin` reading (§5.6) — a chart with no `py:` lines at all shows no toggle,
rather than one that does nothing. The choice persists in `localStorage` under
`showPinyin`, the same pattern as `theme` and `chartLang`.

When on, pinyin renders above each Chinese character using `<ruby>`/`<rt>` — one reading
per character, zipped 1:1 against `.pinyin`'s space-separated syllables (§5.6's generation
rule is what guarantees that count matches). Browsers without `<ruby>` support (detected
once, via `document.createElement('ruby') instanceof HTMLUnknownElement`) fall back to a
plain stacked line — the whole `.pinyin` string rendered as its own line directly above the
Chinese line, no per-character alignment. The same stacked fallback also applies, even on a
`<ruby>`-capable browser, the moment a line's character count and syllable count disagree
(a malformed or hand-edited `.pinyin` slipping past rule 12) — misaligned `<ruby>` pairs
would be actively misleading, a plain line above isn't.

Pinyin rendering composes with every language mode (§6.2) and with `en-zh`/`zh-en`'s
line-by-line pairing without special-casing: it's driven entirely by whether the line being
rendered is Chinese and carries a `.pinyin`, not by which mode produced that line. In
`zh`-only mode it's the same mechanism doing the most work — a team member who reads pinyin
but not Han characters can follow a chart that's otherwise unreadable to them.

---

## 7. `songs.json` schema additions

All new fields optional, so existing records stay valid.

```json
{
  "title": "Holy Forever",
  "titleZh": "圣洁到永远",
  "url": "charts/H/holy-forever.html",
  "format": "bilingual",
  "langs": ["en", "zh-Hans"],
  "ccli": "7201044",
  "bpm": "72",
  "timeSignature": "4/4 time",

  "titleZhAlt": "聖潔到永遠",
  "pinyin": "sheng jie dao yong yuan",
  "pinyinInitials": "sjdyy"
}
```

The bottom three are **generated** by `tools/build-index.mjs` (§9) — do not hand-edit.
`titleZhAlt` is the opposite-script form, so a member typing 聖潔 finds a chart authored
in 简体.

Mandarin-only songs use `title` for the Chinese name and set `langs: ["zh-Hans"]`, with
`titleEn` optional if a descriptive English name is useful for the team.

---

## 8. Validator rules

`tools/validate-charts.mjs`, run in CI on every push:

1. Every chart parses.
2. Every bracketed token matches `^[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M|[2456791113])*(/[A-G](#|b)?)?$`.
3. Every bare-bracket line is in the §5.1 section allow-list (case- and separator-
   insensitive match).
4. Within a line group, all language lines carry the **same chord sequence**. This is the
   one drift risk the format introduces; catching it in CI is what makes duplication safe.
5. `data-key` is a real key, and the chart's first chord is diatonic to it or a common
   borrowed chord (bVI, bVII) — not a strict first-chord-equals-key match, since worship
   charts routinely open on an intro/pickup chord (IV, V, vi) rather than the tonic.
6. Every `songs.json` `url` resolves to a file on disk, and every chart file appears in
   `songs.json`. (Runs against the full current catalog, whatever its size, every
   time; orphans accumulate if this ever goes unwarned.)
7. No non-ASCII bytes in any path under `charts/`.
8. Every chord in a section following a `{modulate: n}` marker (§5.4) is diatonic to
   `data-key` transposed by `n`, or a common borrowed chord (bVI, bVII) — same diatonic
   check as rule 5, just against the modulated key instead of the written one.
9. Every `{chords: <section>}` reference (§5.4) resolves to a section that actually
   exists in the same chart, matched the same case-/separator-insensitive way as §5.1
   header matching.
10. No v2 marker syntax (`{note:}`, `{repeat:}`, `{goto:}`, `{segue:}`, `{modulate:}`,
    `{chords:}` — §5.4) inside a v1-format chart. v1 has no curly-brace parsing at all,
    so the marker doesn't fail to parse — it silently renders as literal text. A v1
    chart needing this syntax should migrate to v2 (§3/§4), not grow markers v1 can't
    display.
11. (warn) Every `data/setlists/<slug>.json` sidecar's `sectionOverrides` key, and every
    `repeats[].section`, matches a real section in the chart it's for — the chart found by
    `slugify(title)` on whichever `songs.json` entry's title slugifies to that same
    `<slug>`. Nothing at runtime loads these sidecars any more (§6.3) — they're validated
    purely as an archival record, so a mismatch here means "this old record no longer
    matches the chart," not "something will render wrong." A `repeats[]` entry's `after` is
    exempt — a missing or unmatched `after` was always intentional (render at the end), not
    a mismatch.
12. (warn) Every `zh-*` line's `py:` line matches what `tools/build-index.mjs` (via
    `tools/lib/pinyin.mjs`, shared with the generator so the two can't drift apart) would
    currently generate for it — including a `zh-*` line with no `py:` line at all. Warn, not
    fail: a missing or stale `py:` line degrades the pinyin toggle (§6.5) to an outdated or
    absent reading, it never breaks parsing or anything else on the page.

Fail the build on 1–4, 7, 9, and 10; warn on 5–6, 8, 11, and 12.

---

## 9. Build scripts

```
tools/
  build-index.mjs      # derives titleZhAlt, pinyin, pinyinInitials → songs.json
  validate-charts.mjs  # §8
  docx-to-chart.mjs    # converts a service-pack .docx into v2 chart files
  subset-cjk-font.mjs  # rebuilds fonts/*.woff2 from current chart content (§6.1)
  lib/
    chart-file.mjs     # <pre class="chord-chart">...</pre> extraction (regex, no DOM) —
                        # shared by validate-charts.mjs and build-index.mjs
    pinyin.mjs         # py: generation/diff logic — shared by build-index.mjs (writes it)
                        # and validate-charts.mjs rule 12 (checks it), so the two can't drift
```

`build-index.mjs` uses `pinyin-pro` and `opencc-js`, runs locally, and commits its output —
gh-pages serves static files, so nothing runs at request time and there's no runtime
dependency to load.

`docx-to-chart.mjs` is the highest-leverage one: a song boundary in the source `.docx` is
either a Heading3-styled paragraph (a clean pack that uses Word paragraph styles) or a
bold+italic paragraph (a messier pack that never uses styles at all) — either shape
converts, including writing `{modulate:}`/`{chords:}` markers where the source calls for
them. You already have years of bilingual service packs in roughly this shape (chord run,
English run, Chinese run, repeat, one song after another). Converting them beats retyping.

---

## 10. Status

All of parser + renderer + language toggle, `docx-to-chart.mjs`, the search index,
setlist-builder docx export, the CI validator, and the pinyin ruby layer are built and
in use — this section is no longer a to-do list. `data/setlists/<slug>.json` sidecars are
kept as an archival record only (§6.3); nothing else here is provisional. Treat the rest
of this document as the current contract, not a plan.

One caveat, discovered the hard way: converting a v1 chart to v2 by hand (chord-line-above-
lyric → inline `[chord]` tokens) requires binding each chord to a specific character by
ear or by careful reading, not by blindly transcribing the source file's column
positions — a v1 chart's chord/lyric alignment was only ever meant to be read visually, not
measured. Two charts converted this way in the same batch can look identically "aligned"
in the original and still need different judgment calls converting.
