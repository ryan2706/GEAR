# GEAR Design System — Modern Minimalist Chord Library

Extracted from Stitch project "GEAR revamp" (`projects/11932094518321272930`).  
Design system asset: `assets/a61cf05174cf4bb8822094b324281338`

## Brand & Style

**Editorial Minimalism.** Designed for musicians who value focus, clarity, and a premium aesthetic. Brand personality: intellectual, serene, authoritative — evoking the feeling of a high-end physical music manuscript or a curated gallery.

The visual direction avoids unnecessary ornamentation, allowing the mathematical beauty of music theory to take centre stage. Expansive whitespace and a restrained colour palette create a "quiet" environment that reduces cognitive load during practice or composition.

Style: **Minimalist** with **Editorial** influence. Soft charcoal typography on a warm off-white canvas.

---

## Colours

### Core Palette (Light Mode)

| Token | Value | Usage |
|---|---|---|
| `background` | `#faf9f7` | Page background — warm off-white, mimics archival paper |
| `surface` | `#faf9f7` | Base surface |
| `surface-dim` | `#dadad8` | Dimmed/disabled surface |
| `surface-bright` | `#faf9f7` | Bright surface |
| `surface-container-lowest` | `#ffffff` | White — interactive cards, chord cards (tonal lift) |
| `surface-container-low` | `#f4f3f1` | Low container |
| `surface-container` | `#efeeec` | Standard container |
| `surface-container-high` | `#e9e8e6` | Elevated container |
| `surface-container-highest` | `#e3e2e0` | Highest container / surface-variant |
| `on-surface` | `#1a1c1b` | Primary text |
| `on-surface-variant` | `#45474b` | Secondary / muted text |
| `inverse-surface` | `#2f3130` | Inverse surface (dark tooltips) |
| `inverse-on-surface` | `#f1f1ef` | Text on inverse surface |
| `outline` | `#75777c` | Subtle borders |
| `outline-variant` | `#c5c6cb` | Dividers, input borders |
| `surface-tint` | `#585f6a` | Tint overlay |

### Primary — Soft Charcoal
Maximum legibility; headers, primary actions, chord diagrams.

| Token | Value |
|---|---|
| `primary` | `#171e27` |
| `on-primary` | `#ffffff` |
| `primary-container` | `#2c333d` |
| `on-primary-container` | `#949ba7` |
| `inverse-primary` | `#c0c7d4` |
| `primary-fixed` | `#dce3f0` |
| `primary-fixed-dim` | `#c0c7d4` |
| `on-primary-fixed` | `#151c25` |
| `on-primary-fixed-variant` | `#404752` |

### Secondary — Steel Blue-Grey
Secondary metadata, icons, supporting UI.

| Token | Value |
|---|---|
| `secondary` | `#54606d` |
| `on-secondary` | `#ffffff` |
| `secondary-container` | `#d7e4f4` |
| `on-secondary-container` | `#5a6673` |
| `secondary-fixed` | `#d7e4f4` |
| `secondary-fixed-dim` | `#bbc8d8` |

### Tertiary — Muted Taupe
Subtle decorative elements, inactive states.

| Token | Value |
|---|---|
| `tertiary` | `#221d13` |
| `on-tertiary` | `#ffffff` |
| `tertiary-container` | `#373227` |
| `on-tertiary-container` | `#a29a8c` |
| `tertiary-fixed` | `#ece1d2` |
| `tertiary-fixed-dim` | `#cfc5b6` |

### Error

| Token | Value |
|---|---|
| `error` | `#ba1a1a` |
| `on-error` | `#ffffff` |
| `error-container` | `#ffdad6` |
| `on-error-container` | `#93000a` |

### Brand-Level Overrides

| Token | Value |
|---|---|
| Primary | `#2C333D` |
| Secondary | `#606C7A` |
| Tertiary | `#A89F91` |
| Neutral (background) | `#F9F8F6` |

---

## Typography

Dual-font strategy: **Noto Serif** for headlines (history, musicality, elegant terminals) and **Manrope** for body + labels (geometric, approachable, legible at small sizes).

Use `label-caps` for metadata labels like "Key", "Tempo", "Difficulty". Maintain generous line heights (1.6) for body copy.

