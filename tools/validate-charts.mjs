#!/usr/bin/env node
// tools/validate-charts.mjs
//
// Implements BILINGUAL-SPEC.md §8's twelve validator rules. Node stdlib
// only for the parsing/checking itself — no npm dependencies — except rule
// 12, which needs pinyin-pro (already a devDependency for
// tools/build-index.mjs) to know what a py: line *should* say. Reuses the
// site's own chart-parser.js (via its DOM-independent parseChartBody()
// export) rather than reimplementing the v1/v2 grammar a second time, so
// "does this chart parse" means exactly what it means to the live site, not
// a second opinion that could drift from it.
//
// ── How to run ──
//
//   node tools/validate-charts.mjs
//
// No flags, no config. Exits 1 if any rule 1-4, 7, 9, or 10 violation is
// found (these fail CI), exits 0 otherwise — rules 5-6, 8, 11, and 12 are
// warnings and never affect the exit code, per the brief ("fail on 1-4 and
// 7, warn on 5-6", extended to warn on 8, fail on 9, fail on 10, warn on 11,
// and warn on 12 too — see the notes below). Every violation line names the
// file and line number.
//
// ── The twelve rules ──
//   1. Every chart parses.
//   2. Every inline [chord] token matches the chord grammar.
//   3. Every bare-bracket line is a recognized section name.
//   4. Within a line group, every language line has the same chord sequence.
//   5. (warn) data-key is a real key, and the chart's first chord is diatonic
//      to it or a common borrowed chord (bVI, bVII).
//   6. (warn) songs.json <-> charts/ are mutually consistent.
//   7. No non-ASCII bytes in any path under charts/.
//   8. (warn) every chord in a section following a {modulate: n} marker is
//      diatonic to data-key transposed by n, or a common borrowed chord.
//   9. Every {chords: <section>} reference resolves to a real section in the
//      same chart, isn't a self-reference, and doesn't chain into a cycle.
//      Fails rather than warns: a dangling or cyclic reference means that
//      section renders with no chords at all, strictly worse than rule 5/8's
//      wrong-chord heuristic misfiring.
//   10. No v2 marker syntax ({note:}/{repeat:}/{goto:}/{segue:}/{modulate:}/
//      {chords:}) inside a v1-format chart. v1 has no curly-brace parsing at
//      all, so the marker doesn't fail to parse — it silently renders as
//      literal text, exactly the live-rendering bug {chords:} itself just
//      had before js/chart-parser.js recognized it. Fails, not warns: same
//      reasoning as rule 9 — a chart shipping this is guaranteed-wrong
//      output, not a heuristic maybe-wrong one.
//   11. (warn) every data/setlists/<slug>.json sidecar's sectionOverrides key,
//      and every repeats[].section, matches a real section in the chart it's
//      for (matched back to a chart via slugify(title), the same lookup the
//      browser does at runtime). Either kind of mismatch is inert forever,
//      unnoticed — the same class of silent mismatch as rule 9's dangling
//      {chords: ...} — warn instead of fail since a wrong sidecar entry
//      degrades to "shows the default", not "renders broken." A repeats[]
//      entry's `after` is exempt: BILINGUAL-SPEC.md §6.3 defines a missing
//      or unmatched `after` as intentional (render at the end), not a
//      mismatch.
//   12. (warn) every zh-* line's py: line matches what tools/build-index.mjs
//      (via tools/lib/pinyin.mjs, the shared source of truth) would
//      generate for it — including a zh-* line with no py: line at all.
//      Warn, not fail: a missing/stale py: line degrades the pinyin toggle
//      to "shows an outdated or absent reading", never breaks parsing or
//      rendering of anything else on the page.
//
// ── Notes on interpretation ──
// Rule 1: chart-parser.js's v1/v2 body-parsers are deliberately lenient
// line-classifiers that (by design) almost never throw — a syntax-error
// model doesn't fit this grammar. "Doesn't parse" is instead: no
// well-formed <pre class="chord-chart">...</pre> wrapper is found, the
// body is empty, or parsing produced no content at all.
// Rule 5: BILINGUAL-SPEC.md's "or is reachable from it" is genuinely
// underspecified — read literally ("some transposition connects any two
// notes"), it's vacuously true of every chart and not a check at all.
// Requiring an exact match against the *first* chord was tried and
// rejected: worship charts routinely open on an intro/pickup chord built on
// IV, V, or vi rather than the tonic, so that reading produced a warning on
// ~23% of the corpus — noise, not signal. This implements the more useful
// reading instead: the first chord's root must be diatonic to the declared
// key, or one of the two borrowed chords (bVI, bVII) that show up
// constantly in this genre. Secondary dominants (V/ii, V/iii, V/IV, V/V,
// V/vi) don't need their own case — a dominant's root sits a fifth above
// its target, and a fifth above any diatonic scale degree lands back on a
// diatonic degree for every target except vii° (V/vii, the tritone degree,
// stays flagged — rare enough in practice that it's still worth a look).
// Rule 8: same diatonic-or-borrowed check as rule 5, applied to every chord
// in a section rather than just the chart's first one — reusing rule 5's
// leniency here would defeat the point, since the whole reason to check a
// modulated section is to catch a chord that's still in the *old* key. It
// warns rather than fails because, like rule 5, it's a heuristic (roots
// only, no quality) that a legitimately chromatic passage could still trip.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChartBody, findModulations, NOTE_LINE } from '../js/chart-parser.js';
import { matchSectionHeader, slugify } from '../js/chart-constants.js';
import { NOTES, NOTES_FLAT } from '../js/chord-theory.js';
import { extractPre } from './lib/chart-file.mjs';
import { loadPinyinExceptions, diffPinyinLines } from './lib/pinyin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CHARTS_DIR = path.join(REPO_ROOT, 'charts');
const SONGS_JSON_PATH = path.join(REPO_ROOT, 'data', 'songs.json');
const SETLISTS_DIR = path.join(REPO_ROOT, 'data', 'setlists');

