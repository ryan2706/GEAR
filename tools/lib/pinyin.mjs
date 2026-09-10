// tools/lib/pinyin.mjs
//
// The one place that decides "what should a py: line say" (BILINGUAL-SPEC.md
// §5.6) — shared by tools/build-index.mjs (which writes py: lines) and
// tools/validate-charts.mjs (which warns when a chart's py: lines don't
// match what this would generate), so the two can never quietly drift into
// disagreeing with each other about a reading.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin, customPinyin } from 'pinyin-pro';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_PATH = path.join(__dirname, '..', 'pinyin-exceptions.json');

// customPinyin() is global, process-wide state in pinyin-pro — loading twice
// would just redundantly re-apply the same map, but callers (build-index.mjs
// and validate-charts.mjs) each only need to do it once at startup.
let exceptionsLoaded = null;
export async function loadPinyinExceptions() {
    if (!exceptionsLoaded) {
        exceptionsLoaded = JSON.parse(await readFile(EXCEPTIONS_PATH, 'utf8'));
        customPinyin(exceptionsLoaded);
    }
    return exceptionsLoaded;
}

export const ZH_LINE_RE = /^(zh(?:-[A-Za-z]+)?):\s*(.*)$/i;
export const PY_LINE_RE = /^py:\s*(.*)$/i;

// `py!:` (BILINGUAL-SPEC.md §5.6) opts a single line out of generation
// entirely — for the rare reading a human writes better than pinyin-pro
// (its comma spacing among them), and for the zh-* lines this corpus's
// source docs pad with literal alignment spaces (see generateLinePinyin's
// comment below): a hand-typed py!: line sidesteps the mismatch instead of
// fighting pinyin-pro's tokenization of it.
export const PY_MANUAL_LINE_RE = /^py!:\s*(.*)$/i;

function stripChordBrackets(text) {
    return text.replace(/\[[^\]]*\]/g, '');
}

// One toned syllable per input character, punctuation included as its own
// pass-through token — that's what lets the renderer zip pinyin against Han
// characters 1:1 for <ruby> annotation (js/chart-render.js's
// buildRubyReadings). Assumes the zh-* line's text, after stripping [chord]
// brackets, has no literal whitespace of its own — true of most charts in
// this corpus (Chinese lyric text doesn't use inter-word spacing), but not
// all: a source doc's cosmetic alignment padding does show up verbatim in a
// zh-* line sometimes. That's not fixable here — pinyin-pro's own token
// separator *is* a space, so a literal space in the input becomes a token
// indistinguishable, once joined into this function's single-line string
// output, from the whitespace `diffPinyinLines`/the renderer split on to
// find token boundaries in the first place. Whitespace can't be both the
// delimiter and a delimited value in the same encoding — a chart with this
// padding needs a hand-authored `py!:` line (see PY_MANUAL_LINE_RE) instead
// of a generated one.
export function generateLinePinyin(zhLyricText) {
    return pinyin(stripChordBrackets(zhLyricText), { toneType: 'symbol' });
}

// Walks a chart body's raw text (pre.body — before parseChartBody, so line
// numbers here are relative to the body's own first line, i.e. 0-based
// against a split('\n')) and returns one entry per zh-* line found:
//   { zhLineIndex, pyLineIndex, expected, actual }
// pyLineIndex is null when no py: line follows the zh: line at all (nothing
// to overwrite, only to insert); actual is null in that same case. A caller
// compares expected !== actual to find what's missing or stale. A zh-* line
// followed by a `py!:` line is skipped entirely — not diffed, not written,
// not warned about (BILINGUAL-SPEC.md §5.6) — since its whole point is that
// nothing here should touch it.
export function diffPinyinLines(bodyText) {
    const lines = bodyText.split('\n');
    const diffs = [];
    for (let i = 0; i < lines.length; i++) {
        const zhMatch = lines[i].trim().match(ZH_LINE_RE);
        if (!zhMatch) continue;

        const next = i + 1 < lines.length ? lines[i + 1].trim() : null;
        if (next !== null && PY_MANUAL_LINE_RE.test(next)) continue;

        const expected = generateLinePinyin(zhMatch[2]);
        const pyMatch = next !== null ? next.match(PY_LINE_RE) : null;

        diffs.push({
            zhLineIndex: i,
            pyLineIndex: pyMatch ? i + 1 : null,
            expected,
            actual: pyMatch ? pyMatch[1].trim() : null
        });
    }
    return diffs;
}

// Applies a diffPinyinLines() result to bodyText, writing/replacing only
// the entries where actual !== expected. Walks in reverse zhLineIndex order
// so inserting a new line for one diff never shifts the target index of an
// earlier one still to be applied.
export function applyPinyinDiffs(bodyText, diffs) {
    const lines = bodyText.split('\n');
    let changedCount = 0;
    for (const d of [...diffs].reverse()) {
        if (d.actual === d.expected) continue;
        const pyLine = `py: ${d.expected}`;
        if (d.pyLineIndex !== null) {
            lines[d.pyLineIndex] = pyLine;
        } else {
            lines.splice(d.zhLineIndex + 1, 0, pyLine);
        }
        changedCount++;
    }
    return { text: lines.join('\n'), changedCount };
}

// The "generated, don't hand-edit" marker build-index.mjs prepends to a v2
// chart file the first time it writes py: lines into it — outside the
// <pre> (an HTML comment inside chart-parser.js's grammar would render as
// literal text), so it's the first thing visible on the file itself, not
// only in BILINGUAL-SPEC.md §5.6.
export const PINYIN_GENERATED_COMMENT =
    '<!-- py: lines below are generated by tools/build-index.mjs from pinyin-pro — do not hand-edit; fix tools/pinyin-exceptions.json instead, or use a py!: line for a deliberate exception. See BILINGUAL-SPEC.md §5.6. -->';
