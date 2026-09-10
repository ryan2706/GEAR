#!/usr/bin/env node
// tools/docx-to-chart.mjs
//
// Converts bilingual service-pack .docx files into v2 chart files per
// BILINGUAL-SPEC.md. A song boundary is one of three shapes. Either a
// Heading3-styled paragraph (the clean pack this tool was originally written
// against — "ENGLISH TITLE 中文標題", credit/copyright lines, "CCLI Song #:",
// a "Key: / Time: / BPM =" line, an optional Song Order table) or a
// bold+italic paragraph (messier packs that never use paragraph styles at
// all, where the title may also carry a leading service-role marker like
// "RESPONSE:" and/or a trailing key marker like "(C)", and none of the
// CCLI/Key/Time/BPM metadata lines may be present at all) — both of these
// combine English and Chinese on the *same* title paragraph. Or, a third
// shape: two separate bold-only paragraphs, English then Chinese, each with
// its own trailing "[Key]" marker in *square* brackets — no Heading3, no
// italic anywhere in the document, so a title is only recognizable by
// elimination (bold, not a chord line, not a section header) and by being
// followed by a second such paragraph whose text is Chinese; see
// isBoldTitlePair() below. Whichever shape, the chart body itself is the
// same: repeating (bold chord line, English lyric line, Chinese lyric line)
// groups, except a later verse commonly omits its own chord line and reuses
// an earlier one instead (see `{chords: ...}` below).
//
// ── How to run ──
//
//   npm install
//   node tools/docx-to-chart.mjs <file.docx> [<file.docx> ...] [options]
//
// Options:
//   --force               Overwrite chart files that already exist under
//                          --charts-dir. Without it, a run where ANY target
//                          chart file already exists lists every collision
//                          and aborts before writing anything at all — no
//                          chart files, no songs.json patch, no Song Order
//                          sidecars. Idempotent re-runs (nothing collides)
//                          still write normally.
//   --dry-run             Parse and log what would be written (song count,
//                          titles, section lists, ambiguity report) without
//                          writing anything — no chart files, no songs.json
//                          patch, no Song Order sidecars.
//   --skip-title <title>  Exclude a song (matched case-insensitively against
//                          its parsed, role/key-stripped title) from the
//                          chart-file write, the songs.json patch, and the
//                          auto-generated Song Order sidecar — but it's still
//                          parsed and still counts toward the collision
//                          pre-check's candidate list before being dropped.
//                          Repeatable. For when a title collision (see
//                          --force below) turns out to be the same song
//                          under its existing chart, not a real duplicate:
//                          skip it here and write any manual sidecar by hand
//                          instead of through this tool.
//   --charts-dir <dir>    Where chart files are written. Default: the
//                          repo's real charts/ directory, per
//                          BILINGUAL-SPEC.md §3's charts/<LETTER>/<slug>.html
//                          layout.
//   --out-dir <dir>       Where the songs.json patch fragment and Song
//                          Order sidecars land. Default: tools/out/. These
//                          are staging artifacts (never auto-merged into
//                          data/songs.json) and are freely overwritten each
//                          run — only chart files get the idempotent guard.
//
// One docx can (and usually does) contain multiple songs; each gets its own
// chart file, its own Song Order sidecar (if it had a Song Order table),
// and one entry in the shared songs.json patch fragment for the run.
//
// The songs.json patch is never applied automatically — review
// tools/out/songs-patch.json and merge the entries you want by hand.
//
// ── Why raw OOXML instead of mammoth ──
//
// mammoth converts prose documents to semantic HTML (style-mapped headings,
// bold → <strong>) — it's the obvious library, but wrong here: chord-to-
// syllable binding depends entirely on exact whitespace and run-level bold
// fidelity, and mammoth doesn't contract to preserve that (docx→HTML
// converters in its class are known to normalize runs of spaces — exactly
// what the column math below depends on). It also has no clean way to read
// a table's cells as structured data rather than HTML. A .docx is a zip
// containing well-specified OOXML, so this reads word/document.xml
// directly via two small devDependencies (jszip for the zip container,
// @xmldom/xmldom for the XML — a real DOM, not regex, since OOXML nests and
// regex over nested tags is fragile).
//
// ── Known failure modes ──
//
// - Column math assumes chord/lyric paragraphs use a true monospace font
//   (this tool doesn't check the font; if a document uses a proportional
//   font, every binding will be wrong and none of it will be flagged,
//   because the algorithm has no way to know).
// - Hand-typed padding drifts from perfect alignment in real archives —
//   confirmed against a real 5-year-old file during design. A binding is
//   only marked confident when it lands exactly on a natural anchor (a
//   word boundary for English, a character's own visual column for
//   Chinese); anything else is flagged in the report, but still emitted as
//   a best-effort guess — always hand-check flagged lines against the
//   original docx. Flags are tiered (review vs. cosmetic — a 1-column
//   Chinese drift is routine hand-typed-padding noise, not a real problem)
//   so the report's review section stays worth reading line by line; pass
//   `--dry-run` and read the full log if you want the cosmetic flags too.
// - A later verse that repeats an earlier verse's progression with no chord
//   line of its own becomes `{chords: <earlier section>}` (§5.4) rather
//   than an invented per-syllable binding against that verse's own,
//   differently-worded lyrics — the source only asserts that the
//   progression repeats, never where on *this* verse's syllables it lands.
//   A chordless section with no earlier same-family section to point at
//   (nothing established the family yet) is flagged rather than silently
//   left chord-free.
// - A melisma — one syllable stretched across several chords via a run of
//   ellipsis padding ("Glo …………… -ria") — is detected (4+ consecutive `.`
//   or `…` characters) and bound as one chord cluster on the anchoring
//   syllable per BILINGUAL-SPEC.md §5.2, not distributed across the dots
//   column by column.
// - bindChinese's nearest-character search resolves an exact-distance tie
//   between two candidate characters by keeping whichever it found first
//   (lowest index) — this can silently cluster two chords that belong on
//   two different syllables onto one character, dropping the syllable after
//   it entirely. Confirmed against real archives twice: 伯利恒/"Beth-le-hem"
//   and 下降/"is come" both need one chord per character, but the tie-break
//   crammed two chords onto the middle/first character and left the last
//   one bare. Not fixed here — there's no general rule for which candidate
//   a tie *should* favor — but flagged: whenever bindChinese clusters two
//   tokens that bindEnglish kept on separate syllables for the same chord
//   line, that's flagged as `tie-break-cluster` (review-tier), since a real
//   melisma or an intentionally-shared syllable would cluster in English
//   too and never trip it. Hand-check and split flagged lines the same way
//   the two confirmed cases above were fixed.
// - Tab characters inside a *chord* line (not observed in testing, but
//   handled defensively) are expanded to the next multiple of
//   TAB_WIDTH columns; this is an unverified guess, not a measured value.
// - Script detection (zh-Hant vs zh-Hans) only runs when the song has
//   Chinese text at all (in the body or the title) — a song with none gets
//   `langs: ['en']`, not a guessed Chinese script. When Chinese text *is*
//   present, detection uses a hand-curated dictionary of common
//   worship-vocabulary simplified/traditional pairs — not a full
//   OpenCC-equivalent converter. A song whose Chinese text contains none of
//   the dictionary's distinguishing characters falls back to zh-Hant and is
//   flagged in the report as low-confidence, since that's a genuinely
//   undecidable case for this tool, not something to silently guess past.
// - Title parsing strips a leading service-role marker ("RESPONSE:",
//   "REPRISE:" — see ROLE_PREFIXES) and a trailing key marker ("(C)", "(f)"
//   — matched case-insensitively against real key syntax, so a genuine
//   parenthetical like "(Unspeakable Joy)" survives) before splitting
//   English from Chinese. Beyond that, splitting still assumes the
//   remaining text is exactly "ENGLISH TITLE<space>中文標題" with no other
//   separators; a title with a slash or interleaved scripts may still split
//   incorrectly. A stripped role is carried as `planLabel` on the Song
//   Order sidecar, never into songs.json.
// - A chord line's bold-ness is read at the paragraph level (is the first
//   non-empty run bold), not per-character-run — a chord line that's only
//   *partially* bold in the source won't be detected as a chord line.
// - Chord-only lines are emitted as space-joined tokens; literal "|"
//   bar-line characters in the source pass through as-is, but this tool
//   never invents bar lines that aren't already in the text.
// - The Song Order sidecar wraps the table under `sectionOverrides`
//   (alongside `title` and, when present, `planLabel`) rather than being
//   the bare table. Its shape still deviates from BILINGUAL-SPEC.md §6.3's
//   own flat `{section: mode}` illustration: real Song Order tables repeat
//   a section name with a *different* language on a later occurrence (e.g.
//   "Verse" sung in English, then again in Chinese later in the same
//   service) — a flat map would silently lose the earlier occurrence. This
//   tool's `sectionOverrides` keys by section but stores an ordered array
//   of occurrences per section instead of a single value.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { SECTION_HEADERS, matchSectionHeader, slugify } from '../js/chart-constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const TAB_WIDTH = 4; // unverified guess — see "Known failure modes" above

