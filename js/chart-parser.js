// Unified chart parser. parseChartBody() is the DOM-independent core: give
// it a chart's already-extracted text and data-* attributes and it returns
// one Chart shape for both v1 and v2, branching on data-format. Callers own
// the DOM step themselves — app.js's fetchSongContent() uses DOMParser on
// the fetched fragment, tools/validate-charts.mjs (Node, no DOM) uses
// regex — so the v1/v2 grammar itself lives in exactly one place instead of
// drifting across a browser copy and a Node copy:
//
//   Chart = {
//     meta: { format: 'v1'|'v2', key, keyIndex, langs, primary },
//     sections: [{ name, groups: [...] }]
//   }
//
// v1 groups are { type: 'v1block', lines }, where each line is either
// { kind: 'chord', text, tokens, line } or { kind: 'other', text, line }
// (`line` is the 1-based line number in the *original file*, not just the
// chart body — used for validator diagnostics; chart-render.js never reads
// it) — including section-header lines themselves, which are NOT stripped
// out (section.name is metadata only). Recording chord tokens
// (root/suffix/bass + string offset) here and splicing transposed spans
// back into the *original* line at render time is what keeps v1 output
// byte-identical to today: it's the same substitution transposeText()'s
// regex .replace() did, just replayed from pre-parsed tokens instead of
// re-scanning on every render.
//
// v2 groups carry the shape from the original bilingual-only parser, each
// also carrying `line`: { type: 'lyric', lines: [{lang, units, line,
// pinyin?}], notes }, { type: 'chordline', tokens, line }, { type: 'note',
// kind, text, line }. `pinyin` (§5.6) is only ever present on a zh-* line,
// carried over from a `py:` line immediately beneath it in the source — a
// space-joined toned-syllable string covering that line's Han characters in
// order, not its own inline-bracket-parsed unit list like en:/zh: lines.

import { NOTES, NOTES_FLAT } from './chord-theory.js';
import { matchSectionHeader } from './chart-constants.js';

const BARE_BRACKET_LINE = /^\[(.+)\]$/;

// Returns the canonical display form ("Pre-Chorus", "Verse 1", "High
// Praise") if `line` is a recognized section header, null otherwise —
// case- and separator-insensitively (chart-constants.js §5.1).
function parseSectionHeader(line) {
    const m = line.match(BARE_BRACKET_LINE);
    return m ? matchSectionHeader(m[1]) : null;
}

