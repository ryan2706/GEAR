#!/usr/bin/env node
// tools/build-index.mjs
//
// Two generated-content jobs, both driven by titleZh / zh-* content that
// already exists in the source:
//
//  1. Rewrites data/songs.json with three generated fields for every record
//     that has titleZh — or, failing that, a title containing Han characters
//     (§7's Chinese-titled songs): titleZhAlt (opposite script), pinyin, and
//     pinyinInitials, with punctuation stripped from the last two. Per
//     BILINGUAL-SPEC.md §7/§9.
//  2. Writes a py: line beneath every zh-* lyric line in every v2
//     (data-format="bilingual") chart under charts/ — the generated-pinyin
//     reading-aid layer BILINGUAL-SPEC.md §5.6 defines, so team members who
//     read pinyin but not Han characters can follow along.
//
// ── How to run ──
//
//   npm install
//   node tools/build-index.mjs
//
// No flags. Always reads and rewrites data/songs.json in full, and rewrites
// (in place) any chart file whose py: lines are missing or out of date.
//
// ── DO NOT HAND-EDIT titleZhAlt, pinyin, pinyinInitials, or any py: line ──
//
// All of these are always recomputed and overwritten on every run — that's
// what makes this idempotent (same input -> same output) and it's also the
// enforcement mechanism for the rule: a hand-edit to any of them is
// silently clobbered the next time this script runs. If a generated value
// looks wrong:
//   - Wrong titleZhAlt/pinyin/pinyinInitials -> fix titleZh (or title, for
//     a Chinese-titled record with no titleZh), re-run.
//   - Wrong py: reading -> add/fix an entry in tools/pinyin-exceptions.json
//     (character or whole phrase -> correct reading), re-run. Don't patch
//     the chart file by hand — see BILINGUAL-SPEC.md §5.6's own framing of
//     this ("fix it in the build script's exception map, not the chart").
//   - Reading pinyin-pro just can't produce well (its comma spacing, or a
//     zh-* line with literal alignment whitespace — see the known
//     limitation below) -> write py!: instead of py: for that one line.
//     This script and validate-charts.mjs rule 12 both skip it entirely.
// See also the data/songs.json section of CLAUDE.md.
//
// tools/pinyin-exceptions.json is loaded once at startup via pinyin-pro's
// own customPinyin() (character *and* phrase-level overrides, in one flat
// map — pinyin-pro does the longest-match itself) and applies globally, so
// it also corrects any songs.json titleZh pinyin that happens to contain
// one of the same characters — one exception map, both generators.
// Starter entries: 祢 (the reverential "You" used for God in worship
// lyrics) defaults to the surname reading "mí" in pinyin-pro's own
// dictionary — a real, confirmed miss, not a hypothetical; 的/了/得 default
// to their least-common-in-lyrics polyphonic readings ("dí/liǎo/dé")
// rather than the overwhelmingly common sung-Mandarin ones. These are
// starter corrections, not an exhaustive table — grow the file as real
// readings turn up wrong.
//
// Known limitation: py: generation assumes the zh-* line's text (after
// stripping [chord] brackets) has no literal whitespace — pinyin-pro emits
// exactly one space-separated token per input character *including*
// punctuation, which is what lets the renderer zip pinyin syllables
// 1:1 against Han characters for ruby annotation, but a literal space
// inside the lyric text would collapse against the token separators and
// break that count. This does happen — some source docs pad zh-* lines with
// alignment spaces copied from the English line — and it isn't fixable in
// the generator (see tools/lib/pinyin.mjs's generateLinePinyin comment for
// why); use a hand-authored py!: line for that lyric line instead.
//
// Records with neither titleZh nor Han characters in title, and chart files
// that aren't data-format "bilingual", are left completely untouched.
//
// ── Script detection: opencc-js's own tables, not a hand list ──
//
// titleZh is converted through opencc-js in both directions (cn->tw and
// tw->cn). Whichever direction actually changes the string tells you which
// script titleZh is already in; the other direction's output becomes
// titleZhAlt. If neither direction changes it (every character is shared
// between scripts), titleZhAlt is set equal to titleZh and it's noted on
// stdout — an honest fallback, and harmless for search: an identical
// "alternate" still matches trivially.
//
// This only classifies titleZh itself, independent of the langs field
// (which tools/docx-to-chart.mjs sets from the chart *body*'s dominant
// script — a different, wider piece of text). The two can legitimately
// disagree on a song where the title was typed in one script out of habit
// but the body was transcribed in the other; this script doesn't try to
// reconcile that, since it only ever touches title-derived fields.
//
// ── Whole-file rewrite ──
//
// This does a full parse + JSON.stringify(data, null, 2), not a surgical
// per-record patch, so it also normalizes this file's inconsistent legacy
// spacing (some records use "ccli": "x", others "ccli":"x" — years of
// hand-editing). That's a deliberate one-time cost the first time this runs;
// every run after stays clean since the file is already normalized.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenCC from 'opencc-js';
import { pinyin } from 'pinyin-pro';
import { extractPre } from './lib/chart-file.mjs';
import { loadPinyinExceptions, diffPinyinLines, applyPinyinDiffs, PINYIN_GENERATED_COMMENT } from './lib/pinyin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SONGS_PATH = path.join(REPO_ROOT, 'data', 'songs.json');
const CHARTS_DIR = path.join(REPO_ROOT, 'charts');

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

