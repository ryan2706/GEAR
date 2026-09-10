// Section-header vocabulary shared by the v1 header regex (app.js), the v2
// chart parser (chart-parser.js), the v1 renderer (chart-render.js), and
// the validator (tools/validate-charts.mjs) — one list, four consumers, so
// they can't drift apart (BILINGUAL-SPEC.md §5.1).
export const SECTION_HEADERS = [
    'Intro',
    'Verse',
    'Pre-Chorus',
    'Chorus',
    'Bridge',
    'Interlude',
    'Tag',
    'Instrumental',
    'Ending',
    'Coda',
    'Outro',
    'Turnaround',
    'End',
    'Final Chorus',
    'Echo',
    'High Praise',
    'Build-up'
];

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One regex per canonical header, matching case- and separator-insensitively:
// "Pre-Chorus", "pre chorus", "PRE_CHORUS", and "Prechorus" all match the
// same "Pre-Chorus" entry. The lookahead blocks a real word extending past
// the header ("Chorusish") while still allowing a directly-touching number
// ("Verse1") or a separated free-text suffix ("Bridge tag", "Chorus 2") —
// both already appear across the existing 312-chart corpus.
const HEADER_PATTERNS = [...SECTION_HEADERS]
    .sort((a, b) => b.length - a.length)
    .map(canon => ({
        canon,
        re: new RegExp('^' + canon.split(/[-\s]+/).map(escapeRegExp).join('[-_\\s]*') + '(?![a-zA-Z])', 'i')
    }));

// Matches a bracket line's trimmed inner text (no [ ]) against the section
// vocabulary above. Returns the canonical display form — e.g. "high-praise"
// and "HIGH_PRAISE" both come back as "High Praise", "Verse1" comes back as
// "Verse 1" — or null if it isn't a recognized section header at all.
export function matchSectionHeader(raw) {
    const trimmed = raw.trim();
    for (const { canon, re } of HEADER_PATTERNS) {
        const m = trimmed.match(re);
        if (m) {
            const rest = trimmed.slice(m[0].length).trim();
            return rest ? `${canon} ${rest}` : canon;
        }
    }
    return null;
}

// Shared with tools/docx-to-chart.mjs (which names its output chart/sidecar
// files this way) so the browser can derive the *same* slug from a song's
// title at runtime — e.g. to fetch data/setlists/<slug>.json — without the
// two ever drifting apart the way two independent copies eventually would.
export function slugify(title) {
    return title
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
