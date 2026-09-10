#!/usr/bin/env node
// tools/subset-cjk-font.mjs
//
// Builds the two self-hosted webfonts style.css's --font-mono-cjk token
// falls back to ('Noto Sans Mono CJK SC' / 'TC') — Google Fonts doesn't
// serve that family at all (confirmed: fonts.googleapis.com/css2 returns
// 400 "Font family not found" for it), and the full source OTFs are
// ~16MB each, too big to ship whole. This subsets each one down to only
// the Han characters + CJK punctuation actually used in this repo's
// zh-Hans / zh-Hant chart content, split by script so SC charts keep
// Simplified glyph shapes and TC charts keep Traditional ones.
//
// ── How to run ──
//
//   npm install
//   node tools/subset-cjk-font.mjs
//
// Downloads the ~16MB source OTF for each script into tools/out/ (gitignored,
// cached across runs — delete tools/out/*.otf to force a re-download) and
// writes fonts/NotoSansMonoCJKsc-subset.woff2 / -tc-subset.woff2, which style.css
// loads via @font-face. Re-run after adding bilingual charts with new
// characters — this is a superset-of-current-usage snapshot, not a fixed
// "1500 common characters" list, so it stays exactly as big as the site
// actually needs and no bigger.
//
// No flags, no hand-editing the output — same idempotent, rerun-after-content-
// changes shape as build-index.mjs.

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { glob } from 'fs/promises';
import subsetFont from 'subset-font';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE_DIR = path.join(ROOT, 'tools/out');
const FONTS_DIR = path.join(ROOT, 'fonts');

const SOURCES = {
    sc: {
        url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Mono/NotoSansMonoCJKsc-Regular.otf',
        cacheFile: 'NotoSansMonoCJKsc-Regular.otf',
        outFile: 'NotoSansMonoCJKsc-subset.woff2',
        family: 'Noto Sans Mono CJK SC',
        langMarker: 'Hans'
    },
    tc: {
        url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Mono/NotoSansMonoCJKtc-Regular.otf',
        cacheFile: 'NotoSansMonoCJKtc-Regular.otf',
        outFile: 'NotoSansMonoCJKtc-subset.woff2',
        family: 'Noto Sans Mono CJK TC',
        langMarker: 'Hant'
    }
};

// Punctuation worth keeping even if today's charts happen not to use it yet
// — cheap to include (a few dozen glyphs), expensive to discover missing
// mid-transcription of the next song.
const BASE_PUNCTUATION = '，。！？：；、「」『』（）—…·《》';

async function downloadIfMissing(url, cachePath) {
    if (existsSync(cachePath)) return;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, buf);
}

// Pulls every zh: lyric line out of every bilingual chart, split by script
// (data-langs carries "Hans" or "Hant") so a Simplified chart's characters
// never leak into the Traditional subset or vice versa.
async function collectUsedCharacters() {
    const chars = { sc: new Set([...BASE_PUNCTUATION]), tc: new Set([...BASE_PUNCTUATION]) };
    const files = await Array.fromAsync(glob(path.join(ROOT, 'charts/**/*.html')));

    for (const file of files) {
        const content = await readFile(file, 'utf8');
        if (!content.includes('data-format="bilingual"')) continue;

        const langsMatch = content.match(/data-langs="([^"]*)"/);
        const langs = langsMatch ? langsMatch[1] : '';
        const script = langs.includes(SOURCES.sc.langMarker) ? 'sc'
            : langs.includes(SOURCES.tc.langMarker) ? 'tc'
            : null;
        if (!script) continue;

        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('zh:')) continue;
            for (const ch of trimmed.slice(3)) {
                if (/[一-鿿㐀-䶿]/.test(ch)) chars[script].add(ch);
            }
        }
    }
    return chars;
}

async function main() {
    const chars = await collectUsedCharacters();
    await mkdir(FONTS_DIR, { recursive: true });

    for (const key of Object.keys(SOURCES)) {
        const src = SOURCES[key];
        const cachePath = path.join(CACHE_DIR, src.cacheFile);
        await downloadIfMissing(src.url, cachePath);

        const sourceBuf = await readFile(cachePath);
        const text = [...chars[key]].join('');
        const subsetBuf = await subsetFont(sourceBuf, text, { targetFormat: 'woff2' });

        const outPath = path.join(FONTS_DIR, src.outFile);
        await writeFile(outPath, subsetBuf);

        console.log(
            `${src.family}: ${text.length} glyphs, ` +
            `${(sourceBuf.length / 1024 / 1024).toFixed(1)}MB source -> ` +
            `${(subsetBuf.length / 1024).toFixed(1)}KB (${outPath.replace(ROOT, '')})`
        );
    }
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
