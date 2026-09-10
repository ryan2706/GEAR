// Renders a parsed Chart (see chart-parser.js) into an HTML string. Pure —
// no DOM/global access — so it's testable in isolation.
//
// transposeChart() is a standalone export (not an internal-only detail) so
// callers that need a transposed Chart without wanting HTML — the docx
// setlist export in app.js — can get one directly, instead of extracting
// chord values back out of rendered markup. renderChart() itself is just
// "transposeChart(), then render the result," so both consumers share one
// transposition implementation.

import { transposeNote } from './chord-theory.js';
import { matchSectionHeader } from './chart-constants.js';
import { findModulations } from './chart-parser.js';

const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CHORD_NAME = /^([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?$/;

function transposeChordString(chordStr, semitones, targetKeyIndex) {
    const match = chordStr.match(CHORD_NAME);
    if (!match) return chordStr; // pass through anything unrecognized (e.g. "N.C.")

    const [, root, suffix, bass] = match;
    const newRoot = transposeNote(root, semitones, targetKeyIndex);
    const newBass = bass ? '/' + transposeNote(bass.slice(1), semitones, targetKeyIndex) : '';
    return newRoot + (suffix || '') + newBass;
}

// ── transposeChart ──
//
// v1 lines carry pre-parsed {root, suffix, bass, start, end} tokens (see
// chart-parser.js) pointing into the *original* padded line. Rebuilding the
// line's text left-to-right and appending each token's transposed value (as
// opposed to mutating in place) is what keeps offsets correct even when a
// transposed chord name is a different length than the original — the
// output token's start/end are recorded against the *new* text as it's
// built, the same left-to-right accumulation the old inline splicer used
// for HTML, just producing plain text + fresh offsets instead of markup.
function transposeV1Line(line, semitones, targetKeyIndex) {
    if (line.kind !== 'chord') return { kind: 'other', text: line.text };

    let text = '';
    let lastIndex = 0;
    const tokens = [];
    for (const token of line.tokens) {
        text += line.text.slice(lastIndex, token.start);
        const newRoot = transposeNote(token.root, semitones, targetKeyIndex);
        const newBass = token.bass ? '/' + transposeNote(token.bass, semitones, targetKeyIndex) : '';
        const value = newRoot + (token.suffix || '') + newBass;
        const start = text.length;
        text += value;
        tokens.push({ value, start, end: text.length });
        lastIndex = token.end;
    }
    text += line.text.slice(lastIndex);
    return { kind: 'chord', text, tokens };
}

// v2 units already carry chord/text as separate fields (no shared padded
// string to splice into), so transposing is a plain per-unit map.
function transposeV2Section(section, semitones, targetKeyIndex) {
    return {
        name: section.name,
        groups: section.groups.map(group => {
            if (group.type === 'lyric') {
                return {
                    type: 'lyric',
                    notes: group.notes,
                    lines: group.lines.map(line => ({
                        lang: line.lang,
                        pinyin: line.pinyin, // never transposed — chords, not readings
                        units: line.units.map(u => ({
                            chords: u.chords.map(c => transposeChordString(c, semitones, targetKeyIndex)),
                            text: u.text
                        }))
                    }))
                };
            }
            if (group.type === 'chordline') {
                return {
                    type: 'chordline',
                    tokens: group.tokens.map(t => t.type === 'chord'
                        ? { type: 'chord', value: transposeChordString(t.value, semitones, targetKeyIndex) }
                        : t)
                };
            }
            return group; // note groups are never transposed (BILINGUAL-SPEC.md §5.4)
        })
    };
}

export function transposeChart(chart, semitones = 0) {
    const targetKeyIndex = ((chart.meta.keyIndex + semitones) % 12 + 12) % 12;
    const meta = { ...chart.meta, key: KEY_DISPLAY[targetKeyIndex], keyIndex: targetKeyIndex };

    const sections = chart.meta.format === 'v1'
        ? chart.sections.map(s => ({
            name: s.name,
            groups: s.groups.map(g => ({
                type: g.type,
                lines: g.lines.map(l => transposeV1Line(l, semitones, targetKeyIndex))
            }))
        }))
        : chart.sections.map(s => transposeV2Section(s, semitones, targetKeyIndex));

    return { meta, sections };
}

// Text form of an (already-transposed) chart's key — "D", or "D → E" if the
// chart contains a {modulate: n} marker (BILINGUAL-SPEC.md §5.4). Only the
// first modulation in the chart is shown; n itself is a relative interval
// so it's read straight off the parsed chart, untouched by whatever
// semitones transposeChart() above was called with — the arrow's two ends
// move together under transposition, which is what keeps the interval
// intact instead of needing separate handling here.
export function keyDisplay(chart) {
    if (!chart.meta.key) return chart.meta.key;
    const modulations = findModulations(chart);
    if (modulations.length === 0) return chart.meta.key;

    const semitones = modulations[0].semitones;
    const targetKeyIndex = ((chart.meta.keyIndex + semitones) % 12 + 12) % 12;
    const secondKey = transposeNote(chart.meta.key, semitones, targetKeyIndex);
    return `${chart.meta.key} → ${secondKey}`;
}

// ── v1 render (chart is already transposed — see renderChart below) ──
//
// Splices <span class="chord"> in at each token's offset, leaving
// everything else in the line untouched, then a single global header-regex
// pass over the rejoined text — the same two-pass order the original
// inline version used, which is what keeps this byte-identical to v1's
// pre-refactor output.

function spliceChordSpans(line) {
    let result = '';
    let lastIndex = 0;
    for (const token of line.tokens) {
        result += line.text.slice(lastIndex, token.start);
        result += `<span class="chord" data-chord="${token.value}">${token.value}</span>`;
        lastIndex = token.end;
    }
    result += line.text.slice(lastIndex);
    return result;
}

// Per-line (not a global regex over the joined text, per chart-constants.js's
// matchSectionHeader — it needs the bracket's full trimmed content, not an
// arbitrary substring) so a recognized header renders in its canonical form
// ("[high-praise]" → "[High Praise]") even though the parser (which decides
// section.name) and this renderer (which decides what's on screen) are two
// separate passes over the same source line.
function renderV1(chart) {
    const allLines = chart.sections.flatMap(s => s.groups.flatMap(g => g.lines));
    const joined = allLines
        .map(line => {
            if (line.kind === 'chord') return spliceChordSpans(line);
            const trimmed = line.text.trim();
            const bracket = trimmed.match(/^\[(.+)\]$/);
            const canon = bracket ? matchSectionHeader(bracket[1]) : null;
            return canon !== null
                ? line.text.replace(trimmed, `<span class="section-header">[${canon}]</span>`)
                : line.text;
        })
        .join('\n');

    return `<pre>${joined}</pre>`;
}

// ── v2 render (chart is already transposed) ──

const MODE_LANGS = {
    en: ['en'],
    zh: ['zh'],
    'en-zh': ['en', 'zh'],
    'zh-en': ['zh', 'en']
};

// This module stays DOM-independent on purpose (see file header) — it's
// reused from Node (generateDoc()'s docx export, via transposeChart, and
// this file's own test harnesses) as well as the browser. Ruby-support
// *detection* needs `document`, so it can't live here; app.js does that
// detection and passes the result in as `pinyin`: 'off' (default) | 'ruby'
// | 'stacked' (plain pinyin line above the zh line, no <ruby> — both the
// deliberate no-ruby-support fallback and what a mismatched pinyin/text
// character count degrades to internally, see buildRubyReadings below).

const HAN_RE = /[㐀-鿿豈-﫿]/;

// Zips a lyric line's flattened text against its .pinyin syllable string,
// one token per character — including punctuation, which is what lets this
// be a plain positional zip rather than a "skip non-Han" walk. That
// property comes from how build-index.mjs generates .pinyin (pinyin-pro
// emits exactly one space-separated token per input character, punctuation
// included, not just per Han character — verified before relying on it).
// Returns null if the counts don't match, so callers can fall back to the
// plain stacked line instead of rendering misaligned readings.
function buildRubyReadings(text, pinyinStr) {
    const chars = [...text];
    const tokens = pinyinStr.trim().split(/\s+/);
    if (chars.length !== tokens.length) return null;
    return chars.map((ch, i) => ({ ch, reading: tokens[i], isHan: HAN_RE.test(ch) }));
}

// Each chord keeps its own .chord/data-chord element — that convention
// matches v1 exactly, so the existing chord-hover tooltip subsystem in
// app.js (keyed on .chord + data-chord) works on every individual chord in
// a cluster unmodified, with no separate class or JS path needed for the
// melisma case. .chord-cluster is only the layout wrapper: a lone chord is
// a one-item cluster (BILINGUAL-SPEC.md §5.2/§6.1), and multiple adjacent
// .chord children lay out horizontally inside it via CSS flex — see
// .chord-cluster in style.css — rather than each becoming its own .unit.
function renderChordCluster(chords) {
    if (chords.length === 0) {
        return `<span class="chord-cluster"><span class="chord" aria-hidden="true"></span></span>`;
    }
    const spans = chords
        .map(c => `<span class="chord" data-chord="${escapeHtml(c)}">${escapeHtml(c)}</span>`)
        .join('');
    return `<span class="chord-cluster">${spans}</span>`;
}

function renderUnitPlain(unit) {
    return `<span class="unit">${renderChordCluster(unit.chords)}<span class="syl">${escapeHtml(unit.text)}</span></span>`;
}

// Same .unit/.chord-cluster shell as renderUnitPlain, but .syl becomes a run
// of <ruby> elements — one per Han character `readings` covers. `cursor` is
// a shared { i } across a whole lyric line's units (not reset per unit),
// since characters flow continuously across unit/chord boundaries.
function renderUnitRuby(unit, readings, cursor) {
    const chars = [...unit.text];
    const html = chars.map((ch, i) => {
        const r = readings[cursor.i + i];
        return (r && r.isHan)
            ? `<ruby>${escapeHtml(ch)}<rt>${escapeHtml(r.reading)}</rt></ruby>`
            : escapeHtml(ch);
    }).join('');
    cursor.i += chars.length;
    return `<span class="unit">${renderChordCluster(unit.chords)}<span class="syl">${html}</span></span>`;
}

// A rendered .lyric-line carries the chart's full BCP47 tag (e.g. "zh-Hans"),
// not the short "zh" prefix used in the source body — BILINGUAL-SPEC.md §6.1
// needs the full tag on [lang^="zh"] so the browser picks correct glyphs.
function resolveLangAttr(chart, shortLang) {
    const full = chart.meta.langs.find(l => l.toLowerCase().startsWith(shortLang.toLowerCase()));
    return full || shortLang;
}

function renderLyricLine(line, chart, pinyinMode) {
    const langAttr = resolveLangAttr(chart, line.lang);
    const isZh = line.lang.toLowerCase().startsWith('zh');
    const hasPinyin = pinyinMode !== 'off' && isZh && !!line.pinyin;

    if (hasPinyin && pinyinMode === 'ruby') {
        const readings = buildRubyReadings(line.units.map(u => u.text).join(''), line.pinyin);
        if (readings) {
            const cursor = { i: 0 };
            const units = line.units.map(u => renderUnitRuby(u, readings, cursor)).join('');
            return `<div class="lyric-line" lang="${escapeHtml(langAttr)}">${units}</div>`;
        }
        // pinyin/text character count mismatch — fall through to the plain
        // stacked line below rather than render misaligned <ruby> pairs.
    }

    const units = line.units.map(renderUnitPlain).join('');
    const mainLine = `<div class="lyric-line" lang="${escapeHtml(langAttr)}">${units}</div>`;

    if (hasPinyin) {
        return `<div class="lyric-line lyric-line-pinyin">${escapeHtml(line.pinyin)}</div>${mainLine}`;
    }
    return mainLine;
}

function renderLineGroup(group, chart, mode, pinyinMode) {
    if (group.type === 'note') {
        // {chords: <section>} (BILINGUAL-SPEC.md §5.4) is data-only — the
        // marker still parses (rule 9 still validates it) but it prints
        // nowhere, in either the on-screen chart or the docx chart body
        // (app.js's buildSectionParagraphs() explicitly skips this kind too).
        // Its one surfaced form is the "*<section>" suffix buildSongOrderTable()
        // adds to this section's Song Order row, right next to the section it
        // applies to — printing it again as its own bare line here would just
        // read as a stray duplicate. A chordless verse repeating the previous
        // section's progression is the same convention v1 charts always used
        // with no on-screen note at all, and this team was never confused by
        // it there. Every other kind (note/repeat/goto/segue/modulate) still
        // shows group.text as-is.
        if (group.kind === 'chords') return '';
        return `<p class="chart-note">${escapeHtml(group.text)}</p>`;
    }

    if (group.type === 'chordline') {
        const html = group.tokens.map(token =>
            token.type === 'chord'
                ? `<span class="chord" data-chord="${escapeHtml(token.value)}">${escapeHtml(token.value)}</span>`
                : escapeHtml(token.value)
        ).join(' ');
        return `<div class="chord-line">${html}</div>`;
    }

    // group.type === 'lyric'
    const wanted = MODE_LANGS[mode] || MODE_LANGS.en;
    const linesToRender = wanted
        .map(shortLang => group.lines.find(l => l.lang.toLowerCase().startsWith(shortLang)))
        .filter(Boolean);

    if (linesToRender.length === 0) return '';
    const rendered = linesToRender.map(l => renderLyricLine(l, chart, pinyinMode)).join('');
    return `<div class="line-group">${rendered}</div>`;
}

function renderSectionHeader(section) {
    return section.name ? `<div class="section-header">[${escapeHtml(section.name)}]</div>` : '';
}

function renderSectionBody(section, chart, mode, pinyinMode) {
    return section.groups.map(group => renderLineGroup(group, chart, mode, pinyinMode)).join('');
}

// Every section renders exactly once, in the chart's own document order, in
// the one global `mode` — no per-section override, no repeated showing.
// Within a line group, `mode` itself is what produces line-by-line pairing
// ('en-zh'/'zh-en' render both languages, one line immediately after the
// other; 'en'/'zh' render one) — see renderLineGroup/MODE_LANGS above.
function renderSection(section, chart, mode, pinyinMode) {
    return `<div class="chart-section">${renderSectionHeader(section)}${renderSectionBody(section, chart, mode, pinyinMode)}</div>`;
}

function renderV2(chart, mode, pinyinMode) {
    const body = chart.sections.map(section => renderSection(section, chart, mode, pinyinMode)).join('');
    return `<div class="chart-v2">${body}</div>`;
}

// ── entry point ──

export function renderChart(chart, { mode = 'en-zh', semitones = 0, pinyin = 'off' } = {}) {
    const transposed = transposeChart(chart, semitones);

    return transposed.meta.format === 'v1'
        ? renderV1(transposed)
        : renderV2(transposed, mode, pinyin);
}