// ───────────────────────── CLI ─────────────────────────

function parseArgs(argv) {
    const args = {
        files: [],
        force: false,
        dryRun: false,
        skipTitles: [],
        chartsDir: path.join(REPO_ROOT, 'charts'),
        outDir: path.join(REPO_ROOT, 'tools', 'out')
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--force') args.force = true;
        else if (a === '--dry-run') args.dryRun = true;
        else if (a === '--skip-title') args.skipTitles.push(argv[++i]);
        else if (a === '--charts-dir') args.chartsDir = path.resolve(argv[++i]);
        else if (a === '--out-dir') args.outDir = path.resolve(argv[++i]);
        else args.files.push(a);
    }
    return args;
}

// ───────────────────────── OOXML extraction ─────────────────────────

async function loadDocumentXml(docxPath) {
    const buf = await readFile(docxPath);
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error(`${docxPath}: not a valid .docx (no word/document.xml found in the zip)`);
    return entry.async('string');
}

function elementChildren(node, tagName) {
    const out = [];
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1 && (!tagName || child.nodeName === tagName)) out.push(child);
    }
    return out;
}

function textOfRun(runEl) {
    let out = '';
    for (const child of Array.from(runEl.childNodes)) {
        if (child.nodeType !== 1) continue;
        if (child.nodeName === 'w:t') out += child.textContent;
        else if (child.nodeName === 'w:tab') out += '\t';
        else if (child.nodeName === 'w:br') out += '\n';
    }
    return out;
}

function runFlag(runEl, tag) {
    const rPr = elementChildren(runEl, 'w:rPr')[0];
    if (!rPr) return false;
    const el = elementChildren(rPr, tag)[0];
    if (!el) return false;
    const val = el.getAttribute('w:val');
    return val === null || val === '' || val === '1' || val.toLowerCase() === 'true';
}

const isRunBold = (r) => runFlag(r, 'w:b');
const isRunItalic = (r) => runFlag(r, 'w:i');

function paragraphRuns(pEl) {
    return Array.from(pEl.getElementsByTagName('w:r'));
}

function paragraphText(pEl) {
    return paragraphRuns(pEl).map(textOfRun).join('');
}

function paragraphIsBold(pEl) {
    const withText = paragraphRuns(pEl).filter(r => textOfRun(r).trim().length > 0);
    if (withText.length === 0) return false;
    return isRunBold(withText[0]);
}

function paragraphIsItalic(pEl) {
    const withText = paragraphRuns(pEl).filter(r => textOfRun(r).trim().length > 0);
    if (withText.length === 0) return false;
    return isRunItalic(withText[0]);
}

function paragraphStyle(pEl) {
    const pPr = elementChildren(pEl, 'w:pPr')[0];
    if (!pPr) return null;
    const pStyle = elementChildren(pPr, 'w:pStyle')[0];
    return pStyle ? pStyle.getAttribute('w:val') : null;
}

// Direct-child paragraphs/tables of <w:body>, in document order.
function getBodyBlocks(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const body = doc.getElementsByTagName('w:body')[0];
    const blocks = [];
    for (const child of Array.from(body.childNodes)) {
        if (child.nodeType !== 1) continue;
        if (child.nodeName === 'w:p') {
            blocks.push({
                type: 'p',
                el: child,
                text: paragraphText(child),
                bold: paragraphIsBold(child),
                italic: paragraphIsItalic(child),
                style: paragraphStyle(child)
            });
        } else if (child.nodeName === 'w:tbl') {
            blocks.push({ type: 'tbl', el: child });
        }
        // w:sectPr and anything else at body level is page setup — ignored.
    }
    return blocks;
}

// ───────────────────────── Song Order table ─────────────────────────

function cellRuns(tcEl) {
    return Array.from(tcEl.getElementsByTagName('w:r'))
        .map(r => ({ text: textOfRun(r), bold: isRunBold(r), italic: isRunItalic(r) }))
        .filter(r => r.text.length > 0);
}

// A cell like bold("Chorus") + italic(" *Drums in") splits into a section
// name (the bold run(s)) and an optional note (the rest, cosmetic leading
// "*" stripped).
function splitSectionAndNote(tcEl) {
    const runs = cellRuns(tcEl);
    const section = runs.filter(r => r.bold).map(r => r.text).join('').trim();
    let note = runs.filter(r => !r.bold).map(r => r.text).join('').trim().replace(/^\*+\s*/, '');
    return { section, note: note || undefined };
}

function cellText(tcEl) {
    return cellRuns(tcEl).map(r => r.text).join('').trim();
}

function mapLanguageWord(word, ctx) {
    const w = word.toLowerCase();
    if (w.includes('english') && w.includes('chinese')) return 'en-zh';
    if (w.startsWith('en')) return 'en';
    if (w.startsWith('ch') || w.includes('chinese')) return 'zh';
    ctx.flag({ reason: 'unrecognized-song-order-language', detail: word });
    return null;
}

// Returns { Verse: ["en", {mode:"en", note:"Drums in"}, "zh", ...], ... } —
// keyed by section (per the task), but each value is an ordered array of
// occurrences, not a single value. See "Known failure modes" above for why:
// a real Song Order table can list the same section twice with a different
// language, which a flat {section: mode} map would silently lose.
function parseSongOrderTable(tblEl, ctx) {
    const rows = Array.from(tblEl.getElementsByTagName('w:tr'));
    const order = {};
    for (const row of rows) {
        const cells = Array.from(row.getElementsByTagName('w:tc'));
        if (cells.length < 2) continue; // the "Song Order:" header row spans both columns
        const { section, note } = splitSectionAndNote(cells[0]);
        if (!section) continue;
        const mode = mapLanguageWord(cellText(cells[1]), ctx);
        if (!mode) continue;
        const entry = note ? { mode, note } : mode;
        (order[section] ||= []).push(entry);
    }
    return Object.keys(order).length > 0 ? order : null;
}

// ───────────────────────── Front matter ─────────────────────────

const CJK_RE = /[㐀-鿿豈-﫿]/;

const TITLE_CASE_LOWER = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is'
]);