// Same chord grammar as today's app.js — reused for classifying whole lines
// (v1) and for chord-only-line tokens / inline [chord] units (v2).
const STRICT_CHORD = /^([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?$/;
const CHORD_TOKEN_SCAN = /\b([A-G](?:#|b)?)((?:m|maj|min|dim|aug|sus|add|M|2|4|5|6|7|9|11|13)*)(\/[A-G](?:#|b)?)?(?=\s|$)/g;

function detectKeyIndexFromText(text) {
    const chordRegex = /\b([A-G](?:#|b)?)(m|maj|min|dim|aug|sus|add|7|9|11|13)*(\/[A-G](?:#|b)?)?\b/;
    const match = text.match(chordRegex);
    if (match) {
        let root = match[1];
        let index = NOTES.indexOf(root);
        if (index === -1) index = NOTES_FLAT.indexOf(root);
        if (index !== -1) return index;
    }
    return 0;
}

// ── v1 ──

function classifyV1Line(rawLine, lineNumber) {
    const trimmed = rawLine.trim();
    if (!trimmed) return { kind: 'other', text: rawLine, line: lineNumber };

    const tokens = trimmed.split(/\s+/);
    const isChordLine = tokens.every(t => STRICT_CHORD.test(t));
    if (!isChordLine) return { kind: 'other', text: rawLine, line: lineNumber };

    const chordTokens = [];
    CHORD_TOKEN_SCAN.lastIndex = 0;
    let m;
    while ((m = CHORD_TOKEN_SCAN.exec(rawLine)) !== null) {
        chordTokens.push({
            root: m[1],
            suffix: m[2] || '',
            bass: m[3] ? m[3].slice(1) : null,
            start: m.index,
            end: m.index + m[0].length
        });
    }
    return { kind: 'chord', text: rawLine, tokens: chordTokens, line: lineNumber };
}

function parseV1Body(text, meta, startLine = 1) {
    const rawLines = text.split('\n');
    const sections = [];
    let current = { name: null, groups: [{ type: 'v1block', lines: [] }] };

    rawLines.forEach((rawLine, i) => {
        const lineNumber = startLine + i;
        const trimmed = rawLine.trim();
        const headerName = parseSectionHeader(trimmed);
        if (headerName !== null) {
            if (current.groups[0].lines.length > 0 || current.name !== null) {
                sections.push(current);
            }
            current = { name: headerName, groups: [{ type: 'v1block', lines: [] }] };
        }
        // Pushed unconditionally, including header lines themselves, into
        // whichever section is current at this point in the loop — this is
        // what lets render replay every original line verbatim.
        current.groups[0].lines.push(classifyV1Line(rawLine, lineNumber));
    });
    sections.push(current);

    return { meta: { ...meta, format: 'v1' }, sections };
}

// ── v2 ──

// Exported so tools/validate-charts.mjs can check for this syntax
// appearing in a v1 chart (where it's never recognized — v1 has no
// structured curly-brace parsing at all) without maintaining a second,
// driftable copy of the keyword list.
export const NOTE_LINE = /^\{(note|repeat|goto|segue|modulate|chords):\s*(.*)\}$/i;
// py!: (BILINGUAL-SPEC.md §5.6) is a hand-authored reading — rendering
// treats it exactly like a generated py: line; only tools/lib/pinyin.mjs
// (build-index.mjs / validate-charts.mjs) cares about the "!" as a signal
// to leave the line alone.
const PINYIN_LINE = /^py!?:\s*(.*)$/i;
const LANG_LINE = /^([a-zA-Z]{2,3}(?:-[A-Za-z]+)?):\s*(.*)$/;
const INLINE_CHORD = /\[([^\]]+)\]/g;

// A unit's `chords` is an array (possibly empty), not a single nullable
// chord — BILINGUAL-SPEC.md §5.2's "adjacent chord clusters" ([F][Gm][F]Glo)
// are a melisma: several chords bound to one syllable, not several
// syllable-less units in a row. Two or more bracket matches with nothing
// between them (no text separating them) accumulate into one unit instead
// of each becoming its own empty-text unit; the cluster attaches to
// whatever text follows the last bracket in the run. A lone bracket is just
// a one-item cluster, so callers don't need a separate single-chord case.
function tokenizeInlineChordUnits(text) {
    const matches = [...text.matchAll(INLINE_CHORD)];
    if (matches.length === 0) {
        return text === '' ? [] : [{ chords: [], text }];
    }

    const units = [];
    if (matches[0].index > 0) {
        units.push({ chords: [], text: text.slice(0, matches[0].index) });
    }

    let pendingChords = [];
    for (let i = 0; i < matches.length; i++) {
        pendingChords.push(matches[i][1]);
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const segment = text.slice(start, end);
        // Nothing between this bracket and the next one — keep accumulating
        // into the same cluster rather than flushing an empty-text unit.
        if (segment === '' && i + 1 < matches.length) continue;
        units.push({ chords: pendingChords, text: segment });
        pendingChords = [];
    }
    return units;
}

function parseLyricLine(line, lineNumber) {
    const match = line.match(LANG_LINE);
    return { lang: match[1], units: tokenizeInlineChordUnits(match[2]), line: lineNumber };
}

function parseChordOnlyLine(line, lineNumber) {
    const tokens = line.trim().split(/\s+/).map(token => {
        return STRICT_CHORD.test(token)
            ? { type: 'chord', value: token }
            : { type: 'text', value: token };
    });
    return { type: 'chordline', tokens, line: lineNumber };
}

function parseNoteLine(line, lineNumber) {
    const match = line.match(NOTE_LINE);
    return { type: 'note', kind: match[1].toLowerCase(), text: match[2].trim(), line: lineNumber };
}

// Keeps line numbers aligned with the original file: filters out comment
// lines while carrying each survivor's original (1-based, file-relative)
// line number alongside it, rather than just returning stripped text.
function stripComments(rawLines, startLine) {
    return rawLines
        .map((line, i) => ({ line, lineNumber: startLine + i }))
        .filter(({ line }) => !line.trim().startsWith('#'));
}

function newSection(name) {
    return { name, groups: [] };
}

function flushLyricGroup(section, pendingLines) {
    if (pendingLines.length > 0) {
        section.groups.push({ type: 'lyric', lines: pendingLines, notes: [] });
    }
}

function parseV2Body(rawBody, meta, startLine = 1) {
    const lines = stripComments(rawBody.split('\n'), startLine);

    let currentSection = newSection(null);
    let pendingLines = [];
    const sections = [];

    for (const { line: rawLine, lineNumber } of lines) {
        const line = rawLine.trim();

        if (line === '') {
            flushLyricGroup(currentSection, pendingLines);
            pendingLines = [];
            continue;
        }

        const headerName = parseSectionHeader(line);
        if (headerName !== null) {
            flushLyricGroup(currentSection, pendingLines);
            pendingLines = [];
            if (currentSection.name !== null || currentSection.groups.length > 0) {
                sections.push(currentSection);
            }
            currentSection = newSection(headerName);
            continue;
        }

        if (PINYIN_LINE.test(line)) {
            // Generated-at-build-time layer, or a hand-authored py!:
            // exception to it (§5.6): written beneath the zh-* line it
            // annotates, so it attaches to whichever lyric line was most
            // recently pushed rather than becoming a "language" of its own
            // — .pinyin is reading-aid metadata on that line, not a fourth
            // displayable language alongside en/zh in the §6.2 mode sense.
            const match = line.match(PINYIN_LINE);
            const lastLine = pendingLines[pendingLines.length - 1];
            if (lastLine) lastLine.pinyin = match[1].trim();
            continue;
        }

        if (NOTE_LINE.test(line)) {
            flushLyricGroup(currentSection, pendingLines);
            pendingLines = [];
            currentSection.groups.push(parseNoteLine(line, lineNumber));
            continue;
        }

        if (LANG_LINE.test(line)) {
            const parsed = parseLyricLine(line, lineNumber);
            // A group is "two renditions of the same musical phrase" (§5.2),
            // but the literal closing rule (blank line/header only) would
            // lump multiple back-to-back phrase-pairs into one group when an
            // author doesn't blank-line-separate every couplet — as in the
            // spec's own worked example. Closing early when a language is
            // about to repeat within the pending group keeps phrase-pairs
            // intact without requiring that blank line.
            if (pendingLines.some(l => l.lang === parsed.lang)) {
                flushLyricGroup(currentSection, pendingLines);
                pendingLines = [];
            }
            pendingLines.push(parsed);
            continue;
        }

        // No recognized prefix: a chord-only line (§5.3).
        flushLyricGroup(currentSection, pendingLines);
        pendingLines = [];
        currentSection.groups.push(parseChordOnlyLine(line, lineNumber));
    }

    flushLyricGroup(currentSection, pendingLines);
    if (currentSection.name !== null || currentSection.groups.length > 0) {
        sections.push(currentSection);
    }

    return { meta: { ...meta, format: 'v2' }, sections };
}

// ── entry point ──

// Everything after "I already have the <pre> tag's text and attributes."
// app.js's fetchSongContent() calls this with a DOMParser-extracted `meta`
// spread across the named params below (unknown ones are simply ignored);
// tools/validate-charts.mjs calls it with its own regex-extracted
// attributes. Either way the *real* v1/v2 grammar lives here once, instead
// of drifting across a browser copy and a Node copy. `startLine` is the
// 1-based line number of the body's first line *within the original file*
// (not just the body) — the validator's diagnostics are file-relative;
// chart-render.js never reads the `line` fields this produces, so the
// browser path doesn't need to pass anything but the default.
export function parseChartBody({ text, format, key, langs, primary, startLine = 1 }) {
    let keyIndex;
    if (key) {
        keyIndex = NOTES.indexOf(key);
        if (keyIndex === -1) keyIndex = NOTES_FLAT.indexOf(key);
        if (keyIndex === -1) keyIndex = detectKeyIndexFromText(text);
    } else {
        keyIndex = detectKeyIndexFromText(text);
    }

    const langsArr = (langs || '').split(',').map(s => s.trim()).filter(Boolean);
    const meta = { key, keyIndex, langs: langsArr, primary: primary || langsArr[0] };

    return format === 'bilingual'
        ? parseV2Body(text, meta, startLine)
        : parseV1Body(text, meta, startLine);
}

// ── modulation markers (BILINGUAL-SPEC.md §5.4) ──

const MODULATE_LINE = /^\{modulate:\s*([+-]?\d+)\}$/i;

// Scans a parsed Chart for {modulate: <semitones>} markers, in file order.
// v1 has no structured curly-brace parsing (a modulate line there is just
// an 'other'-kind text line, same as {goto:}/{segue:}/{note:} in v1
// charts), so this pattern-matches its raw text directly; v2 already
// produces a { type: 'note', kind: 'modulate' } group via NOTE_LINE, so
// this reads that structurally instead of re-parsing text. Shared by
// chart-render.js (key display) and tools/validate-charts.mjs (rule 8) so
// "does this chart modulate, and by how much" has one answer.
export function findModulations(chart) {
    const found = [];
    for (const section of chart.sections) {
        for (const group of section.groups) {
            if (group.type === 'v1block') {
                for (const line of group.lines) {
                    if (line.kind === 'chord') continue;
                    const m = line.text.trim().match(MODULATE_LINE);
                    if (m) found.push({ semitones: parseInt(m[1], 10), line: line.line });
                }
            } else if (group.type === 'note' && group.kind === 'modulate') {
                found.push({ semitones: parseInt(group.text, 10), line: group.line });
            }
        }
    }
    found.sort((a, b) => a.line - b.line);
    return found;
}

