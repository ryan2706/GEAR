// tools/lib/chart-file.mjs
//
// Regex-based <pre class="chord-chart">...</pre> extraction, shared by
// tools/validate-charts.mjs and tools/build-index.mjs. A full parser is
// unneeded here — every chart file is exactly one such element, so pulling
// out its attributes and text is a small, well-scoped regex job, not a DOM
// problem. (js/chart-parser.js's parseChartBody() does the actual grammar
// parsing, from the .body this returns — this module never interprets
// chart content, only locates it.)

const PRE_OPEN_RE = /<pre\s+class="chord-chart"([^>]*)>/s;

function extractAttr(attrStr, name) {
    const m = attrStr.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : undefined;
}

// Returns null if no well-formed <pre class="chord-chart">...</pre> wrapper
// is found. Otherwise: the four data-* attributes, the raw body text, the
// 1-based line number the body's first character falls on (counted against
// the *whole file*, since attributes may span several lines), and the raw
// byte offsets (openEnd/closeIdx) a caller needs to splice a *new* body
// back into the original file without disturbing anything outside it.
export function extractPre(content) {
    const openMatch = content.match(PRE_OPEN_RE);
    if (!openMatch) return null;

    const openEnd = openMatch.index + openMatch[0].length;
    const closeIdx = content.lastIndexOf('</pre>');
    if (closeIdx === -1 || closeIdx < openEnd) return null;

    const attrStr = openMatch[1];
    return {
        format: extractAttr(attrStr, 'data-format'),
        key: extractAttr(attrStr, 'data-key'),
        langs: extractAttr(attrStr, 'data-langs'),
        primary: extractAttr(attrStr, 'data-primary'),
        body: content.slice(openEnd, closeIdx),
        bodyStartLine: content.slice(0, openEnd).split('\n').length,
        openEnd,
        closeIdx
    };
}