// Capitalizes the word's first *letter*, not its first character — a word
// like "(unspeakable" (a title-cased-lowercased leading parenthetical) needs
// its 'u' capitalized, not its '(', which `charAt(0)` would silently no-op
// on and leave the whole word lowercase.
function capitalizeWord(w) {
    const i = w.search(/[a-z]/i);
    if (i === -1) return w;
    return w.slice(0, i) + w[i].toUpperCase() + w.slice(i + 1);
}

function titleCase(str) {
    const words = str.toLowerCase().split(/\s+/).filter(Boolean);
    return words
        .map((w, i) => (i !== 0 && i !== words.length - 1 && TITLE_CASE_LOWER.has(w))
            ? w
            : capitalizeWord(w))
        .join(' ');
}

// A worship-pack title convention this tool needs to see through: a
// service-role marker prefixed onto the title ("RESPONSE: Angels We Have
// Heard on High") and/or a trailing key marker suffixed onto it ("... (F)").
// Neither is part of the song's identity — the role belongs on the setlist
// entry (as `planLabel`), and the key belongs in `data-key` — but a *real*
// parenthetical like "(Unspeakable Joy)" in "Joy to the World (Unspeakable
// Joy) (C)" must survive untouched, since it's part of the title.

const ROLE_PREFIXES = ['RESPONSE', 'REPRISE'];
const ROLE_PREFIX_RE = new RegExp(`^(${ROLE_PREFIXES.join('|')})\\s*:\\s*`, 'i');

function stripRolePrefix(rawTitle) {
    const m = rawTitle.match(ROLE_PREFIX_RE);
    if (!m) return { title: rawTitle, role: undefined };
    // m[1] is the verbatim matched text, not a canonicalized template — a
    // source doc that writes "RESPONSE:" gets planLabel "RESPONSE", not a
    // re-cased "Response"; the role is preserved exactly as authored.
    return { title: rawTitle.slice(m[0].length), role: m[1] };
}

// A trailing "(<key>)" is stripped only when its contents actually parse as
// a key — a letter, optional accidental, optional minor — which is what
// separates "(C)"/"(f)" (a key marker; these docs write it in both cases)
// from "(Unspeakable Joy)" (part of the title). Only ever tried once, on
// whatever parenthetical is truly last, so "(Unspeakable Joy) (C)" strips
// just the trailing "(C)" and leaves "(Unspeakable Joy)" alone.
const KEY_TOKEN_RE = /^[A-Ga-g](#|b)?m?$/;

function stripTrailingKeyParen(rawTitle) {
    const m = rawTitle.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (!m) return { title: rawTitle, key: undefined };
    const inner = m[2].trim();
    if (!KEY_TOKEN_RE.test(inner)) return { title: rawTitle, key: undefined };
    return { title: m[1], key: inner.charAt(0).toUpperCase() + inner.slice(1) };
}

// Sibling of stripTrailingKeyParen for the bold-only pack (see the header
// comment's third shape): the trailing key marker there is square-bracketed
// ("... [G]") rather than parenthesized ("... (C)"). Square brackets are
// also section-header syntax ("[Verse 1]"), but that never collides here: a
// standalone header line is *entirely* the bracket, while a title's trailing
// key marker always has real title text before it — isBoldPlainParagraph()
// already rejects any line that is only a bracket before this ever runs.
function stripTrailingKeyBracket(rawTitle) {
    const m = rawTitle.match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/);
    if (!m) return { title: rawTitle, key: undefined };
    const inner = m[2].trim();
    if (!KEY_TOKEN_RE.test(inner)) return { title: rawTitle, key: undefined };
    return { title: m[1], key: inner.charAt(0).toUpperCase() + inner.slice(1) };
}

function splitTitle(rawTitle) {
    const { title: withoutRole, role } = stripRolePrefix(rawTitle.trim());
    const { title: withoutKey, key } = stripTrailingKeyParen(withoutRole.trim());
    const m = withoutKey.match(CJK_RE);
    if (!m) return { titleEn: titleCase(withoutKey.trim()), titleZh: undefined, key, role };
    return {
        titleEn: titleCase(withoutKey.slice(0, m.index).trim()),
        titleZh: withoutKey.slice(m.index).trim(),
        key, role
    };
}

// Bold-only pack (#1/#2 in the review): the title is two separate bold
// paragraphs, English then Chinese, rather than one paragraph combining both
// scripts — so unlike splitTitle() above, there's no single string to split
// on a CJK boundary. Each paragraph carries its own trailing "[Key]" marker
// (confirmed against the source: both lines repeat it), so both are stripped
// independently rather than assuming the Chinese line inherits the English
// line's key.
function splitPairedTitle(enText, zhText) {
    const { title: withoutRole, role } = stripRolePrefix(enText.trim());
    const { title: titleEnRaw, key: keyEn } = stripTrailingKeyBracket(withoutRole.trim());
    const { title: titleZhRaw, key: keyZh } = stripTrailingKeyBracket(zhText.trim());
    return {
        titleEn: titleCase(titleEnRaw.trim()),
        titleZh: titleZhRaw.trim(),
        key: keyEn || keyZh,
        role
    };
}