| Token | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| `display-lg` | Noto Serif | 48px | 700 | 1.1 | -0.02em |
| `headline-md` | Noto Serif | 32px | 600 | 1.2 | -0.01em |
| `headline-sm` | Noto Serif | 24px | 500 | 1.3 | — |
| `body-lg` | Manrope | 18px | 400 | 1.6 | — |
| `body-md` | Manrope | 16px | 400 | 1.6 | — |
| `label-caps` | Manrope | 12px | 700 | 1.0 | 0.1em |

### Monospace (chord charts)

| Token | Font stack | Usage |
|---|---|---|
| `--font-mono` | `'Courier New', Courier, monospace` | v1 chord charts (`<pre>`) |
| `--font-mono-cjk` | `'Noto Sans SC', 'Noto Sans TC', 'PingFang SC', 'Microsoft YaHei', sans-serif` | Mandarin lyric lines in v2 bilingual charts (`.lyric-line[lang^="zh"]`) — no CJK monospace metric is assumed, so this is sans-serif rather than a true fixed-width face |

---

## Spacing

8px base unit. Content-focused grid with generous margins.

| Token | Value |
|---|---|
| `unit` | `8px` |
| `container-max` | `1120px` |
| `gutter` | `32px` (2rem) |
| `margin-page` | `64px` (4rem) |
| `stack-sm` | `8px` (0.5rem) |
| `stack-md` | `16px` (1rem) |
| `stack-lg` | `40px` (2.5rem) |
| `section-gap` | `80px` (5rem) |

---

## Border Radius

Soft shape language. Slight rounding feels tactile and organic without losing precision.

| Token | Value |
|---|---|
| `rounded-sm` | `0.125rem` (2px) |
| `rounded` (default) | `0.25rem` (4px) |
| `rounded-md` | `0.375rem` (6px) |
| `rounded-lg` | `0.5rem` (8px) |
| `rounded-xl` | `0.75rem` (12px) |
| `rounded-full` | `9999px` |

---

## Elevation & Depth

**Ambient shadows** with tonal layering. Single, highly diffused shadow (24–32px blur, 4–6% opacity) tinted with the Primary colour.

White cards (`surface-container-lowest: #ffffff`) on an off-white background (`#faf9f7`) create a "lift" through colour contrast alone.

| Level | Background | Description |
|---|---|---|
| 0 — Page | `#faf9f7` | Warm off-white canvas |
| 1 — Cards | `#ffffff` | White interactive surfaces |
| 2 — Containers | `#efeeec` | Standard containers, panels |
| Dividers | 1px `#c5c6cb` | Thin horizontal rules |

Shadow: `0 8px 32px rgba(44, 51, 61, 0.05), 0 2px 8px rgba(44, 51, 61, 0.04)`

---

## Components

### Buttons
- **Primary:** Solid charcoal (`#2c333d`) fill, white text, `border-radius: 0.25rem`
- **Secondary/Ghost:** 1px `#2c333d` border, charcoal text, transparent background
- No heavy gradients or high-contrast glows

### Chord Cards
- White background (`#ffffff`) + ambient shadow
- High-contrast charcoal fretboard lines
- `label-caps` above the card

### Song List Rows
- Generous vertical padding (24px per row minimum)
- Thin 1px `#c5c6cb` dividers
- Hover: subtle left accent bar in charcoal

### Inputs
- Bottom-border only, or full `#c5c6cb` border
- Focus: border shifts to `primary-container` (`#2c333d`)

### Transposition Controls
- Segmented, minimal; each segment separated by 1px vertical rule
- Follow Soft shape language

### Chips / Tags
- Light taupe background, no border, small Manrope `label-caps`

### Section Headers
- Manrope 12px / 700 / 0.1em letter-spacing / uppercase

---

## Screens in Project

| Screen | ID | Type |
|---|---|---|
| Dashboard — Modern Minimalist | `38e565c45173455ba0e5aeb66dbed2db` | HTML |
| Song Library — Modern Minimalist | `de75ba02a98f4e06a9ece5795db2ca24` | HTML |
| Song Detail — Modern Minimalist | `55e64704546c43888907c32caa38eba0` | HTML |
| Setlist Builder — Modern Minimalist | `184e50e76df54aed8f3d5edcd69a947e` | HTML |