function generateAltTitle(titleZh, log) {
    const asTraditional = toTraditional(titleZh);
    const asSimplified = toSimplified(titleZh);

    if (asTraditional !== titleZh) return asTraditional; // titleZh was Simplified
    if (asSimplified !== titleZh) return asSimplified;    // titleZh was Traditional

    log(`  note: "${titleZh}" has no characters that distinguish Simplified from Traditional — titleZhAlt set equal to titleZh`);
    return titleZh;
}

// pinyin-pro emits punctuation as tokens of its own ("sheng ling ( wo men
// ... )") — useless for search, so strip ASCII and full-width punctuation
// and symbols from every token and drop any token left empty.
function pinyinTokens(text, options) {
    return pinyin(text, { ...options, toneType: 'none', type: 'array' })
        .map(token => token.replace(/[\p{P}\p{S}\s]/gu, ''))
        .filter(Boolean);
}

function generatePinyinFields(titleZh) {
    return {
        pinyin: pinyinTokens(titleZh, {}).join(' '),
        pinyinInitials: pinyinTokens(titleZh, { pattern: 'first' }).join('')
    };
}

// The Chinese title the generated fields derive from: titleZh when present,
// otherwise the title itself if it contains Han characters (BILINGUAL-SPEC.md
// §7's Chinese-titled songs, which put the Chinese name in title and have no
// titleZh). Null means the record gets no generated fields.
const HAN_RE = /\p{Script=Han}/u;

function chineseTitleSource(song) {
    if (song.titleZh) return song.titleZh;
    if (HAN_RE.test(song.title ?? '')) return song.title;
    return null;
}

// ── chart-file py: injection (BILINGUAL-SPEC.md §5.6) ──
//
// The actual "what should py: say" logic (and the diff/apply split) lives
// in tools/lib/pinyin.mjs, shared with validate-charts.mjs's rule 12 — see
// that file for the generation rules.

async function walkFiles(dir) {
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await walkFiles(full));
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

async function updateChartFile(filePath, log) {
    const content = await readFile(filePath, 'utf8');
    const pre = extractPre(content);
    if (!pre || pre.format !== 'bilingual') return 0;

    const diffs = diffPinyinLines(pre.body);
    const { text: newBody, changedCount } = applyPinyinDiffs(pre.body, diffs);
    if (changedCount === 0) return 0;

    // Prepend the "generated, don't hand-edit" marker the first time this
    // file gets py: lines written into it — outside the <pre>, since an
    // HTML comment inside it would be parsed as chart body text, not a
    // comment (chart-parser.js's grammar has no concept of one).
    const alreadyMarked = content.slice(0, pre.openEnd).includes(PINYIN_GENERATED_COMMENT);
    const prefix = alreadyMarked ? '' : PINYIN_GENERATED_COMMENT + '\n';

    const newContent = prefix + content.slice(0, pre.openEnd) + newBody + content.slice(pre.closeIdx);
    await writeFile(filePath, newContent, 'utf8');
    log(`${path.relative(REPO_ROOT, filePath)}: ${changedCount} py: line(s) written/updated`);
    return changedCount;
}

// Explicit key order so the rewritten file reads (and diffs) predictably,
// regardless of the order fields happened to be in on disk.
const FIELD_ORDER = [
    'title', 'titleZh', 'titleZhAlt', 'pinyin', 'pinyinInitials',
    'url', 'format', 'langs', 'ccli', 'bpm', 'timeSignature'
];

function reorder(record) {
    const out = {};
    for (const key of FIELD_ORDER) {
        if (key in record) out[key] = record[key];
    }
    for (const key of Object.keys(record)) {
        if (!(key in out)) out[key] = record[key]; // preserve any unexpected extra field
    }
    return out;
}

async function main() {
    const log = (msg) => console.log(msg);

    const exceptions = await loadPinyinExceptions(); // applies to every pinyin() call below, both jobs
    log(`Loaded ${Object.keys(exceptions).length} pinyin exception(s) from tools/pinyin-exceptions.json\n`);

    // ── job 1: data/songs.json generated fields ──
    log('── songs.json ──');
    const raw = await readFile(SONGS_PATH, 'utf8');
    const songs = JSON.parse(raw);

    let generatedCount = 0;
    const updated = songs.map((song) => {
        const source = chineseTitleSource(song);
        if (!source) return reorder(song);

        generatedCount++;
        log(song.titleZh ? `${song.title} (${song.titleZh})` : `${song.title} (from title)`);
        const titleZhAlt = generateAltTitle(source, log);
        const { pinyin: py, pinyinInitials } = generatePinyinFields(source);
        log(`  titleZhAlt: ${titleZhAlt}`);
        log(`  pinyin: ${py}`);
        log(`  pinyinInitials: ${pinyinInitials}`);

        return reorder({ ...song, titleZhAlt, pinyin: py, pinyinInitials });
    });

    await writeFile(SONGS_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');

    log(`\n${updated.length} records total, ${generatedCount} with a Chinese title (generated fields written).`);
    log(`Wrote ${path.relative(REPO_ROOT, SONGS_PATH)}`);

    // ── job 2: py: lines in v2 chart files ──
    log('\n── chart files (py: layer, BILINGUAL-SPEC.md §5.6) ──');
    const chartFiles = (await walkFiles(CHARTS_DIR)).filter(f => f.endsWith('.html'));

    let filesTouched = 0;
    let linesTouched = 0;
    for (const file of chartFiles) {
        const changed = await updateChartFile(file, log);
        if (changed > 0) {
            filesTouched++;
            linesTouched += changed;
        }
    }

    log(`\n${chartFiles.length} chart file(s) checked, ${filesTouched} updated, ${linesTouched} py: line(s) written/changed.`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