function parseCcliLine(text) {
    const m = text.match(/CCLI Song #:\s*(\S+)/i);
    return m ? m[1] : undefined;
}

function parseKeyTimeBpmLine(text) {
    const fields = text.split('\t').map(f => f.trim()).filter(Boolean);
    const out = {};
    for (const f of fields) {
        let m;
        if ((m = f.match(/^Key:\s*(.+)$/i))) out.key = m[1].trim();
        else if ((m = f.match(/^Time:\s*(.+)$/i))) out.timeSignature = `${m[1].trim()} time`;
        else if ((m = f.match(/^BPM\s*=\s*(.+)$/i))) {
            const val = m[1].trim();
            if (val && val !== '-' && val !== '?') out.bpm = val;
        }
    }
    return out;
}

// ───────────────────────── Chart-body chord grammar ─────────────────────────
// Same grammar as js/chart-parser.js / js/chart-render.js / js/app.js —
// duplicated rather than imported, matching how this regex already exists
// independently in three places in the site's own code.

const CHORD_TOKEN_SCAN = /\b([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?(?=\s|$)/g;
const CHORD_PRESENCE = /\b[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G](?:#|b)?)?\b/;

function extractChordTokens(rawLine) {
    const expanded = expandTabs(rawLine);
    const tokens = [];
    CHORD_TOKEN_SCAN.lastIndex = 0;
    let m;
    while ((m = CHORD_TOKEN_SCAN.exec(expanded)) !== null) {
        tokens.push({ col: m.index, rawToken: m[0] });
    }
    return tokens;
}

function expandTabs(text) {
    if (!text.includes('\t')) return text;
    let out = '';
    let col = 0;
    for (const ch of text) {
        if (ch === '\t') {
            const next = Math.ceil((col + 1) / TAB_WIDTH) * TAB_WIDTH;
            out += ' '.repeat(next - col);
            col = next;
        } else {
            out += ch;
            col += 1;
        }
    }
    return out;
}

const SECTION_HEADER_LINE = new RegExp(`^\\[((?:${SECTION_HEADERS.join('|')}).*?)\\]$`, 'i');
const isCjk = (text) => CJK_RE.test(text);

// The "family" a section belongs to for chord-reuse purposes (#1 below):
// "Verse 1", "Verse 2", and "Verse" are all the same family, "Verse", even
// though "Final Chorus" and "Chorus" are deliberately different families.
// Reuses chart-constants.js's canonicalization (the same one the renderer
// and validator use) rather than a fresh regex, then strips back to just
// the canonical header word by finding which entry it's a prefix of —
// checked longest-first so "Final Chorus 2" resolves to "Final Chorus", not
// "Chorus".
const SECTION_HEADERS_BY_LENGTH = [...SECTION_HEADERS].sort((a, b) => b.length - a.length);

function sectionFamily(rawName) {
    const canonical = matchSectionHeader(rawName) || rawName;
    for (const h of SECTION_HEADERS_BY_LENGTH) {
        if (canonical === h || canonical.startsWith(h + ' ')) return h;
    }
    return canonical;
}

function classifyBodyParagraph(p) {
    const trimmed = p.text.trim();
    if (!trimmed) return { kind: 'blank' };
    if (SECTION_HEADER_LINE.test(trimmed)) return { kind: 'header', name: trimmed.match(SECTION_HEADER_LINE)[1] };
    if (!SECTION_HEADER_LINE.test(trimmed) && /^\[.+\]$/.test(trimmed)) return { kind: 'header-unrecognized', name: trimmed };
    if (p.bold) return { kind: 'chord', raw: expandTabs(p.text) };
    if (isCjk(trimmed)) return { kind: 'zh', raw: expandTabs(p.text) };
    return { kind: 'en', raw: expandTabs(p.text) };
}

// A real chord-only line is *made of* chord tokens and separators — unlike
// CHORD_PRESENCE (used elsewhere for a much narrower "does the body start
// yet" test), this rejects prose that merely contains one chord-shaped word,
// which matters here because a title's trailing key marker ("... (C)") reads
// exactly like a one-chord chord line to a bare substring test.
function looksLikeChordOnlyLine(trimmed) {
    const tokens = extractChordTokens(trimmed);
    if (tokens.length === 0) return false;
    let stripped = trimmed;
    for (const t of tokens) stripped = stripped.replace(t.rawToken, '');
    return /^[\s|.]*$/.test(stripped);
}

// A bold paragraph that is neither a chord-only line nor a bracketed section
// header — by elimination, in a pack with no other styling to lean on (see
// isBoldTitlePair below), that's a title line and nothing else it could be.
function isBoldPlainParagraph(b) {
    if (b.type !== 'p' || !b.bold) return false;
    const trimmed = b.text.trim();
    if (!trimmed) return false;
    if (looksLikeChordOnlyLine(trimmed)) return false;
    if (SECTION_HEADER_LINE.test(trimmed) || /^\[.+\]$/.test(trimmed)) return false;
    return true;
}

// Third song-boundary shape (see the header comment): a bold-only pack with
// no Heading3 and no italic anywhere, so bold-ness alone can't discriminate
// a title from a chord line or section header (both bold too) — every bold
// paragraph in such a pack is provably one of exactly three things (chord
// line, section header, or title), so "bold and neither of the other two" is
// unambiguous once those are excluded. But a lone bold-plain paragraph isn't
// enough on its own to declare a song boundary — some future pack could use
// bold for a plain aside — so this only fires on the *pair*: a bold-plain
// paragraph immediately followed by a second bold-plain paragraph whose text
// is Chinese, matching the "English title, then Chinese title" shape
// actually observed in the source.
function isBoldTitlePair(blocks, i) {
    if (!isBoldPlainParagraph(blocks[i])) return false;
    const next = blocks[i + 1];
    return Boolean(next) && isBoldPlainParagraph(next) && isCjk(next.text.trim());
}

// A song boundary is one of three shapes — see the header comment. The
// negative conditions below are a backstop, not the primary test: a
// bold+italic line that's actually a chord line or section header (neither
// of which are italic in practice, but nothing guarantees that of every
// archive) is rejected so a stray formatting quirk can't fabricate a phantom
// song boundary.
function isSongTitleBlock(blocks, i) {
    const b = blocks[i];
    if (b.type !== 'p') return false;
    const trimmed = b.text.trim();
    if (!trimmed) return false;
    const looksLikeChordLine = b.bold && looksLikeChordOnlyLine(trimmed);
    const looksLikeHeader = SECTION_HEADER_LINE.test(trimmed) || /^\[.+\]$/.test(trimmed);
    if (looksLikeChordLine || looksLikeHeader) return false;
    if (b.style === 'Heading3') return true;
    if (b.bold && b.italic) return true;
    return isBoldTitlePair(blocks, i);
}

// ───────────────────────── East-Asian width & Chinese binding ─────────────────────────

function eastAsianWidth(ch) {
    const cp = ch.codePointAt(0);
    if (
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0x2E80 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7A3) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFF00 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6)
    ) return 2;
    return 1;
}

function visualCharMap(rawLine) {
    const chars = [];
    let col = 0;
    for (const ch of rawLine) {
        if (!/\s/.test(ch)) chars.push({ ch, col });
        col += /\s/.test(ch) ? 1 : eastAsianWidth(ch);
    }
    return chars;
}

// ───────────────────────── Word boundaries (English/Latin only) ─────────────────────────
// A word boundary — for deciding whether a chord lands cleanly "at the
// start of a word" in bindEnglish below — is a run of whitespace, or a
// single hyphen, en dash (–), or em dash (—). "Beth-le-hem" and "new-born"
// both carry real internal syllable boundaries a chord legitimately lands
// on; treating the whole hyphenated compound as one word (whitespace-only
// boundaries) was misreading an intentional syllable split as a multi-
// column binding error. An apostrophe is deliberately NOT a boundary:
// "th'" and "heav'nly" (both appear in this corpus) are each one word —
// unlike a hyphenated pair, neither is a compound of two independent
// words, so splitting on the apostrophe would invent a word start nothing
// in the source implies.
//
// This model is specific to Latin-script binding. bindChinese below does
// NOT use it and never has: CJK text has no whitespace-delimited "words" to
// find boundaries between in the first place (BILINGUAL-SPEC.md §5.2 binds
// CJK by display-width column instead) — every character is already its
// own valid anchor, via visualCharMap, so there's no boundary concept to
// share or reuse here.
const WORD_BOUNDARY_RE = /[\s\-–—]+/g;

function computeWordStarts(lyric) {
    const starts = new Set([0]);
    for (const m of lyric.matchAll(WORD_BOUNDARY_RE)) starts.add(m.index + m[0].length);
    return starts;
}

// A hand-typed chord row measured against real archives lands, when it
// misses a word start at all, almost always a couple of columns *after*
// it (a padding-heavy row rendering slightly too far right relative to the
// lyric row beneath it) — landing before one had no real examples once
// hyphens count as boundaries (above). So only backward drift is corrected,
// and only within a small tolerance: snapping forward, or snapping a large
// backward gap, would "fix" a failure mode the data doesn't show, and risks
// moving a chord that's correctly placed deep in a word on purpose — a
// stressed second syllable ("pre-PARE") is completely normal chord-chart
// notation, not a binding error, and nothing about column position alone
// can tell the two apart past this tolerance.
const WORD_SNAP_TOLERANCE = 2;

// ───────────────────────── Binding ─────────────────────────

// Returns { text, groupOf } — groupOf[i] is the final output column token[i]
// landed on, parallel to `tokens`. Exposed (not just the bound string) so
// the caller can tell whether two tokens ended up sharing a position here —
// the cross-language tie-break check below needs exactly that, compared
// against bindChinese's own groupOf for the same tokens.
function bindEnglish(tokens, rawLyric, ctx) {
    const lyric = rawLyric.replace(/\s+$/, '');
    if (tokens.length === 0) return { text: lyric, groupOf: [] };

    const wordStarts = computeWordStarts(lyric);
    const wordStartsAsc = [...wordStarts].sort((a, b) => a - b);

    const inserts = new Map();
    const groupOf = [];
    let cursor = 0;
    for (const tok of tokens) {
        let col = tok.col;
        if (col > lyric.length) {
            ctx.flag({ chord: tok.rawToken, lyric, reason: 'trailing-beyond-line' });
            col = lyric.length;
        } else if (!wordStarts.has(col)) {
            let backStart = 0;
            for (const ws of wordStartsAsc) { if (ws <= col) backStart = ws; else break; }
            const backDist = col - backStart;
            if (backDist > 0 && backDist <= WORD_SNAP_TOLERANCE) {
                ctx.flag({ chord: tok.rawToken, lyric, reason: `word-snap-${backDist}`, detail: `snapped back ${backDist} column(s) from ${col} to word start ${backStart}` });
                col = backStart;
            } else {
                const anchor = col < lyric.length ? `before ${JSON.stringify(lyric[col])}` : 'at end of line';
                ctx.flag({ chord: tok.rawToken, lyric, reason: 'mid-word', detail: `bound ${anchor}, column ${col}` });
            }
        }
        if (col < cursor) {
            ctx.flag({ chord: tok.rawToken, lyric, reason: 'collision', detail: `column ${col} is before the previous chord's column ${cursor}` });
            col = cursor;
        }
        (inserts.get(col) || inserts.set(col, []).get(col)).push(tok.rawToken);
        groupOf.push(col);
        cursor = col;
    }

    let out = '';
    let last = 0;
    for (const col of [...inserts.keys()].sort((a, b) => a - b)) {
        out += lyric.slice(last, col);
        out += inserts.get(col).map(c => `[${c}]`).join('');
        last = col;
    }
    out += lyric.slice(last);
    return { text: out, groupOf };
}

// Same { text, groupOf } shape as bindEnglish — groupOf[i] here is the
// character *index* (not column) token[i] resolved to, since that's the
// unit bindChinese clusters on.
function bindChinese(tokens, rawLyric, ctx) {
    const chars = visualCharMap(rawLyric);
    if (tokens.length === 0 || chars.length === 0) return { text: chars.map(c => c.ch).join(''), groupOf: [] };

    const inserts = new Map();
    const groupOf = [];
    let lastIdx = -1;
    for (const tok of tokens) {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < chars.length; i++) {
            const d = Math.abs(chars[i].col - tok.col);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        if (bestDist !== 0) {
            ctx.flag({ chord: tok.rawToken, lyric: rawLyric.trim(), reason: `chi-drift-${bestDist}`, detail: `nearest character was ${JSON.stringify(chars[best].ch)}, ${bestDist} visual column(s) off` });
        }
        if (best < lastIdx) {
            ctx.flag({ chord: tok.rawToken, lyric: rawLyric.trim(), reason: 'collision', detail: `resolved position is before the previous chord's` });
            best = lastIdx;
        }
        (inserts.get(best) || inserts.set(best, []).get(best)).push(tok.rawToken);
        groupOf.push(best);
        lastIdx = best;
    }

    let out = '';
    for (let i = 0; i < chars.length; i++) {
        if (inserts.has(i)) out += inserts.get(i).map(c => `[${c}]`).join('');
        out += chars[i].ch;
    }
    return { text: out, groupOf };
}

// A melisma line — one syllable stretched across a chord change (or
// several) via a run of ellipsis padding, e.g. "Glo …………… -ria in excelsis
// Deo!" under chords "F Gm F C F Gm C". Column-based binding is meaningless
// *inside the run itself* (there's no real word boundary in the dots to
// anchor to), so this is detected up front and handled as its own case per
// BILINGUAL-SPEC.md §5.2. But only the chords whose column falls at or
// before the end of the run belong on the anchor syllable — chords past the
// run sit over real later words ("-ria in excelsis Deo!") and bind by
// ordinary column math same as any other line, including the ordinary
// mid-word flags hand-typed drift produces elsewhere. Clustering *all* of a
// melisma line's chords onto the anchor, regardless of where they actually
// fall, was an earlier over-correction. 4+ consecutive dot/ellipsis
// characters is the run threshold — long enough that an ordinary
// trailing-off "..." in a lyric ("I will follow...") doesn't false-positive.
const MELISMA_RUN_RE = /[.…]{4,}/;
const isMelismaLine = (rawLyric) => MELISMA_RUN_RE.test(rawLyric);

function bindMelismaLine(kind, tokens, rawLyric, ctx) {
    const runMatch = rawLyric.match(MELISMA_RUN_RE);
    const runEnd = runMatch.index + runMatch[0].length;
    const clusterTokens = tokens.filter(t => t.col < runEnd);
    const trailingTokens = tokens.filter(t => t.col >= runEnd);

    // Bind the trailing (post-run) chords first, via the same binder any
    // ordinary line would use — same columns, same flagging — leaving the
    // run itself untouched since no trailing token targets it. Melisma
    // clustering is deliberate here (that's the whole point of this
    // function), so the cross-language tie-break check doesn't apply —
    // .groupOf is simply unused on this path.
    const trailingBound = (kind === 'en'
        ? bindEnglish(trailingTokens, rawLyric, ctx)
        : bindChinese(trailingTokens, rawLyric, ctx)).text;

    if (clusterTokens.length === 0) return trailingBound;

    const leadWs = (trailingBound.match(/^\s*/) || [''])[0];
    const rest = trailingBound.slice(leadWs.length);
    const cluster = clusterTokens.map(t => `[${t.rawToken}]`).join('');
    return leadWs + cluster + rest;
}

// The tie-break clustering bug documented in "Known failure modes" above:
// bindChinese's nearest-character search resolves ties by keeping whichever
// candidate it found first (lowest index), which can silently collapse two
// chords that belong on two different syllables onto one CJK character —
// confirmed against real archives (a hyphenated transliteration like
// 伯利恒/"Beth-le-hem", a compound like 下降/"is come", both one syllable per
// character) where the fix was to hand-split the cluster after the fact.
// This doesn't fix the tie-break itself (that would need picking a
// direction to favor with no general rule for which is right); it instead
// flags the specific, checkable signal that a real mismatch happened:
// English kept two tokens on separate syllables (different groupOf values)
// but Chinese clustered the same two tokens onto one character (same
// groupOf value). A true melisma or a token pair that's *supposed* to
// share a syllable never triggers this, since English would cluster them
// too in that case.
function flagTieBreakClusterMismatch(tokens, enGroupOf, zhGroupOf, zhRawLyric, ctx) {
    for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
            if (zhGroupOf[i] === zhGroupOf[j] && enGroupOf[i] !== enGroupOf[j]) {
                ctx.flag({
                    chord: `${tokens[i].rawToken}+${tokens[j].rawToken}`,
                    lyric: zhRawLyric.trim(),
                    reason: 'tie-break-cluster',
                    detail: `English keeps "${tokens[i].rawToken}" and "${tokens[j].rawToken}" on separate syllables, but the nearest-character search clustered them onto one Chinese character — likely needs a hand split, see "Known failure modes" above`
                });
            }
        }
    }
}