// ── violation collection ──

const violations = [];

function report(level, rule, filePath, line, message) {
    violations.push({
        level,
        rule,
        file: path.relative(REPO_ROOT, filePath),
        line,
        message
    });
}

// ── filesystem helpers ──

async function walkFiles(dir) {
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...await walkFiles(full));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

// ── rule 2 & 3 patterns ──

// Verbatim from BILINGUAL-SPEC.md §8 rule 2.
const RULE2_CHORD_RE = /^[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M|[2456791113])*(\/[A-G](#|b)?)?$/;

const BARE_BRACKET_LINE = /^\[(.+)\]$/;

// ── rule 5 helpers ──

// Semitone offsets from the tonic: the seven diatonic major-scale degrees
// (I ii iii IV V vi vii°) plus the two chords worship charts routinely
// borrow from the parallel minor (bVI, bVII — think "Oceans"-style
// bVII-IV-I turnarounds). See the interpretation note above for why
// secondary dominants don't need their own entries here.
const DIATONIC_INTERVALS = new Set([0, 2, 4, 5, 7, 9, 11]);
const BORROWED_INTERVALS = new Set([8, 10]);

function noteIndex(name) {
    if (!name) return -1;
    let i = NOTES.indexOf(name);
    if (i === -1) i = NOTES_FLAT.indexOf(name);
    return i;
}

// Finds the chart's first chord, wherever it appears, plus the line it's on.
function firstChordInChart(chart) {
    for (const section of chart.sections) {
        for (const group of section.groups) {
            if (group.type === 'v1block') {
                for (const line of group.lines) {
                    if (line.kind === 'chord' && line.tokens.length > 0) {
                        return { root: line.tokens[0].root, line: line.line };
                    }
                }
            } else if (group.type === 'chordline') {
                const tok = group.tokens.find(t => t.type === 'chord');
                if (tok) {
                    const root = tok.value.match(/^[A-G](#|b)?/)?.[0];
                    if (root) return { root, line: group.line };
                }
            } else if (group.type === 'lyric') {
                for (const line of group.lines) {
                    const u = line.units.find(u => u.chords.length > 0);
                    if (u) {
                        const root = u.chords[0].match(/^[A-G](#|b)?/)?.[0];
                        if (root) return { root, line: line.line };
                    }
                }
            }
        }
    }
    return null;
}

function validateKey(chart, pre, filePath) {
    const keyIdx = noteIndex(pre.key);
    if (keyIdx === -1) {
        report('WARN', 5, filePath, pre.bodyStartLine, `data-key="${pre.key ?? ''}" is not a recognized key name`);
        return;
    }
    const first = firstChordInChart(chart);
    if (!first) return; // no chords anywhere in the chart — nothing to compare
    const firstIdx = noteIndex(first.root);
    if (firstIdx === -1) return;
    const interval = (firstIdx - keyIdx + 12) % 12;
    if (!DIATONIC_INTERVALS.has(interval) && !BORROWED_INTERVALS.has(interval)) {
        report('WARN', 5, filePath, first.line,
            `data-key="${pre.key}" — first chord root "${first.root}" is neither diatonic to this key nor a common borrowed chord (bVI/bVII)`);
    }
}

// ── rule 8 helpers ──

// A section's first line number, used to decide which {modulate: n} marker
// (if any) was already in effect by the time this section starts — v1
// markers are typically trailing lines of the *previous* section's block
// (BILINGUAL-SPEC.md §5.4 places them immediately before the header they
// apply to), so this compares by absolute file line, not group membership.
function firstLineOfSection(section) {
    for (const group of section.groups) {
        if (group.type === 'v1block') {
            if (group.lines.length > 0) return group.lines[0].line;
        } else if (group.type === 'lyric') {
            if (group.lines.length > 0) return group.lines[0].line;
        } else if (group.line !== undefined) {
            return group.line;
        }
    }
    return null;
}

function chordRootsInSection(section) {
    const roots = [];
    for (const group of section.groups) {
        if (group.type === 'v1block') {
            for (const line of group.lines) {
                if (line.kind !== 'chord') continue;
                for (const t of line.tokens) roots.push({ root: t.root, line: line.line });
            }
        } else if (group.type === 'chordline') {
            for (const t of group.tokens) {
                if (t.type !== 'chord') continue;
                const root = t.value.match(/^[A-G](#|b)?/)?.[0];
                if (root) roots.push({ root, line: group.line });
            }
        } else if (group.type === 'lyric') {
            for (const line of group.lines) {
                for (const u of line.units) {
                    for (const chord of u.chords) {
                        const root = chord.match(/^[A-G](#|b)?/)?.[0];
                        if (root) roots.push({ root, line: line.line });
                    }
                }
            }
        }
    }
    return roots;
}

function validateModulations(chart, pre, filePath) {
    const modulations = findModulations(chart);
    if (modulations.length === 0) return;

    const keyIdx = noteIndex(pre.key);
    if (keyIdx === -1) return; // rule 5 already reports the unrecognized key name

    for (const section of chart.sections) {
        const startLine = firstLineOfSection(section);
        if (startLine === null) continue;

        // The most recent modulation that had already happened by the time
        // this section starts — sections before any {modulate:} are
        // unaffected (find() over the reverse gives the nearest one).
        const active = [...modulations].reverse().find(m => m.line < startLine);
        if (!active) continue;

        const targetKeyIdx = ((keyIdx + active.semitones) % 12 + 12) % 12;
        for (const { root, line } of chordRootsInSection(section)) {
            const rootIdx = noteIndex(root);
            if (rootIdx === -1) continue;
            const interval = (rootIdx - targetKeyIdx + 12) % 12;
            if (!DIATONIC_INTERVALS.has(interval) && !BORROWED_INTERVALS.has(interval)) {
                const sign = active.semitones >= 0 ? '+' : '';
                report('WARN', 8, filePath, line,
                    `chord root "${root}" is neither diatonic to the modulated key (data-key="${pre.key}" ${sign}${active.semitones} semitones) nor a common borrowed chord (bVI/bVII)`);
            }
        }
    }
}

// ── rule 10 helper ──

// v1 has no structured curly-brace parsing at all (chart-parser.js's
// NOTE_LINE only applies inside parseV2Body) — a {note:}/{repeat:}/{goto:}/
// {segue:}/{modulate:}/{chords:} line in a v1 chart doesn't fail to parse,
// it just silently renders as inert literal text, exactly the class of bug
// {chords:} was just fixed for. Failing here closes it permanently: no v1
// chart with this syntax can land without being caught immediately, instead
// of waiting for someone to notice a raw "{goto: Chorus}" on a live chart.
function validateNoV1Markers(chart, filePath) {
    for (const section of chart.sections) {
        for (const group of section.groups) {
            if (group.type !== 'v1block') continue;
            for (const line of group.lines) {
                if (line.kind !== 'other') continue;
                if (NOTE_LINE.test(line.text.trim())) {
                    report('FAIL', 10, filePath, line.line,
                        `"${line.text.trim()}" is v2 marker syntax (BILINGUAL-SPEC.md §5.4) inside a v1 chart — v1 can't render it, it displays as literal text. Migrate the chart to v2 or remove the marker.`);
                }
            }
        }
    }
}

// ── rule 9 helpers ──

const CHORDS_REF_LINE = /^\{chords:\s*(.+)\}$/i;

// Raw-text based, like rule 3, rather than reading it off the parsed Chart:
// chart-parser.js's v2 NOTE_LINE regex only recognizes
// note|repeat|goto|segue|modulate — "chords" isn't one of them, so a
// {chords: ...} line currently falls through parseV2Body() into its
// chord-only-line fallback instead of becoming a `note` group. Scanning raw
// text sidesteps that gap rather than depending on it being fixed first
// (see the accompanying report on why the gap itself still needs fixing).
//
// Tracks which section each reference sits in (the nearest preceding
// recognized header, same attribution the real parser would use) so a
// dangling target, a self-reference, and a longer A -> B -> A chain can all
// be told apart in the message.
function validateChordsReferences(content, filePath) {
    const sectionNames = new Set();
    let currentSection = null;
    const refs = [];

    content.split('\n').forEach((rawLine, i) => {
        const trimmed = rawLine.trim();
        const bracket = trimmed.match(BARE_BRACKET_LINE);
        if (bracket) {
            const canonical = matchSectionHeader(bracket[1]);
            if (canonical !== null) {
                currentSection = canonical;
                sectionNames.add(canonical);
            }
            return;
        }
        const m = trimmed.match(CHORDS_REF_LINE);
        if (m) refs.push({ fromSection: currentSection, targetRaw: m[1].trim(), line: i + 1 });
    });

    const deferMap = new Map(); // section -> { target, line } for edges that passed dangling/self checks
    for (const ref of refs) {
        const target = matchSectionHeader(ref.targetRaw);
        if (target === null || !sectionNames.has(target)) {
            report('FAIL', 9, filePath, ref.line,
                `{chords: ${ref.targetRaw}} does not resolve to any section in this chart`);
            continue;
        }
        if (ref.fromSection !== null && target === ref.fromSection) {
            report('FAIL', 9, filePath, ref.line,
                `{chords: ${ref.targetRaw}} references its own section ("${ref.fromSection}")`);
            continue;
        }
        if (ref.fromSection !== null) deferMap.set(ref.fromSection, { target, line: ref.line });
    }

    // A chain that never reaches a section without its own {chords: ...}
    // reference never resolves to actual chords — whether it cycles back to
    // its own start or into some other loop it merely feeds into.
    for (const [fromSection, { target, line }] of deferMap) {
        const seen = new Set();
        let current = fromSection;
        let cyclic = false;
        while (deferMap.has(current)) {
            if (seen.has(current)) { cyclic = true; break; }
            seen.add(current);
            current = deferMap.get(current).target;
        }
        if (cyclic) {
            report('FAIL', 9, filePath, line,
                `{chords: ${target}} is part of a reference cycle and never resolves to a section with actual chords`);
        }
    }
}

// ── per-chart validation (rules 1-5, 8, 9) ──

async function validateChartFile(filePath) {
    const content = await readFile(filePath, 'utf8');

    const pre = extractPre(content);
    if (!pre) {
        report('FAIL', 1, filePath, 1, 'no well-formed <pre class="chord-chart">...</pre> wrapper found');
        return;
    }
    if (!pre.body.trim()) {
        report('FAIL', 1, filePath, pre.bodyStartLine, 'chart body is empty');
        return;
    }

    let chart;
    try {
        chart = parseChartBody({
            text: pre.body,
            format: pre.format,
            key: pre.key,
            langs: pre.langs,
            primary: pre.primary,
            startLine: pre.bodyStartLine
        });
    } catch (err) {
        report('FAIL', 1, filePath, pre.bodyStartLine, `parse error: ${err.message}`);
        return;
    }

    if (!chart.sections.some(s => s.groups.length > 0)) {
        report('FAIL', 1, filePath, pre.bodyStartLine, 'chart parsed but produced no content');
    }

    // Rule 3 — scan every line in the file (not just the body: a bracket
    // line stray outside <pre> would be just as invalid). Section headers
    // that are actually valid never reach here since matchSectionHeader()
    // recognizes them (case- and separator-insensitively, BILINGUAL-SPEC.md
    // §5.1) — the same function the parser and renderer use, so "valid to
    // the validator" and "valid on the live site" can't drift apart.
    content.split('\n').forEach((rawLine, i) => {
        const trimmed = rawLine.trim();
        const m = trimmed.match(BARE_BRACKET_LINE);
        if (m && matchSectionHeader(m[1]) === null) {
            report('FAIL', 3, filePath, i + 1, `"${trimmed}" is not a recognized section header (BILINGUAL-SPEC.md §5.1)`);
        }
    });

    if (chart.meta.format === 'v2') {
        for (const section of chart.sections) {
            for (const group of section.groups) {
                if (group.type !== 'lyric') continue;

                // Rule 2 — every inline [chord] token is chord-shaped. A
                // unit's chords is an array (BILINGUAL-SPEC.md §5.2 melisma
                // clusters carry more than one) — check every element, not
                // just a first/only one.
                for (const line of group.lines) {
                    for (const unit of line.units) {
                        for (const chord of unit.chords) {
                            if (!RULE2_CHORD_RE.test(chord)) {
                                report('FAIL', 2, filePath, line.line, `"[${chord}]" is not a valid chord token`);
                            }
                        }
                    }
                }

                // Rule 4 — every language line in a group shares one chord
                // sequence (order-sensitive, exact string match — this is
                // meant to catch drift/typos between languages, not to
                // allow enharmonic respelling). flatMap, not filter+map:
                // a melisma unit's cluster must contribute every chord it
                // carries to the sequence, not just collapse to one.
                if (group.lines.length > 1) {
                    const seqOf = l => l.units.flatMap(u => u.chords).join(' ');
                    const reference = seqOf(group.lines[0]);
                    for (const line of group.lines.slice(1)) {
                        const seq = seqOf(line);
                        if (seq !== reference) {
                            report('FAIL', 4, filePath, line.line,
                                `chord sequence "${seq}" (${line.lang}) doesn't match this group's "${reference}" (${group.lines[0].lang})`);
                        }
                    }
                }
            }
        }
    }

    // Rule 5 (warn).
    validateKey(chart, pre, filePath);

    // Rule 8 (warn).
    validateModulations(chart, pre, filePath);

    // Rule 9 (fail) — raw-text based, so checked against the whole file
    // content (consistent with rule 3 above), not just the parsed chart.
    validateChordsReferences(content, filePath);

    // Rule 10 (fail).
    if (chart.meta.format === 'v1') validateNoV1Markers(chart, filePath);

    // Rule 12 (warn).
    if (chart.meta.format === 'v2') await validatePinyin(pre, filePath);
}

// ── rule 12 (warn): py: lines match what tools/build-index.mjs generates ──
//
// py: is generated, never authored (BILINGUAL-SPEC.md §5.6) — a missing or
// stale py: line (a hand-edit, or a zh-* line edited without re-running the
// generator) is inert-but-wrong the same way a mismatched sidecar key is
// (rule 11): it doesn't break parsing, it just shows a reading nobody
// intended. A deliberate exception uses py!: instead (§5.6) — diffPinyinLines()
// skips those entirely, so this rule never sees them. Reuses tools/lib/
// pinyin.mjs's diffPinyinLines() — the exact same function build-index.mjs
// uses to decide what to write — so this can never drift into disagreeing
// with the generator about what's correct.
async function validatePinyin(pre, filePath) {
    await loadPinyinExceptions();
    const diffs = diffPinyinLines(pre.body);
    for (const d of diffs) {
        if (d.actual === d.expected) continue;
        const line = pre.bodyStartLine + (d.pyLineIndex ?? d.zhLineIndex + 1);
        const message = d.actual === null
            ? `zh-* line has no py: line beneath it — run node tools/build-index.mjs (expected "${d.expected}")`
            : `py: line "${d.actual}" doesn't match what tools/build-index.mjs would generate ("${d.expected}") — hand-edited or stale, re-run node tools/build-index.mjs`;
        report('WARN', 12, filePath, line, message);
    }
}

// ── rule 6 (warn): songs.json <-> charts/ cross-reference ──

async function validateRule6(chartFiles) {
    const songsRaw = await readFile(SONGS_JSON_PATH, 'utf8');
    const songs = JSON.parse(songsRaw);
    const songsLines = songsRaw.split('\n');

    const chartRelPaths = new Set(chartFiles.map(f => path.relative(REPO_ROOT, f)));
    const referenced = new Set();

    for (const song of songs) {
        if (!song.url) continue;
        const decoded = decodeURIComponent(song.url);
        referenced.add(decoded);

        if (!chartRelPaths.has(decoded)) {
            const needle = `"url": "${song.url}"`;
            const idx = songsLines.findIndex(l => l.includes(needle));
            report('WARN', 6, SONGS_JSON_PATH, idx === -1 ? 1 : idx + 1,
                `songs.json entry "${song.title}" points at a file that doesn't exist: ${song.url}`);
        }
    }

    for (const rel of chartRelPaths) {
        if (!referenced.has(rel)) {
            report('WARN', 6, path.join(REPO_ROOT, rel), 1,
                'chart file is not referenced by any entry in data/songs.json');
        }
    }
}

// ── rule 7: ASCII-only paths under charts/ ──

function validateRule7(chartFiles) {
    for (const f of chartFiles) {
        const rel = path.relative(REPO_ROOT, f);
        if (!/^[\x00-\x7F]*$/.test(rel)) {
            report('FAIL', 7, f, 1, `non-ASCII byte in path "${rel}" (BILINGUAL-SPEC.md §3)`);
        }
    }
}

// ── rule 11 (warn): setlist sidecar sectionOverrides <-> chart sections ──
//
// The same silent-mismatch class as rule 9's dangling {chords: ...}
// reference, one level up: a sidecar's sectionOverrides key that doesn't
// match any section in the chart it's for is inert today (renderSection's
// lookup just never fires) and stays inert forever unless someone happens
// to notice by eye. A sidecar's slug (its filename) is matched back to a
// chart the same way the browser resolves it at runtime — slugify(title) —
// so this can't drift from what actually gets fetched.
async function validateRule11() {
    let sidecarFiles;
    try {
        sidecarFiles = (await readdir(SETLISTS_DIR)).filter(f => f.endsWith('.json'));
    } catch {
        return; // no data/setlists/ directory yet — nothing to check
    }

    const songs = JSON.parse(await readFile(SONGS_JSON_PATH, 'utf8'));

    for (const file of sidecarFiles) {
        const slug = file.replace(/\.json$/, '');
        const filePath = path.join(SETLISTS_DIR, file);
        const raw = await readFile(filePath, 'utf8');
        const rawLines = raw.split('\n');

        let plans;
        try {
            plans = JSON.parse(raw);
        } catch (err) {
            report('WARN', 11, filePath, 1, `does not parse as JSON: ${err.message}`);
            continue;
        }

        const song = songs.find(s => slugify(s.title) === slug);
        if (!song) {
            report('WARN', 11, filePath, 1,
                `no data/songs.json entry has a title that slugifies to "${slug}" — this sidecar is unreachable at runtime`);
            continue;
        }

        let sectionNames;
        try {
            const chartContent = await readFile(path.join(REPO_ROOT, decodeURIComponent(song.url)), 'utf8');
            const pre = extractPre(chartContent);
            const chart = parseChartBody({
                text: pre.body, format: pre.format, key: pre.key,
                langs: pre.langs, primary: pre.primary, startLine: pre.bodyStartLine
            });
            sectionNames = new Set(chart.sections.filter(s => s.name).map(s => s.name));
        } catch (err) {
            report('WARN', 11, filePath, 1, `referenced chart "${song.url}" could not be read or parsed: ${err.message}`);
            continue;
        }

        (Array.isArray(plans) ? plans : []).forEach((plan, planIdx) => {
            const overrides = plan && plan.sectionOverrides;
            if (overrides) {
                for (const key of Object.keys(overrides)) {
                    if (sectionNames.has(key)) continue;
                    const lineIdx = rawLines.findIndex(l => l.includes(`"${key}"`));
                    report('WARN', 11, filePath, lineIdx === -1 ? 1 : lineIdx + 1,
                        `plan ${planIdx + 1}'s sectionOverrides key "${key}" matches no section in ${song.url} — inert, same class as an unresolved {chords: ...} target (rule 9)`);
                }
            }

            // repeats[].section names content to reuse — unlike `after`
            // (BILINGUAL-SPEC.md §6.3: a missing/unmatched `after` is
            // defined, intentional fallback behavior, renders at the end,
            // not a mismatch), a `section` that doesn't exist has no
            // content to repeat at all, so it's the same genuinely-inert
            // class as a sectionOverrides key.
            for (const [i, r] of (plan && plan.repeats || []).entries()) {
                if (!r || sectionNames.has(r.section)) continue;
                const lineIdx = rawLines.findIndex(l => l.includes(`"${r.section}"`));
                report('WARN', 11, filePath, lineIdx === -1 ? 1 : lineIdx + 1,
                    `plan ${planIdx + 1}'s repeats[${i}].section "${r.section}" matches no section in ${song.url} — inert, same class as an unresolved {chords: ...} target (rule 9)`);
            }
        });
    }
}

// ── main ──

async function main() {
    const allChartFiles = await walkFiles(CHARTS_DIR);
    const chartFiles = allChartFiles.filter(f => f.endsWith('.html'));

    for (const file of chartFiles) {
        await validateChartFile(file);
    }

    validateRule7(allChartFiles); // checked against every path, not just .html
    await validateRule6(chartFiles);
    await validateRule11();

    violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

    for (const v of violations) {
        console.log(`${v.file}:${v.line}: [rule ${v.rule} ${v.level}] ${v.message}`);
    }

    const fails = violations.filter(v => v.level === 'FAIL');
    const warns = violations.filter(v => v.level === 'WARN');
    console.log(`\n${chartFiles.length} chart file(s) checked — ${fails.length} failure(s), ${warns.length} warning(s).`);

    process.exitCode = fails.length > 0 ? 1 : 0;
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
