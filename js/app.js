// Main Application Entry Point

import { parseChartBody } from './chart-parser.js';
import { renderChart, transposeChart, keyDisplay } from './chart-render.js';
import { matchSectionHeader } from './chart-constants.js';
import { initChordTooltip } from './chord-fingering.js';

// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

const currentTheme = localStorage.getItem('theme');
if (currentTheme == 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
} else if (currentTheme == 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
}

themeToggle.addEventListener('click', function () {
    let theme = 'light';
    if (document.documentElement.getAttribute('data-theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'dark');
        theme = 'dark';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme', theme);
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Close menu when a link is clicked
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });
}

// Router and Content Loading
const routes = {
    '/': renderHome,
    '/search': renderSearch,
    '/generate': renderGenerate,
    '/about': renderAbout
};

const mainContent = document.getElementById('main-content');
let songsData = [];
// selectedSongs is an Array of setlist entries:
//   { entryId, title, keyIndex, langMode, sectionOverrides, planLabel }
// entryId (not title) is the entry's identity — the same song can appear
// more than once under different planLabels (the setlist builder's
// Duplicate button), so title alone can no longer be trusted to find "the"
// entry the way it used to.
let selectedSongs = [];

// Document-level docx export option, not per-song — lives alongside
// selectedSongs the same way (in-memory, survives renderGenerate()'s
// re-renders, reset on page reload) rather than in localStorage, matching
// how the rest of the setlist's own state already persists.
let includePinyin = false;

function newSetlistEntry(title, keyIndex, song) {
    const entry = {
        entryId: crypto.randomUUID(),
        title,
        keyIndex,
        planLabel: ''
    };
    if (song && song.chart && song.chart.meta.langs.length > 1) {
        entry.langMode = song.langMode;
        entry.sectionOverrides = {};
    }
    return entry;
}

async function loadSongs() {
    if (songsData.length === 0) {
        try {
            const response = await fetch('data/songs.json?timestamp=' + new Date().getTime());
            songsData = await response.json();
        } catch (error) {
            console.error('Error loading songs:', error);
        }
    }
}

let carouselInterval = null;

async function handleNavigation() {
    // Clear any existing carousel interval
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    const hash = window.location.hash.slice(1) || '/';


    // Simple route matching
    let routeHandler = routes[hash];

    // Handle parameterized routes (e.g., song details)
    if (!routeHandler && hash.startsWith('/song/')) {
        routeHandler = () => renderSongDetail(hash);
    }

    if (routeHandler) {
        await routeHandler();
    } else {
        renderNotFound();
    }

    // Update active nav link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${hash}`) {
            link.classList.add('active');
        }
    });
}

function renderHome() {
    mainContent.innerHTML = `
        <section class="hero-carousel-section">
            <div class="carousel-container">
                <div class="carousel-inner" id="carousel-inner">
                    <!-- Items injected via JS -->
                </div>
                <button class="carousel-control prev" id="carousel-prev" aria-label="Previous Slide">❮</button>
                <button class="carousel-control next" id="carousel-next" aria-label="Next Slide">❯</button>
                <div class="carousel-indicators" id="carousel-indicators"></div>
            </div>
        </section>

        <section class="features-section" style="margin-top: 2rem;">
            <div class="features-grid">
                <a href="#/search" class="feature-card">
                    <h3>Browse Songs</h3>
                    <p>Search our comprehensive repertoire of praise songs.</p>
                    <span class="btn btn-primary btn-sm">Search Now</span>
                </a>
                <a href="#/generate" class="feature-card">
                    <h3>Generate Charts</h3>
                    <p>Create and download custom chord charts for your setlist.</p>
                    <span class="btn btn-secondary btn-sm">Create Setlist</span>
                </a>
            </div>
        </section>
    `;

    initCarousel();
}

const carouselData = [
    {
        img: 'banner---piano.jpg',
        verse: '"Sing to him a new song; play skillfully, and shout for joy."',
        ref: 'Psalm 33:3'
    },
    {
        img: 'banner---drumsticks.jpg',
        verse: '"All the nations you have made will come and worship before you, Lord; they will bring glory to your name. For you are great and do marvelous deeds; you alone are God."',
        ref: 'Psalm 86:9-10'
    },
    {
        img: 'banner---electricGuitar.jpg',
        verse: '"All the earth worships you and sings praises to you; they sing praises to your name."',
        ref: 'Psalm 66:4'
    }
];

function initCarousel() {
    const track = document.getElementById('carousel-inner');
    const indicators = document.getElementById('carousel-indicators');
    if (!track) return;

    let currentIndex = 0;

    // Render Items
    track.innerHTML = carouselData.map((item, index) => `
        <div class="carousel-item ${index === 0 ? 'active' : ''}" style="background-image: url('${item.img}')">
            <div class="carousel-overlay">
                <div class="carousel-text">
                    <blockquote>${item.verse}</blockquote>
                    <cite>${item.ref}</cite>
                </div>
            </div>
        </div>
    `).join('');

    // Render Indicators
    indicators.innerHTML = carouselData.map((_, index) => `
        <button class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Slide ${index + 1}"></button>
    `).join('');

    const updateCarousel = () => {
        const items = track.querySelectorAll('.carousel-item');
        const dots = indicators.querySelectorAll('.indicator');

        items.forEach((item, i) => {
            item.classList.toggle('active', i === currentIndex);
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    };

    const nextSlide = () => {
        currentIndex = (currentIndex + 1) % carouselData.length;
        updateCarousel();
    };

    const prevSlide = () => {
        currentIndex = (currentIndex - 1 + carouselData.length) % carouselData.length;
        updateCarousel();
    };

    document.getElementById('carousel-next').addEventListener('click', () => {
        nextSlide();
        resetTimer();
    });

    document.getElementById('carousel-prev').addEventListener('click', () => {
        prevSlide();
        resetTimer();
    });

    indicators.querySelectorAll('.indicator').forEach(dot => {
        dot.addEventListener('click', (e) => {
            currentIndex = parseInt(e.target.dataset.index);
            updateCarousel();
            resetTimer();
        });
    });

    const startTimer = () => {
        carouselInterval = setInterval(nextSlide, 6000); // 6 seconds
    };

    const resetTimer = () => {
        clearInterval(carouselInterval);
        startTimer();
    };

    startTimer();
}

// A song's langs field only exists on bilingual/v2 entries — the 300+
// existing v1 entries have none at all, which means "English" (every v1
// chart is English-only), not "unknown."
function songLanguageCategory(song) {
    const langs = song.langs || ['en'];
    const hasEn = langs.some(l => l.startsWith('en'));
    const hasZh = langs.some(l => l.startsWith('zh'));
    if (hasEn && hasZh) return 'bilingual';
    if (hasZh) return 'zh';
    return 'en';
}

// No 'zh' (Chinese-only) chip — the catalog currently has zero Mandarin-only
// songs, so that filter could never match anything. songLanguageCategory()
// still returns 'zh' for one if it's ever added; re-add the chip then.
const LANG_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'en', label: 'EN' },
    { key: 'bilingual', label: 'EN/中' }
];