// ───────────────────────── Chart-body assembly ─────────────────────────

function buildChartBody(bodyParagraphs, ctx) {
    const blocks = bodyParagraphs.map(classifyBodyParagraph);

    // #1: does each header's section (everything until the next header)
    // contain a real chord line of its own? Computed up front so that when
    // we reach a chordless section we already know whether an earlier
    // same-family section exists to reuse via {chords: <section>} — later
    // verses commonly repeat verse 1's progression with no chord line at
    // all, and inventing per-syllable bindings for them would assert a
    // precision (exactly where each chord lands on *this* verse's
    // differently-worded lyrics) the source never claimed.
    const sectionHasChords = new Array(blocks.length).fill(false);
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].kind !== 'header') continue;
        for (let j = i + 1; j < blocks.length && blocks[j].kind !== 'header' && blocks[j].kind !== 'header-unrecognized'; j++) {
            if (blocks[j].kind === 'chord') { sectionHasChords[i] = true; break; }
        }
    }
    const familyFirstSection = new Map(); // family -> name of its first chorded section

    const outputLines = [];
    let pendingChord = null;
    let pendingChordUsed = false;

    const pushBlankIfNeeded = () => {
        if (outputLines.length && outputLines[outputLines.length - 1] !== '') outputLines.push('');
    };
    const flushPendingChord = () => {
        if (pendingChord && !pendingChordUsed) {
            outputLines.push(pendingChord.tokens.map(t => t.rawToken).join(' '));
        }
        pendingChord = null;
        pendingChordUsed = false;
    };

    for (let idx = 0; idx < blocks.length; idx++) {
        const block = blocks[idx];
        switch (block.kind) {
            case 'header': {
                flushPendingChord();
                pushBlankIfNeeded();
                outputLines.push(`[${block.name}]`);

                const family = sectionFamily(block.name);
                if (sectionHasChords[idx]) {
                    if (!familyFirstSection.has(family)) familyFirstSection.set(family, block.name);
                } else if (familyFirstSection.has(family)) {
                    outputLines.push(`{chords: ${familyFirstSection.get(family)}}`);
                } else {
                    ctx.flag({ reason: 'no-chords-in-section', detail: `section "${block.name}" has no chord line and no earlier section in the same family to reuse via {chords: ...}` });
                }
                break;
            }
            case 'header-unrecognized':
                flushPendingChord();
                ctx.flag({ reason: 'unrecognized-section-header', detail: block.name });
                pushBlankIfNeeded();
                outputLines.push(block.name);
                break;
            case 'blank':
                flushPendingChord();
                pushBlankIfNeeded();
                break;
            case 'chord':
                flushPendingChord();
                pendingChord = { tokens: extractChordTokens(block.raw), raw: block.raw };
                pendingChordUsed = false;
                break;
            case 'en':
            case 'zh': {
                const tokens = pendingChord ? pendingChord.tokens : [];
                let bound;
                if (tokens.length > 0 && isMelismaLine(block.raw)) {
                    bound = bindMelismaLine(block.kind, tokens, block.raw, ctx);
                } else if (block.kind === 'en') {
                    const result = bindEnglish(tokens, block.raw, ctx);
                    bound = result.text;
                    // Cross-check against the Chinese binding for this same
                    // chord line, whichever order en/zh happen to appear in
                    // the source — only fires once, whichever language is
                    // processed second, against whichever was stored first.
                    if (pendingChord && tokens.length > 0 && pendingChord.zhGroupOf) {
                        flagTieBreakClusterMismatch(tokens, result.groupOf, pendingChord.zhGroupOf, pendingChord.zhRaw, ctx);
                    }
                    if (pendingChord) pendingChord.enGroupOf = result.groupOf;
                } else {
                    const result = bindChinese(tokens, block.raw, ctx);
                    bound = result.text;
                    if (pendingChord && tokens.length > 0 && pendingChord.enGroupOf) {
                        flagTieBreakClusterMismatch(tokens, pendingChord.enGroupOf, result.groupOf, block.raw, ctx);
                    }
                    if (pendingChord) { pendingChord.zhGroupOf = result.groupOf; pendingChord.zhRaw = block.raw; }
                }
                outputLines.push(`${block.kind}: ${bound}`);
                if (pendingChord) pendingChordUsed = true;
                break;
            }
        }
    }
    flushPendingChord();

    while (outputLines.length && outputLines[0] === '') outputLines.shift();
    while (outputLines.length && outputLines[outputLines.length - 1] === '') outputLines.pop();
    return outputLines.join('\n');
}

