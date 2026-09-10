// Chord-name math shared by the v1 transposer (app.js) and the v2 chart
// renderer (chart-renderer.js) — single implementation, not two copies.

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Conventional key signatures use one accidental or the other, never a mix —
// flat keys spell their chords with flats, everything else (including C,
// which has neither) defaults to the sharp spelling below (BILINGUAL-SPEC.md §6.4).
export const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

// Chromatic indices (0-11 from C) of the flat keys, derived from NOTES_FLAT
// so this stays canonical with the app's existing key-pill display, which
// only ever labels index 6 as "Gb" (never "F#" — the two share an index).
const FLAT_KEY_INDICES = new Set(FLAT_KEYS.map(name => NOTES_FLAT.indexOf(name)));

function keyPrefersFlats(targetKeyIndex) {
    return FLAT_KEY_INDICES.has(targetKeyIndex);
}

// targetKeyIndex is optional; omitting it preserves the old sharps-only
// behavior for any caller that hasn't been updated to pass one.
export function transposeNote(note, semitones, targetKeyIndex) {
    let index = NOTES.indexOf(note);
    if (index === -1) {
        index = NOTES_FLAT.indexOf(note);
    }
    if (index === -1) return note; // Not a note

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    const useFlats = targetKeyIndex !== undefined && keyPrefersFlats(targetKeyIndex);
    return useFlats ? NOTES_FLAT[newIndex] : NOTES[newIndex];
}