// Locale-aware alphabetical sort by English title, applied before any lang
// filter or search-relevance ranking so the search page's list order is
// predictable in every filter mode (All/EN/EN/中), not just insertion order
// from songs.json. A leading "The " or "A " is ignored for sort purposes
// only — the rendered title is untouched — so "The Power of Your Love"
// files under P, not T.
//
// Intl.Collator (not a raw string sort) is what makes "10,000 Reasons" and
// titles with punctuation or accents land sensibly rather than by raw
// UTF-16 code unit. `numeric: true` compares embedded digit runs by value;
// with only one digit-led title in the catalog it has no other numeric
// title to sort against, but it's the correct default if more are added.
// Where "10,000 Reasons" actually lands: *first*, ahead of every letter
// title — the default collation orders digits before letters, same as
// plain "1" < "A". If you'd rather it file alphabetically as if spelled out
// ("Ten Thousand Reasons", under T) or in its own bucket, say so; that needs
// a hand-authored sort key, not something the collator infers from "10,000".
const TITLE_SORT_ARTICLE_RE = /^(the|a)\s+/i;
const titleCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function titleSortKey(title) {
    return title.replace(TITLE_SORT_ARTICLE_RE, '');
}

function sortSongsByTitle(songs) {
    return [...songs].sort((a, b) => titleCollator.compare(titleSortKey(a.title), titleSortKey(b.title)));
}

// Two-tier ranking: an exact-prefix match in any searchable field outranks
// a substring-only match anywhere else. Ties keep the pool's incoming order
// (Array.prototype.sort is stable) — callers pass an already
// alphabetically-sorted pool (see sortSongsByTitle above) so ties land
// alphabetically rather than in songs.json's insertion order.
function matchSongs(songs, query) {
    const q = query.trim().toLowerCase();
    if (!q) return songs;

    const ranked = [];
    for (const song of songs) {
        const fields = [song.title, song.titleZh, song.titleZhAlt, song.pinyin, song.pinyinInitials]
            .filter(Boolean)
            .map(f => f.toLowerCase());
        // pinyin is stored space-joined ("sheng jie ...") for readability;
        // also compare a space-stripped copy so "shengjie" matches it too.
        if (song.pinyin) fields.push(song.pinyin.toLowerCase().replace(/\s+/g, ''));

        let tier = null;
        for (const f of fields) {
            if (f.startsWith(q)) { tier = 0; break; }
            if (tier === null && f.includes(q)) tier = 1;
        }
        if (tier !== null) ranked.push({ song, tier });
    }

    ranked.sort((a, b) => a.tier - b.tier);
    return ranked.map(r => r.song);
}

async function renderSearch() {
    await loadSongs();
    let activeLangFilter = 'all';

    const chipsHtml = LANG_FILTERS.map(f =>
        `<button class="key-pill${f.key === 'all' ? ' active' : ''}" data-lang-filter="${f.key}">${f.label}</button>`
    ).join('');

    mainContent.innerHTML = `
        <section class="search-page">
            <h1>Search Songs</h1>
            <div class="key-pills lang-filter-chips">${chipsHtml}</div>
            <input type="text" id="search-input" placeholder="Search by title..." class="search-input">
            <div id="song-list" class="song-list">
                ${renderSongList(sortSongsByTitle(songsData))}
            </div>
        </section>
    `;

    const updateResults = () => {
        const query = document.getElementById('search-input').value;
        let pool = activeLangFilter === 'all'
            ? songsData
            : songsData.filter(s => songLanguageCategory(s) === activeLangFilter);
        pool = sortSongsByTitle(pool);
        pool = matchSongs(pool, query);
        document.getElementById('song-list').innerHTML = renderSongList(pool);
    };

    document.getElementById('search-input').addEventListener('input', updateResults);

    document.querySelectorAll('.lang-filter-chips .key-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            activeLangFilter = btn.dataset.langFilter;
            document.querySelectorAll('.lang-filter-chips .key-pill').forEach(b => b.classList.toggle('active', b === btn));
            updateResults();
        });
    });

    // Add event listeners for checkboxes
    document.getElementById('song-list').addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            const title = e.target.value;
            if (e.target.checked) {
                // Check if already in list
                if (!selectedSongs.some(s => s.title === title)) {
                    // Fetch song to get original key
                    const song = songsData.find(s => s.title === title);
                    if (song) {
                        await fetchSongContent(song);
                        const keyIndex = song.originalKeyIndex !== undefined ? song.originalKeyIndex : 0;
                        selectedSongs.push(newSetlistEntry(title, keyIndex, song));
                    }
                }
            } else {
                // Unchecking on the search page removes every instance of this
                // song — duplicate plan-label entries are managed from the
                // setlist builder, not this per-song checkbox.
                selectedSongs = selectedSongs.filter(s => s.title !== title);
            }
        }
    });
}

function renderSongList(songs) {
    if (songs.length === 0) return '<p>No songs found.</p>';
    return songs.map(song => `
        <div class="song-item-container">
            <input type="checkbox" id="song-${song.title}" value="${song.title}" ${selectedSongs.some(s => s.title === song.title) ? 'checked' : ''}>
            <a href="#/song/${encodeURIComponent(song.title)}" class="song-item" data-url="${song.url}">
                <span class="song-item-text">
                    <span class="song-item-title">${song.title}</span>
                    ${song.titleZh ? `<span class="song-item-zh">${song.titleZh}</span>` : ''}
                </span>
            </a>
            ${song.ccli ? '<span class="ccli-badge">CCLI</span>' : ''}
        </div>
    `).join('');
}

// ── Bilingual (v2) helpers ──

function shortLang(tag) {
    return (tag || '').split('-')[0].toLowerCase();
}

const LANG_MODES = ['en', 'zh', 'en-zh', 'zh-en'];