// ───────────────────────── Script detection ─────────────────────────
// Hand-curated, validated against characters actually present in the
// reference file — see "Known failure modes" in the header comment.

const SIMPLIFIED_TRADITIONAL_PAIRS = [
    ['为', '為'], ['万', '萬'], ['们', '們'], ['变', '變'], ['听', '聽'],
    ['圣', '聖'], ['权', '權'], ['洁', '潔'], ['赎', '贖'], ['远', '遠'],
    ['爱', '愛'], ['灵', '靈'], ['愿', '願'], ['显', '顯'], ['头', '頭'],
    ['领', '領'], ['飞', '飛'], ['马', '馬'], ['腾', '騰'], ['鹰', '鷹'],
    ['帮', '幫'], ['随', '隨'], ['时', '時'], ['门', '門'], ['开', '開'],
    ['关', '關'], ['乐', '樂'], ['个', '個'], ['见', '見'], ['现', '現'],
    ['实', '實'], ['还', '還'], ['将', '將'], ['说', '說'], ['话', '話'],
    ['认', '認'], ['识', '識'], ['护', '護'], ['宝', '寶'], ['问', '問'],
    ['对', '對'], ['发', '發'], ['长', '長'], ['亲', '親'], ['声', '聲'],
    ['岁', '歲'], ['儿', '兒'], ['苏', '穌'], ['诚', '誠'], ['丰', '豐'],
    ['风', '風'], ['颂', '頌'], ['赞', '讚'], ['荣', '榮'], ['体', '體'],
    ['兴', '興'], ['宁', '寧'], ['尽', '盡'], ['满', '滿'], ['怀', '懷'],
    ['宽', '寬'], ['写', '寫'], ['宠', '寵'], ['从', '從'], ['让', '讓'],
    ['围', '圍'], ['亚', '亞'], ['释', '釋'], ['赛', '賽'], ['启', '啟']
];
const SIMPLIFIED_ONLY = new Set(SIMPLIFIED_TRADITIONAL_PAIRS.map(([s]) => s));
const TRADITIONAL_ONLY = new Set(SIMPLIFIED_TRADITIONAL_PAIRS.map(([, t]) => t));

function detectScript(text) {
    let simp = 0, trad = 0;
    for (const ch of text) {
        if (SIMPLIFIED_ONLY.has(ch)) simp++;
        else if (TRADITIONAL_ONLY.has(ch)) trad++;
    }
    if (simp === 0 && trad === 0) return { script: 'zh-Hant', confident: false };
    return { script: simp >= trad ? 'zh-Hans' : 'zh-Hant', confident: true };
}

// ───────────────────────── Front matter / body split ─────────────────────────

function splitFrontMatterAndBody(blocks, titleParagraphCount) {
    let bodyStart = blocks.length;
    for (let i = titleParagraphCount; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type !== 'p') continue;
        const text = b.text.trim();
        if (!text) continue;
        if (SECTION_HEADER_LINE.test(text) || (b.bold && CHORD_PRESENCE.test(text))) {
            bodyStart = i;
            break;
        }
    }
    return { frontMatter: blocks.slice(titleParagraphCount, bodyStart), body: blocks.slice(bodyStart) };
}

// ───────────────────────── Per-song processing ─────────────────────────

function processSong(songBlocks, ctx) {
    // Bold-only pack (#1 in the review): a title spanning two separate bold
    // paragraphs (English, then Chinese, each with its own trailing "[Key]")
    // rather than one paragraph combining both scripts on the same line.
    // Reuses isBoldTitlePair() itself rather than re-deriving the shape, so
    // title *detection* (isSongTitleBlock) and title *parsing* here can't
    // disagree about which paragraphs the title actually spans.
    const pairedTitle = isBoldTitlePair(songBlocks, 0);
    const { titleEn, titleZh, key: titleKey, role } = pairedTitle
        ? splitPairedTitle(songBlocks[0].text, songBlocks[1].text)
        : splitTitle(songBlocks[0].text);
    ctx.song = titleEn;

    const titleParagraphCount = pairedTitle ? 2 : 1;
    const { frontMatter, body } = splitFrontMatterAndBody(songBlocks, titleParagraphCount);

    let ccli, key, timeSignature, bpm, songOrder = null;
    for (const b of frontMatter) {
        if (b.type === 'p') {
            const t = b.text.trim();
            if (!ccli) {
                const c = parseCcliLine(t);
                if (c) ccli = c;
            }
            if (!key && /Key:/i.test(t)) {
                const kt = parseKeyTimeBpmLine(b.text);
                key = kt.key;
                timeSignature = kt.timeSignature;
                bpm = kt.bpm;
            }
        } else if (b.type === 'tbl') {
            songOrder = parseSongOrderTable(b.el, ctx);
        }
    }
    // A "Key:" metadata line, when present, is authoritative; the title's
    // own trailing "(C)" marker only fills in for documents that never
    // write a metadata line at all (#3).
    if (!key) key = titleKey;

    const bodyParagraphs = body.filter(b => b.type === 'p');
    const bodyText = buildChartBody(bodyParagraphs, ctx);

    // #4: a song with no Chinese anywhere — not in the body, not in the
    // title — isn't bilingual at all, and guessing a script for a language
    // that's simply absent is a different, worse thing than the genuinely
    // undecidable case detectScript()'s fallback exists for (some Chinese
    // present, just none of it in the simplified/traditional dictionary).
    const allZhText = bodyParagraphs
        .map(p => p.text)
        .filter(isCjk)
        .join('');
    const hasChinese = Boolean(allZhText) || Boolean(titleZh);
    let langs;
    if (!hasChinese) {
        langs = ['en'];
    } else {
        const { script, confident } = detectScript(allZhText || titleZh || '');
        if (!confident) {
            ctx.flag({ reason: 'script-detection-fallback', detail: `no distinguishing simplified/traditional characters found; defaulted to ${script}` });
        }
        langs = ['en', script];
    }

    const slug = slugify(titleEn);
    const letter = (titleEn[0] || 'Z').toUpperCase();

    const chartHtml =
        `<pre class="chord-chart"\n` +
        `     data-format="bilingual"\n` +
        `     data-key="${key || ''}"\n` +
        `     data-langs="${langs.join(',')}"\n` +
        `     data-primary="en">\n` +
        `${bodyText}\n` +
        `</pre>\n`;

    const songEntry = {
        title: titleEn,
        ...(titleZh ? { titleZh } : {}),
        url: `charts/${letter}/${slug}.html`,
        format: 'bilingual',
        langs,
        ...(ccli ? { ccli } : {}),
        ...(bpm ? { bpm } : {}),
        ...(timeSignature ? { timeSignature } : {})
    };

    return { titleEn, letter, slug, chartHtml, songEntry, songOrder, role };
}

// ───────────────────────── File output ─────────────────────────

async function fileExists(p) {
    try { await access(p); return true; } catch { return false; }
}

async function writeChartFile(chartsDir, letter, slug, html, force, dryRun, log) {
    const dir = path.join(chartsDir, letter);
    const filePath = path.join(dir, `${slug}.html`);
    const exists = await fileExists(filePath);
    if (exists && !force) {
        log(`SKIP       ${path.relative(REPO_ROOT, filePath)} (already exists — pass --force to overwrite)`);
        return false;
    }
    if (dryRun) {
        log(`${exists ? 'WOULD OVERWRITE ' : 'WOULD WRITE     '} ${path.relative(REPO_ROOT, filePath)}`);
        return true;
    }
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, html, 'utf8');
    log(`${exists ? 'OVERWRITE ' : 'WRITE     '} ${path.relative(REPO_ROOT, filePath)}`);
    return true;
}

// ───────────────────────── Flag tiering ─────────────────────────
// Not every binding ambiguity deserves the same attention. A 1-column
// Chinese drift, or an English chord that already got snapped back onto a
// word start within WORD_SNAP_TOLERANCE, is routine noise from hand-typed
// padding — nearly every line in a real archive has one — while an
// unresolved mid-word English binding or a 2+ column Chinese drift is a
// real candidate for a wrong chord placement. Splitting them keeps the
// review-tier list — the one worth reading line by line — from drowning in
// cosmetic 1-column flags. Every other flag reason (collisions,
// unrecognized headers, script-detection fallback, a chordless section
// with nothing to reuse) defaults to review: none of them are the routine
// hand-typed-padding noise this tiering exists to filter out.
function flagTier(entry) {
    if (entry.reason === 'mid-word') return 'review';
    const chi = /^chi-drift-(\d+)$/.exec(entry.reason);
    if (chi) return Number(chi[1]) === 1 ? 'cosmetic' : 'review';
    const snap = /^word-snap-(\d+)$/.exec(entry.reason);
    if (snap) return Number(snap[1]) === 1 ? 'cosmetic' : 'review';
    return 'review';
}