// Short glyphs for the circular .key-pill buttons — "EN-ZH" doesn't fit a
// 38px circle, "EN/中" does. Order follows the mode string, so 'zh-en'
// reads "中/EN" (Chinese primary) rather than always "EN/中".
const LANG_MODE_GLYPHS = { en: 'EN', zh: '中' };
function langModeLabel(mode) {
    return mode.split('-').map(part => LANG_MODE_GLYPHS[part]).join('/');
}

function isModeAvailable(mode, langs) {
    const shorts = langs.map(shortLang);
    return mode.split('-').every(part => shorts.includes(part));
}

// Ruby-support detection needs `document`, which is why it lives here and
// not in chart-render.js (documented there as DOM-independent on purpose).
// Computed once — a browser doesn't change its <ruby> support mid-session.
const RUBY_SUPPORTED = !(document.createElement('ruby') instanceof HTMLUnknownElement);

// True if any zh-* lyric line in this chart carries a generated .pinyin
// reading (BILINGUAL-SPEC.md §5.6) — used to decide whether the "Show
// Pinyin" toggle is worth showing at all for this song.
function chartHasPinyin(chart) {
    return chart.sections.some(section =>
        section.groups.some(group =>
            group.type === 'lyric' && group.lines.some(line => !!line.pinyin)
        )
    );
}

// Helper to fetch and parse song content
async function fetchSongContent(song) {
    if (song.chart) return; // Already loaded

    try {
        const response = await fetch(song.url);
        if (!response.ok) throw new Error('Content not found');
        const html = await response.text();

        // DOMParser, not regex, pulls the fragment's <pre> apart — every
        // data-* attribute rides through as-is via `meta`, so a chart can
        // gain a new one without this call site needing to know its name.
        // `key` absent from `meta` (undefined) is what triggers
        // parseChartBody's own detectKeyIndexFromText() fallback below.
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const pre = doc.querySelector('pre.chord-chart') || doc.querySelector('pre');
        const meta = pre ? { ...pre.dataset } : {};

        song.chart = parseChartBody({ ...meta, text: pre ? pre.textContent : html });
        song.originalKeyIndex = song.chart.meta.keyIndex;

        // If currentKeyIndex wasn't set (e.g. added from search), set it to original
        if (song.currentKeyIndex === undefined) {
            song.currentKeyIndex = song.originalKeyIndex;
        }

        // Seed the language-mode toggle: a saved choice from a previous chart
        // if it's compatible with this one, otherwise English first — the
        // one site-wide default, regardless of a chart's own data-primary.
        const { langs } = song.chart.meta;
        if (langs.length > 1 && song.langMode === undefined) {
            const savedMode = localStorage.getItem('chartLang');
            const enTag = langs.find(l => l.toLowerCase().startsWith('en')) || langs[0];
            const otherLang = langs.find(l => l !== enTag) || langs[0];
            const defaultMode = `${shortLang(enTag)}-${shortLang(otherLang)}`;
            song.langMode = (savedMode && isModeAvailable(savedMode, langs)) ? savedMode : defaultMode;
        } else if (langs.length === 1 && song.langMode === undefined) {
            song.langMode = shortLang(langs[0]);
        }

    } catch (error) {
        console.error("Error fetching song content:", error);
        song.chart = {
            meta: { format: 'v1', key: undefined, keyIndex: 0, langs: [], primary: undefined },
            sections: [{
                name: null,
                groups: [{ type: 'v1block', lines: [{ kind: 'other', text: "Error loading content: " + song.url }] }]
            }]
        };
        song.originalKeyIndex = 0;
    }
}

async function renderSongDetail(hash) {
    const title = decodeURIComponent(hash.split('/song/')[1]);
    await loadSongs();
    const song = songsData.find(s => s.title === title);

    if (!song) {
        renderNotFound();
        return;
    }

    mainContent.innerHTML = `
        <section class="song-detail">
            <h1>${song.title}</h1>
            <div class="loading">Loading chart...</div>
        </section>
    `;

    await fetchSongContent(song);

    // If we have a stored key for this song in selectedSongs, use it
    const storedSong = selectedSongs.find(s => s.title === song.title);
    if (storedSong) {
        song.currentKeyIndex = storedSong.keyIndex;
    } else {
        song.currentKeyIndex = song.originalKeyIndex;
    }

    renderSongContent(song);
}