// ───────────────────────── Main ─────────────────────────

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.files.length === 0) {
        console.error('Usage: node tools/docx-to-chart.mjs <file.docx> [<file.docx> ...] [--force] [--dry-run] [--skip-title <title>] [--charts-dir <dir>] [--out-dir <dir>]');
        process.exitCode = 1;
        return;
    }

    const log = (msg) => console.log(msg);
    let allResults = [];
    let allEntries = [];
    let allSongOrders = [];
    const ambiguities = [];
    let songCount = 0, writtenCount = 0, skippedCount = 0;

    for (const docxPath of args.files) {
        log(`\n=== ${docxPath} ===`);
        const xml = await loadDocumentXml(docxPath);
        const blocks = getBodyBlocks(xml);

        const songStarts = blocks
            .map((b, i) => isSongTitleBlock(blocks, i) ? i : -1)
            .filter(i => i !== -1);

        if (songStarts.length === 0) {
            log('  no song titles found (neither Heading3 nor bold+italic) — skipping this file');
            continue;
        }

        for (let s = 0; s < songStarts.length; s++) {
            const start = songStarts[s];
            const end = s + 1 < songStarts.length ? songStarts[s + 1] : blocks.length;
            const songBlocks = blocks.slice(start, end);

            const ctx = { song: null, flag(entry) { ambiguities.push({ song: ctx.song, ...entry, tier: flagTier(entry) }); } };
            const result = processSong(songBlocks, ctx);
            songCount++;

            const sections = result.chartHtml
                .split('\n')
                .map(l => l.trim())
                .filter(l => /^\[.+\]$/.test(l));
            const chordsRefs = result.chartHtml
                .split('\n')
                .map(l => l.trim())
                .filter(l => /^\{chords:.*\}$/.test(l));
            log(`  song: ${JSON.stringify(result.titleEn)}  sections: ${JSON.stringify(sections)}`);
            if (chordsRefs.length) log(`    chords refs: ${JSON.stringify(chordsRefs)}`);
            const dataKey = (result.chartHtml.match(/data-key="([^"]*)"/) || [, ''])[1];
            // Fixed shape, every field always present (null when absent) —
            // the previous conditional-spread version silently dropped
            // falsy fields from the object, which is how ccli/bpm/
            // timeSignature/sectionOverrides/planLabel being correctly
            // parsed for a song went unnoticed as "maybe not printed."
            log(`    metadata: ${JSON.stringify({
                key: dataKey || null,
                titleZh: result.songEntry.titleZh ?? null,
                langs: result.songEntry.langs,
                ccli: result.songEntry.ccli ?? null,
                bpm: result.songEntry.bpm ?? null,
                timeSignature: result.songEntry.timeSignature ?? null,
                planLabel: result.role ?? null,
                sectionOverrides: result.songOrder ?? null
            })}`);

            allResults.push(result);
            allEntries.push(result.songEntry);
            // #7: the sidecar is now the only automatic source of language-plan
            // data (no second annotated document to cross-check against), so it
            // carries both the Song Order table (as sectionOverrides — §6.3's
            // language-plan shape) and the title's service-role marker (as
            // planLabel, #6) rather than just the bare table.
            if (result.songOrder || result.role) {
                allSongOrders.push({
                    title: result.titleEn,
                    slug: result.slug,
                    planLabel: result.role,
                    sectionOverrides: result.songOrder
                });
            }
        }
    }

    if (args.skipTitles.length > 0) {
        const skipSet = new Set(args.skipTitles.map(t => t.toLowerCase()));
        const isSkipped = (r) => skipSet.has(r.titleEn.toLowerCase());
        const skipped = allResults.filter(isSkipped);
        for (const r of skipped) log(`\n  --skip-title matched ${JSON.stringify(r.titleEn)} — excluded from chart file, songs.json patch, and auto sidecar`);
        allResults = allResults.filter(r => !isSkipped(r));
        allEntries = allEntries.filter(e => !skipSet.has(e.title.toLowerCase()));
        allSongOrders = allSongOrders.filter(o => !skipSet.has(o.title.toLowerCase()));
    }

    // Collision pre-check: a batch run either writes cleanly or not at all.
    // Writing some chart files while silently skipping others (the old
    // per-file behavior) left the accompanying songs.json patch describing
    // songs whose chart file was never actually written this run — a
    // confusing partial state. --force still means "overwrite happily" and
    // skips this check entirely.
    //
    // Runs during --dry-run too, not just a real write. A dry run's whole
    // point is to preview what a real run would do; gating this on
    // `!args.dryRun` meant a colliding batch's dry run fell through to the
    // per-file writeChartFile() loop instead, which reported each collision
    // as an individual "SKIP ... already exists" line alongside "WOULD
    // WRITE" for the non-colliding songs — a preview that didn't match what
    // the real run would actually do (abort the whole batch, write nothing).
    //
    // Two independent checks, because either can miss what the other
    // catches: a file-path collision (same slug already on disk) doesn't
    // require a title match, and — the case that actually matters here — a
    // *title* collision against the existing songs.json doesn't require a
    // file-path match at all. Song identity is the title string (per
    // CLAUDE.md), and the 308-chart v1 corpus predates the slug convention
    // entirely (spaces, Title Case, e.g. "Angels We Have Heard On High.html")
    // — a song already in that corpus under its old filename will never
    // collide on path with this tool's new charts/<LETTER>/<slug>.html
    // output, but writing it anyway would silently fork one song into two
    // catalog entries. Matched case-insensitively, since that's the only
    // way "Angels We Have Heard On High" (existing) and "Angels We Have
    // Heard on High" (this run's title-cased output) are recognized as the
    // same song at all.
    if (!args.force) {
        let existingSongs = [];
        try {
            existingSongs = JSON.parse(await readFile(path.join(REPO_ROOT, 'data', 'songs.json'), 'utf8'));
        } catch { /* no songs.json yet — nothing to collide with */ }
        const existingByTitleLower = new Map(existingSongs.map(s => [s.title.toLowerCase(), s]));

        const collisions = [];
        for (const result of allResults) {
            const filePath = path.join(args.chartsDir, result.letter, `${result.slug}.html`);
            if (await fileExists(filePath)) {
                collisions.push({ title: result.titleEn, reason: `chart file already exists: ${path.relative(REPO_ROOT, filePath)}` });
                continue;
            }
            const existing = existingByTitleLower.get(result.titleEn.toLowerCase());
            if (existing) {
                collisions.push({ title: result.titleEn, reason: `title already in data/songs.json as ${JSON.stringify(existing.title)} -> ${existing.url}` });
            }
        }
        if (collisions.length > 0) {
            log(`\n--- Collision(s): ${collisions.length} song(s) already exist — nothing written ---`);
            for (const c of collisions) log(`  ${JSON.stringify(c.title)}: ${c.reason}`);
            log(`\nNo chart files, songs.json patch, or Song Order sidecars were written. Resolve the collision(s) by hand (rename/merge) and re-run, or pass --force to overwrite.`);
            process.exitCode = 1;
            return;
        }
    }

    for (const result of allResults) {
        const written = await writeChartFile(args.chartsDir, result.letter, result.slug, result.chartHtml, args.force, args.dryRun, log);
        written ? writtenCount++ : skippedCount++;
    }

    const patchPath = path.join(args.outDir, 'songs-patch.json');
    if (args.dryRun) {
        log(`\n(dry run — skipping songs.json patch and Song Order sidecar writes)`);
    } else {
        await mkdir(args.outDir, { recursive: true });
        await mkdir(path.join(args.outDir, 'song-order'), { recursive: true });

        for (const { slug, title, planLabel, sectionOverrides } of allSongOrders) {
            const sidecar = {
                title,
                ...(planLabel ? { planLabel } : {}),
                ...(sectionOverrides ? { sectionOverrides } : {})
            };
            await writeFile(
                path.join(args.outDir, 'song-order', `${slug}.json`),
                JSON.stringify(sidecar, null, 2) + '\n',
                'utf8'
            );
        }

        await writeFile(patchPath, JSON.stringify(allEntries, null, 2) + '\n', 'utf8');
    }

    const reviewFlags = ambiguities.filter(a => a.tier === 'review');
    const cosmeticCount = ambiguities.length - reviewFlags.length;
    log(`\n--- Ambiguity report (${ambiguities.length} item(s): ${reviewFlags.length} need review, ${cosmeticCount} cosmetic) ---`);
    if (reviewFlags.length === 0) {
        log(ambiguities.length === 0
            ? '(none — every binding landed on a confident anchor)'
            : `(no review-tier flags — ${cosmeticCount} cosmetic 1-column drift flag(s) omitted)`);
    } else {
        for (const a of reviewFlags) {
            const parts = [`[${a.song}]`, a.reason];
            if (a.chord) parts.push(`chord=${a.chord}`);
            if (a.lyric) parts.push(`lyric=${JSON.stringify(a.lyric)}`);
            if (a.detail) parts.push(a.detail);
            log('  ' + parts.join('  '));
        }
        if (cosmeticCount) log(`  (+ ${cosmeticCount} cosmetic 1-column drift flag(s) omitted)`);
    }

    log(`\n--- Summary ---`);
    log(`songs processed: ${songCount}`);
    if (args.dryRun) {
        log(`chart files that would be written: ${writtenCount}`);
        log(`chart files that would be skipped (already exist, use --force): ${skippedCount}`);
        log(`songs.json patch fragment: not written (dry run) — would have had ${allEntries.length} entries`);
        log(`Song Order sidecars: not written (dry run) — would have had ${allSongOrders.length}`);
    } else {
        log(`chart files written: ${writtenCount}`);
        log(`chart files skipped (already existed, use --force): ${skippedCount}`);
        log(`songs.json patch fragment: ${path.relative(REPO_ROOT, patchPath)} (${allEntries.length} entries — review and merge by hand)`);
        log(`Song Order sidecars: ${allSongOrders.length} written under ${path.relative(REPO_ROOT, path.join(args.outDir, 'song-order'))}/`);
    }
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