function renderSongContent(song) {
    const semitones = song.currentKeyIndex - song.originalKeyIndex;
    const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const escapedTitle = song.title.replace(/'/g, "\\'");
    const isBilingual = song.chart.meta.langs.length > 1;
    const hasPinyin = chartHasPinyin(song.chart);
    const showPinyin = hasPinyin && localStorage.getItem('showPinyin') === 'true';
    const pinyinMode = showPinyin ? (RUBY_SUPPORTED ? 'ruby' : 'stacked') : 'off';

    const chartHtml = renderChart(song.chart, { mode: song.langMode, semitones, pinyin: pinyinMode });
    const keyText = keyDisplay(transposeChart(song.chart, semitones));

    // Key pills — all 12 chromatic keys
    const keyPills = KEY_DISPLAY.map((key, index) => {
        const isActive = index === song.currentKeyIndex;
        return `<button class="key-pill${isActive ? ' active' : ''}" onclick="changeKey('${escapedTitle}', ${index})" aria-label="Key ${key}">${key}</button>`;
    }).join('');

    // Language toggle — reuses the .key-pill pattern, only shown for charts
    // with more than one language. A mode is disabled when this chart's
    // langs don't cover it.
    const langToggleRow = isBilingual ? `
            <div class="key-selector">
                <span class="section-header">Language:</span>
                <div class="key-pills">${LANG_MODES.map(mode => {
        const available = isModeAvailable(mode, song.chart.meta.langs);
        const isActive = mode === song.langMode;
        return `<button class="key-pill${isActive ? ' active' : ''}" ${available ? '' : 'disabled'} onclick="setChartLang('${escapedTitle}', '${mode}')" aria-label="Language ${mode}">${langModeLabel(mode)}</button>`;
    }).join('')}</div>
            </div>` : '';

    // Pinyin toggle — only shown when this chart actually has a generated
    // .pinyin reading on at least one zh-* line (BILINGUAL-SPEC.md §5.6).
    // A single on/off pill, not a per-mode set like language, since there's
    // only one thing to toggle.
    const pinyinToggleRow = hasPinyin ? `
            <div class="key-selector">
                <span class="section-header">Pinyin:</span>
                <div class="key-pills">
                    <button class="key-pill key-pill-wide${showPinyin ? ' active' : ''}" onclick="togglePinyin('${escapedTitle}')" aria-pressed="${showPinyin}">Show Pinyin</button>
                </div>
            </div>` : '';

    // Metadata chips — only rendered when optional fields exist in songs.json
    const chips = [];
    if (song.ccli)          chips.push(`<span class="song-meta-chip">CCLI: ${song.ccli}</span>`);
    if (song.bpm)           chips.push(`<span class="song-meta-chip">BPM: ${song.bpm}</span>`);
    if (song.timeSignature) chips.push(`<span class="song-meta-chip">${song.timeSignature}</span>`);
    const metaChips = chips.length ? `<div class="song-meta-chips">${chips.join('')}</div>` : '';

    const artistLine = song.artist ? `<p class="song-artist">${song.artist}</p>` : '';

    const inSetlist = selectedSongs.some(s => s.title === song.title);
    const addBtnLabel = inSetlist ? 'Update Key' : 'Add to Setlist';

    document.querySelector('.song-detail').innerHTML = `
        <div class="song-detail-nav">
            <button onclick="window.history.back()" class="back-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                Back to Library
            </button>
            <button onclick="addToSetlist('${escapedTitle}', ${song.currentKeyIndex})" class="btn btn-primary btn-add-setlist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                ${addBtnLabel}
            </button>
        </div>

        <div class="song-detail-header">
            <h1>${song.title}</h1>
            ${artistLine}
            ${metaChips}
        </div>

        <div class="song-detail-controls">
            <div class="key-selector">
                <span class="section-header">Key: ${keyText}</span>
                <div class="key-pills">${keyPills}</div>
            </div>${langToggleRow}${pinyinToggleRow}
        </div>

        <div class="song-content">
            ${chartHtml}
            <p class="copyright-notice">${song.title} is the copyrighted property of its owner(s).</p>
        </div>
    `;
}

window.changeKey = (title, newKeyIndex) => {
    const song = songsData.find(s => s.title === title);
    if (song) {
        song.currentKeyIndex = parseInt(newKeyIndex);
        // If in setlist, update the stored key
        const storedSong = selectedSongs.find(s => s.title === title);
        if (storedSong) {
            storedSong.keyIndex = song.currentKeyIndex;
        }
        renderSongContent(song);
    }
};

window.setChartLang = (title, mode) => {
    const song = songsData.find(s => s.title === title);
    if (song) {
        song.langMode = mode;
        localStorage.setItem('chartLang', mode);
        renderSongContent(song);
    }
};

// Global, not per-song — one reading-aid preference for the whole site,
// consistent with how the language mode is remembered via localStorage.
window.togglePinyin = (title) => {
    const song = songsData.find(s => s.title === title);
    if (song) {
        const next = !(localStorage.getItem('showPinyin') === 'true');
        localStorage.setItem('showPinyin', String(next));
        renderSongContent(song);
    }
};

// Helper to add from detail page. The song-detail page isn't plan-aware, so
// this always targets the *first* existing entry for the title if one
// exists — adding a second instance under a different planLabel is a
// setlist-builder action (the Duplicate button), not this one.
window.addToSetlist = (title, keyIndex) => {
    const existing = selectedSongs.find(s => s.title === title);
    if (!existing) {
        const song = songsData.find(s => s.title === title);
        selectedSongs.push(newSetlistEntry(title, keyIndex, song));
        alert(`Added "${title}" to setlist!`);
    } else {
        existing.keyIndex = keyIndex;
        alert(`Updated "${title}" in setlist!`);
    }
};

// Helper to add song with fetch for original key. Adds one entry if this
// title isn't in the setlist yet; the "add same song again" path is the
// setlist builder's explicit Duplicate button, not re-adding by title here.
async function addSongToSetlist(title) {
    const song = songsData.find(s => s.title === title);
    if (!song) return;
    await fetchSongContent(song);
    const existing = selectedSongs.find(s => s.title === title);
    if (!existing) {
        selectedSongs.push(newSetlistEntry(title, song.originalKeyIndex, song));
    } else {
        existing.keyIndex = song.originalKeyIndex;
    }
}

async function renderGenerate() {
    // Ensure we have songs loaded
    await loadSongs();

    // Make sure every setlist entry's song has its chart loaded, regardless
    // of how it was added — the mode selector and section-override list
    // below need song.chart.meta.langs / .sections to exist.
    await Promise.all(selectedSongs.map(entry => {
        const song = songsData.find(s => s.title === entry.title);
        return song ? fetchSongContent(song) : Promise.resolve();
    }));

    const KEY_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    mainContent.innerHTML = `
        <section class="generate-page">
            <h1>Generate Chord Chart</h1>

            <div class="add-song-wrapper">
                <input type="text" id="add-song-input" placeholder="Search to add song..." class="search-input" style="margin-bottom: 0;">
                <ul id="add-song-suggestions" class="suggestions-list hidden"></ul>
            </div>

            <p>Selected Songs: ${selectedSongs.length}</p>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">Drag and drop to reorder songs.</p>
            ${selectedSongs.length > 0 ? `
                <ul class="selected-list" id="sortable-list">
                    ${selectedSongs.map((entry) => {
        const song = songsData.find(s => s.title === entry.title);
        const isBilingual = !!(song && song.chart && song.chart.meta.langs.length > 1);

        const options = KEY_DISPLAY.map((key, kIndex) => {
            const selected = kIndex === entry.keyIndex ? 'selected' : '';
            return `<option value="${kIndex}" ${selected}>${key}</option>`;
        }).join('');

        const langModeRow = isBilingual ? `
                            <div class="setlist-lang-mode key-pills" data-entry-id="${entry.entryId}">
                                ${LANG_MODES.map(mode => {
            const available = isModeAvailable(mode, song.chart.meta.langs);
            const isActive = mode === entry.langMode;
            return `<button class="key-pill${isActive ? ' active' : ''}" data-mode="${mode}" ${available ? '' : 'disabled'} onclick="updateSetlistLangMode('${entry.entryId}', '${mode}')" aria-label="Language ${mode}">${langModeLabel(mode)}</button>`;
        }).join('')}
                            </div>` : '';

        const sectionOverridesRow = isBilingual ? `
                            <details class="setlist-section-overrides">
                                <summary>Per-section language</summary>
                                ${song.chart.sections.filter(s => s.name).map(s => {
            const current = (entry.sectionOverrides && entry.sectionOverrides[s.name]) || '';
            const sectionOptions = ['<option value="">(use song default)</option>']
                .concat(LANG_MODES.map(mode => `<option value="${mode}" ${mode === current ? 'selected' : ''}>${mode.toUpperCase()}</option>`));
            return `
                                <div class="section-override-row">
                                    <span>${s.name}</span>
                                    <select onchange="updateSetlistSectionOverride('${entry.entryId}', '${s.name}', this.value)">
                                        ${sectionOptions.join('')}
                                    </select>
                                </div>`;
        }).join('')}
                            </details>` : '';

        return `
                        <li draggable="true" data-entry-id="${entry.entryId}" style="cursor: grab;">
                            <div class="setlist-row-top">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="color: var(--text-muted); cursor: grab;">☰</span>
                                    <span>${song ? song.title : entry.title}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="text" class="setlist-plan-label" placeholder="Main" value="${entry.planLabel || ''}" onchange="updateSetlistPlanLabel('${entry.entryId}', this.value)">
                                    <select onchange="updateSetlistKey('${entry.entryId}', this.value)" class="key-select" style="padding: 0.25rem;">
                                        ${options}
                                    </select>
                                    <button onclick="duplicateSetlistEntry('${entry.entryId}')" class="remove-btn" aria-label="Duplicate" title="Duplicate for another plan slot">⧉</button>
                                    <button onclick="removeFromSetlist('${entry.entryId}')" class="remove-btn" aria-label="Remove">x</button>
                                </div>
                            </div>${langModeRow}${sectionOverridesRow}
                        </li>`;
    }).join('')}
                </ul>
                <label style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; cursor: pointer; width: fit-content;">
                    <input type="checkbox" id="include-pinyin-checkbox" ${includePinyin ? 'checked' : ''} onchange="setIncludePinyin(this.checked)">
                    Include pinyin
                </label>
                <button onclick="generateDoc()" class="btn btn-primary" style="margin-top: 0.5rem;">Download Word Doc</button>
            ` : '<p>No songs selected. Go to <a href="#/search">Search</a> to add songs.</p>'}
        </section>
    `;

    // Event Listeners for Add Song
    const input = document.getElementById('add-song-input');
    const suggestionsList = document.getElementById('add-song-suggestions');

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            suggestionsList.classList.add('hidden');
            return;
        }

        const matches = songsData.filter(s => s.title.toLowerCase().includes(query) && !selectedSongs.some(sel => sel.title === s.title)).slice(0, 10);

        if (matches.length > 0) {
            suggestionsList.innerHTML = matches.map(s => `
                <li data-title="${s.title}">${s.title}</li>
            `).join('');
            suggestionsList.classList.remove('hidden');

            suggestionsList.querySelectorAll('li').forEach(li => {
                li.addEventListener('click', async () => {
                    const title = li.getAttribute('data-title');
                    input.value = '';
                    suggestionsList.classList.add('hidden');
                    await addSongToSetlist(title);
                    renderGenerate();
                });
            });
        } else {
            suggestionsList.classList.add('hidden');
        }
    });

    // Add Drag and Drop Listeners
    const list = document.getElementById('sortable-list');
    if (list) {
        let draggedItem = null;

        list.addEventListener('dragstart', (e) => {
            draggedItem = e.target;
            e.dataTransfer.effectAllowed = 'move';
            e.target.style.opacity = '0.5';
        });

        list.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            draggedItem = null;
            // Re-render to ensure state matches DOM (optional, but good for consistency)
            // Actually, we need to update the array based on new DOM order if we didn't update array during drag
            // Let's update array on drop/dragover instead.
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const currentItem = draggedItem;
            if (afterElement == null) {
                list.appendChild(currentItem);
            } else {
                list.insertBefore(currentItem, afterElement);
            }
        });

        // On drop (or rather, when drag ends), we need to update the selectedSongs array to match the new DOM order
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            updateArrayFromDOM();
        });

        // Mobile Touch Events
        let touchDraggedItem = null;

        list.addEventListener('touchstart', (e) => {
            const li = e.target.closest('li');
            if (li && list.contains(li)) {
                touchDraggedItem = li;
                // Optional: visual feedback
                li.style.opacity = '0.5';
            }
        }, { passive: false });

        list.addEventListener('touchmove', (e) => {
            if (!touchDraggedItem) return;
            e.preventDefault(); // Prevent scrolling while dragging

            const touch = e.touches[0];
            const afterElement = getDragAfterElement(list, touch.clientY);

            if (afterElement == null) {
                list.appendChild(touchDraggedItem);
            } else {
                list.insertBefore(touchDraggedItem, afterElement);
            }
        }, { passive: false });

        list.addEventListener('touchend', (e) => {
            if (touchDraggedItem) {
                touchDraggedItem.style.opacity = '1';
                touchDraggedItem = null;
                updateArrayFromDOM();
            }
        });
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateArrayFromDOM() {
    const listItems = document.querySelectorAll('#sortable-list li');
    const newOrder = [];
    listItems.forEach(item => {
        const entryId = item.dataset.entryId;
        const entry = selectedSongs.find(s => s.entryId === entryId);
        if (entry) {
            newOrder.push(entry);
        }
    });
    selectedSongs = newOrder;
    // No need to re-render immediately as DOM is already correct, but good practice to ensure sync
    // renderGenerate();
}

window.updateSetlistKey = (entryId, newKeyIndex) => {
    const entry = selectedSongs.find(s => s.entryId === entryId);
    if (entry) {
        entry.keyIndex = parseInt(newKeyIndex);
    }
};

window.removeFromSetlist = (entryId) => {
    selectedSongs = selectedSongs.filter(s => s.entryId !== entryId);
    renderGenerate();
};

window.duplicateSetlistEntry = (entryId) => {
    const entry = selectedSongs.find(s => s.entryId === entryId);
    if (!entry) return;
    const index = selectedSongs.indexOf(entry);
    const copy = { ...entry, entryId: crypto.randomUUID(), planLabel: '' };
    if (entry.sectionOverrides) copy.sectionOverrides = { ...entry.sectionOverrides };
    selectedSongs.splice(index + 1, 0, copy);
    renderGenerate();
};

window.updateSetlistPlanLabel = (entryId, label) => {
    const entry = selectedSongs.find(s => s.entryId === entryId);
    if (entry) entry.planLabel = label;
};

// Document-level, not per-entry — no re-render needed, generateDoc() just
// reads the module variable when it's actually clicked.
window.setIncludePinyin = (checked) => {
    includePinyin = checked;
};

window.updateSetlistLangMode = (entryId, mode) => {
    const entry = selectedSongs.find(s => s.entryId === entryId);
    if (!entry) return;
    entry.langMode = mode;
    document.querySelectorAll(`.setlist-lang-mode[data-entry-id="${entryId}"] .key-pill`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
};

window.updateSetlistSectionOverride = (entryId, sectionName, mode) => {
    const entry = selectedSongs.find(s => s.entryId === entryId);
    if (!entry) return;
    if (!entry.sectionOverrides) entry.sectionOverrides = {};
    if (mode) {
        entry.sectionOverrides[sectionName] = mode;
    } else {
        delete entry.sectionOverrides[sectionName];
    }
};

// ── docx export helpers ──
// generateDoc() below walks the parsed (and transposed) Chart AST directly
// — no more regex-scraping renderChart()'s HTML output.

const DOCX_RUN = { font: 'Courier New', size: 24 }; // 12pt

// The pinyin row (BILINGUAL-SPEC.md §5.6) needs to read as a third category,
// distinct from both the bold-blue chord row and the plain lyric row —
// italic, smaller, and a mid-gray rather than a third arbitrary color, which
// also happens to be the same "secondary text" register Word documents
// conventionally use for captions. Deliberately DOCX_RUN.font (Courier New),
// not cjkFont: this run is romanized Latin text with tone diacritics
// (ā í ǐ ò ǔ …), not Han characters, and a CJK-oriented font substitution
// (SimSun/Microsoft YaHei/JhengHei) is a real risk for exactly those
// diacritics — Courier New is the one already confirmed to carry them.
const PINYIN_RUN = { font: DOCX_RUN.font, size: 18, italics: true, color: '666666' }; // 9pt

// A little vertical breathing room before every section header but the
// first — matches what the on-screen v2 chart already does with
// --chart-section-gap (.chart-section .section-header's margin-top in
// style.css, zeroed only on :first-child). v1 got this for free from a
// blank line already sitting in the chart source ahead of the header, which
// holds for all but two charts (i-adore.html, can-t-stop-singing.html), so
// making the gap explicit here — for both formats — stops the Word export
// depending on that source convention holding everywhere. Half-height (6pt,
// vs. a blank paragraph's ~12pt) rather than a full blank line, so the
// two-column layout doesn't lose a whole extra line's worth of space twice
// per boundary.
function sectionGapParagraph() {
    const { Paragraph } = window.docx;
    return new Paragraph({ children: [], spacing: { before: 0, after: 0, line: 120, lineRule: 'exact' } });
}
function isSectionHeaderLineDoc(line) {
    const m = line.match(/^\[(.+)\]$/);
    return !!m && matchSectionHeader(m[1]) !== null;
}
const MODE_LANGS_FOR_EXPORT = { en: ['en'], zh: ['zh'], 'en-zh': ['en', 'zh'], 'zh-en': ['zh', 'en'] };

// Word just needs a font *name* to attempt — it substitutes on the opening
// machine if that face isn't installed, so this doesn't need to embed
// anything, just pick a name that's actually script-correct rather than one
// generic guess for both scripts.
const CJK_FONT_BY_SCRIPT = { hans: 'Microsoft YaHei', hant: 'Microsoft JhengHei' };

function cjkFontForLangs(langs) {
    const zhTag = (langs || []).find(l => l.toLowerCase().startsWith('zh'));
    if (zhTag && zhTag.toLowerCase().includes('hans')) return CJK_FONT_BY_SCRIPT.hans;
    if (zhTag && zhTag.toLowerCase().includes('hant')) return CJK_FONT_BY_SCRIPT.hant;
    return 'SimSun';
}

function effectiveModeForSection(entry, sectionName) {
    return (entry.sectionOverrides && entry.sectionOverrides[sectionName]) || entry.langMode || 'en';
}

// Splices bold blue chord runs in at each pre-parsed token's offset —
// exactly chart-render.js's spliceChordSpans, but building TextRuns instead
// of <span> markup, from the same already-transposed tokens.
function buildV1ChordRuns(line) {
    const { TextRun } = window.docx;
    const runs = [];
    let lastIndex = 0;
    for (const token of line.tokens) {
        if (token.start > lastIndex) {
            runs.push(new TextRun({ text: line.text.slice(lastIndex, token.start), ...DOCX_RUN }));
        }
        runs.push(new TextRun({ text: token.value, bold: true, color: '0000FF', ...DOCX_RUN }));
        lastIndex = token.end;
    }
    if (lastIndex < line.text.length) {
        runs.push(new TextRun({ text: line.text.slice(lastIndex), ...DOCX_RUN }));
    }
    return runs;
}

function buildV1DocBody(chart) {
    const { Paragraph, TextRun } = window.docx;
    const paragraphs = [];
    const allLines = chart.sections.flatMap(s => s.groups.flatMap(g => g.lines));
    let sectionSeen = false;

    allLines.forEach((line, i) => {
        const trimmed = line.text.trim();
        if (!trimmed) {
            // The gap paragraph below now guarantees the space before a
            // header explicitly — skip a source blank line right ahead of
            // one so the two don't stack into a double-height gap.
            const next = allLines[i + 1];
            if (next && isSectionHeaderLineDoc(next.text.trim())) return;
            paragraphs.push(new Paragraph({ children: [] }));
        } else if (line.kind === 'chord') {
            paragraphs.push(new Paragraph({ children: buildV1ChordRuns(line), spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } }));
        } else if (isSectionHeaderLineDoc(trimmed)) {
            if (sectionSeen) paragraphs.push(sectionGapParagraph());
            sectionSeen = true;
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text: trimmed, bold: true, ...DOCX_RUN })],
                spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }
            }));
        } else {
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text: line.text, ...DOCX_RUN })],
                spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }
            }));
        }
    });
    return paragraphs;
}

// One section's worth of paragraphs at one explicit mode — the primary
// showing and a `repeats` showing both call this, the only difference being
// which mode they pass in and whether there's a performance note to print
// above the content (never below the header, so it reads as an instruction
// for this pass, not a lyric).
function buildSectionParagraphs(section, mode, cjkFont, note, includePinyin = false, gapBefore = true) {
    const { Paragraph, TextRun } = window.docx;
    const paragraphs = [];
    const spacingProps = { before: 0, after: 0, line: 240, lineRule: 'auto' };

    if (section.name) {
        if (gapBefore) paragraphs.push(sectionGapParagraph());
        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: `[${section.name}]`, bold: true, ...DOCX_RUN })],
            spacing: spacingProps
        }));
    }
    if (note) {
        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: note, italics: true, ...DOCX_RUN })],
            spacing: spacingProps
        }));
    }

    const wanted = MODE_LANGS_FOR_EXPORT[mode] || ['en'];

    for (const group of section.groups) {
        if (group.type === 'note') {
            // {chords: <section>} (BILINGUAL-SPEC.md §5.4) is data-only —
            // buildSongOrderTable already surfaces it as "*<section>" on
            // this section's Song Order row, in context; printed here too
            // it's just a bare "Verse 1" with nothing around it explaining
            // what it means. Every other note kind still prints as-is.
            if (group.kind !== 'chords') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: group.text, italics: true, ...DOCX_RUN })],
                    spacing: spacingProps
                }));
            }
            continue;
        }

        if (group.type === 'chordline') {
            const runs = [];
            group.tokens.forEach((t, i) => {
                if (i > 0) runs.push(new TextRun({ text: ' ', ...DOCX_RUN }));
                runs.push(t.type === 'chord'
                    ? new TextRun({ text: t.value, bold: true, color: '0000FF', ...DOCX_RUN })
                    : new TextRun({ text: t.value, ...DOCX_RUN }));
            });
            paragraphs.push(new Paragraph({ children: runs, spacing: spacingProps }));
            continue;
        }

        // group.type === 'lyric' — flatMap, not filter+map: a melisma
        // unit's chords is a multi-item array (BILINGUAL-SPEC.md §5.2),
        // and reading only unit.chords[0] here would silently drop the
        // rest of the cluster from the exported chord line.
        const chordSeq = (group.lines[0]?.units || []).flatMap(u => u.chords);
        if (chordSeq.length > 0) {
            const runs = [];
            chordSeq.forEach((chord, i) => {
                if (i > 0) runs.push(new TextRun({ text: '    ', ...DOCX_RUN }));
                runs.push(new TextRun({ text: chord, bold: true, color: '0000FF', ...DOCX_RUN }));
            });
            paragraphs.push(new Paragraph({ children: runs, spacing: spacingProps }));
        }

        for (const shortLang of wanted) {
            const line = group.lines.find(l => l.lang.toLowerCase().startsWith(shortLang));
            if (!line) continue;

            // Chord row, then pinyin row, then characters — pinyin only
            // exists for a zh-* line (BILINGUAL-SPEC.md §5.6), so this
            // never fires for the en row, and a section rendering in
            // en-only mode never reaches this branch at all (shortLang
            // never equals 'zh' when wanted = ['en']) — no extra gating
            // needed for either case.
            if (includePinyin && shortLang === 'zh' && line.pinyin) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: line.pinyin, ...PINYIN_RUN })],
                    spacing: spacingProps
                }));
            }

            const text = line.units.map(u => u.text).join('');
            const font = shortLang === 'zh' ? cjkFont : DOCX_RUN.font;
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text, font, size: DOCX_RUN.size })],
                spacing: spacingProps
            }));
        }
    }
    return paragraphs;
}

// Chosen layout (see the plan): one shared chord-sequence line per group —
// the chord *sequence* is validator-guaranteed identical across a group's
// language lines (BILINGUAL-SPEC.md §5.2), so reading it off the first line
// is never lossy — followed by each language actually selected by the
// entry's effective mode for that section, in its own font.
//
// A `repeats` entry (BILINGUAL-SPEC.md §6.3) prints the same section again,
// right after whichever section its `after` names — same splice-not-fork
// shape as chart-render.js's renderV2, so screen and print can't disagree
// about where a repeat lands. One naming a section this chart doesn't have
// (or with no `after` at all) prints at the very end rather than being
// silently dropped.
function buildV2DocBody(chart, entry, cjkFont, includePinyin = false) {
    const paragraphs = [];
    const byName = new Map(chart.sections.filter(s => s.name).map(s => [s.name, s]));
    const repeats = (entry.repeats || []).filter(r => byName.has(r.section));

    chart.sections.forEach((section, i) => {
        paragraphs.push(...buildSectionParagraphs(section, effectiveModeForSection(entry, section.name), cjkFont, undefined, includePinyin, i > 0));

        if (section.name) {
            for (const r of repeats.filter(r => r.after === section.name)) {
                paragraphs.push(...buildSectionParagraphs(byName.get(r.section), r.mode, cjkFont, r.note, includePinyin));
            }
        }
    });

    for (const r of repeats.filter(r => !r.after || !byName.has(r.after))) {
        paragraphs.push(...buildSectionParagraphs(byName.get(r.section), r.mode, cjkFont, r.note, includePinyin));
    }

    return paragraphs;
}

// Item 4: a Song Order table at the top of each bilingual song — section
// name (+ any {note:} annotations from the chart) and the effective
// language for that section, matching the two-column, header-row layout
// reverse-engineered from a real service pack (tools/docx-to-chart.mjs).
//
// A `repeats` entry gets its own row, right after the section it's an
// `after` of — same splice position as buildV2DocBody, so the table at the
// top of the doc matches the body underneath it. Its own note (if any)
// folds into the same "*note" convention already used for a chart's own
// {note:} annotations, rather than inventing a second notation for it.
function buildSongOrderTable(chart, entry) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType } = window.docx;
    const namedSections = chart.sections.filter(s => s.name);
    if (namedSections.length === 0) return null;

    const cellText = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...DOCX_RUN, ...opts })] });

    const headerRow = new TableRow({
        children: [new TableCell({ columnSpan: 2, children: [cellText('Song Order:', { bold: true })] })]
    });

    const byName = new Map(namedSections.map(s => [s.name, s]));
    const repeats = (entry.repeats || []).filter(r => byName.has(r.section));

    const rowFor = (section, mode, note) => {
        const chartNotes = section.groups.filter(g => g.type === 'note').map(g => g.text);
        const allNotes = note ? [...chartNotes, note] : chartNotes;
        const label = allNotes.length ? `${section.name} *${allNotes.join('; ')}` : section.name;
        return new TableRow({
            children: [
                new TableCell({ children: [cellText(label, { bold: true })] }),
                new TableCell({ children: [cellText(mode.toUpperCase())] })
            ]
        });
    };

    const rows = [];
    for (const section of namedSections) {
        rows.push(rowFor(section, effectiveModeForSection(entry, section.name)));
        for (const r of repeats.filter(r => r.after === section.name)) {
            rows.push(rowFor(byName.get(r.section), r.mode, r.note));
        }
    }
    for (const r of repeats.filter(r => !r.after || !byName.has(r.after))) {
        rows.push(rowFor(byName.get(r.section), r.mode, r.note));
    }

    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

window.generateDoc = async () => {
    if (selectedSongs.length === 0) return;

    // Show loading state
    const btn = document.querySelector('.generate-page .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = 'Generating...';
    btn.disabled = true;

    try {
        if (!window.docx) {
            throw new Error("docx library not loaded. Please check your internet connection.");
        }

        const { Document, Packer, Paragraph, TextRun } = window.docx;
        const children = [];

        for (const entry of selectedSongs) {
            const song = songsData.find(s => s.title === entry.title);
            if (!song) continue;

            await fetchSongContent(song);

            const originalKeyIndex = song.originalKeyIndex !== undefined ? song.originalKeyIndex : 0;
            const semitones = entry.keyIndex - originalKeyIndex;
            const transposedChart = transposeChart(song.chart, semitones);
            const isBilingual = transposedChart.meta.format === 'v2';

            // Song Title (+ plan label, when this is a duplicate entry for a
            // different service slot)
            const titleText = entry.planLabel ? `${entry.title} (${entry.planLabel})` : entry.title;
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: `${titleText} [${keyDisplay(transposedChart)}]`.toUpperCase(),
                        bold: true,
                        ...DOCX_RUN
                    })
                ],
                spacing: { before: 0, after: 0, line: 240, lineRule: "auto" },
                keepNext: true
            }));

            if (isBilingual) {
                const table = buildSongOrderTable(transposedChart, entry);
                if (table) children.push(table);
                children.push(...buildV2DocBody(transposedChart, entry, cjkFontForLangs(transposedChart.meta.langs), includePinyin));
            } else {
                children.push(...buildV1DocBody(transposedChart));
            }

            children.push(new Paragraph({ children: [] }));
        }

        if (children.length === 0) {
            return;
        }

        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: { font: "Courier New", size: 24 },
                        paragraph: {
                            spacing: { before: 0, after: 0, line: 240, lineRule: "auto" }
                        }
                    }
                }
            },
            sections: [{
                properties: {
                    column: {
                        count: 2,
                        space: 708, // ~0.5 inch
                    },
                    page: {
                        margin: {
                            top: 720, // 0.5 inch
                            right: 720,
                            bottom: 720,
                            left: 720
                        }
                    }
                },
                children: children
            }]
        });

        const blob = await Packer.toBlob(doc);
        const newBlob = new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

        // Manual download fallback to ensure filename is respected
        const url = window.URL.createObjectURL(newBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Setlist.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Error generating doc:", error);
        alert(`Error generating document: ${error.message}`);
    } finally {
        // Reset button
        btn.innerText = originalText;
        btn.disabled = false;
    }
};


function renderAbout() {
    mainContent.innerHTML = `
        <section class="about-page">
            <h1 style="text-align: center; margin-bottom: 2rem;">About GEAR</h1>

            <div class="about-container">
                <!-- About Site Card -->
                <div class="about-card">
                    <h2>The Project</h2>
                    <p>My name is <strong>Ryan</strong>. This site is developed by me as a personal project for the praise ministry of <strong>Church Of the True Light (COTL)</strong>, where I currently serve.</p>
                    <p>The purpose of this site is to host our repertoire of praise songs.</p>

                    <div class="alert-box">
                        <strong>Note:</strong> All songs hosted on this site do not belong to me. They are the copyrighted properties of their owner(s).
                    </div>

                    <h3>Developer's Comment</h3>
                    <p>This site is developed using only client-side technologies (HTML5, JavaScript, and CSS).</p>
                    <p>If you are a web developer and would like to participate in this project, or if you find errors in a chord chart, feel free to contact me at <a href="mailto:rock2706@hotmail.com">rock2706@hotmail.com</a>.</p>
                </div>

                <!-- COTL Card -->
                <div class="about-card">
                    <h2>Church Of the True Light</h2>
                    <p>
                        25G Perak Road<br>
                        Singapore 208142
                    </p>
                    <p>
                        <strong>Phone:</strong> +65 6294 0797<br>
                        <strong>Email:</strong> <a href="mailto:mail@truelight.org.sg">mail@truelight.org.sg</a><br>
                        <strong>Website:</strong> <a href="https://www.truelight.org.sg/" target="_blank">www.truelight.org.sg</a>
                    </p>

                    <div style="margin-top: 1.5rem; text-align: center;">
                        <a href="https://www.truelight.org.sg/service-timings/" target="_blank" class="btn btn-secondary" style="margin-bottom: 1rem;">View Service Timings</a>
                    </div>

                    <!-- Google Map -->
                    <div style="width: 100%; height: 300px; border-radius: 0.5rem; overflow: hidden; border: 1px solid var(--border-color);">
                        <iframe width="100%" height="100%" src="https://maps.google.com/maps?q=Church+Of+the+True+Light+Singapore&t=&z=15&ie=UTF8&iwloc=&output=embed" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"></iframe>
                    </div>
                </div>

                <!-- Acknowledgements Card -->
                <div class="about-card full-width">
                    <h3>Acknowledgements</h3>
                    <ul class="credit-list">
                        <li>Transposition logic inspired by <strong>jQuery Chord Transpose Plugin</strong> by Jesse Gavin.</li>
                        <li><strong>docx</strong> library for document generation.</li>
                        <li><strong>Note:</strong> This modern version (GEAR 3) uses Vanilla JS and custom CSS, moving away from Bootstrap/jQuery dependencies of the original.</li>
                        <li>Gear icon designed by <strong>Freepik</strong>.</li>
                    </ul>
                </div>
            </div>
        </section>
    `;
}

function renderNotFound() {
    mainContent.innerHTML = `
        <section class="error-page">
            <h1>404</h1>
            <p>Page not found.</p>
            <a href="#/" class="btn btn-primary">Go Home</a>
        </section>
    `;
}

window.addEventListener('hashchange', handleNavigation);
window.addEventListener('load', handleNavigation);

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
    const input = document.getElementById('add-song-input');
    const suggestionsList = document.getElementById('add-song-suggestions');
    if (input && suggestionsList && !input.contains(e.target) && !suggestionsList.contains(e.target)) {
        suggestionsList.classList.add('hidden');
    }
});

// Init on load
window.addEventListener('DOMContentLoaded', initChordTooltip);
// Also call now in case DOM is already ready (if script injected late)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initChordTooltip();
}
