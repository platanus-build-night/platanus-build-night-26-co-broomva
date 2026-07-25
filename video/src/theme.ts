/**
 * Keel — video theme.
 *
 * MIRROR, NOT SOURCE. The canonical tokens live in `site/tokens.css` (which is
 * itself a byte-identical copy of `skills/keel/design/tokens.css`, enforced by
 * `make design-audit`). Remotion renders in a bundled React tree with no
 * stylesheet pipeline, so the values are restated here as literals.
 *
 * Every value below is copied verbatim from tokens.css. If a token changes
 * there, change it here. Nothing in this file is invented.
 */

export const k = {
  // ═══ CANVAS ═══════════════════════════════════════════════════════════════
  bg0: '#07090c',
  bg1: '#0c1015',
  bg2: '#11161d',
  bg3: '#171d26',

  line: '#1b2027',
  lineStrong: '#2a323c',

  // ═══ INK ══════════════════════════════════════════════════════════════════
  ink0: '#e8edf2',
  ink1: '#b6c0cb',
  ink2: '#8b97a5',
  ink3: '#5b6774', // NON-TEXT ONLY — borders, rules, disabled glyphs

  // ═══ KEEL'S OWN VOICE ═════════════════════════════════════════════════════
  // The narrator hue. Never encodes a verdict. Never decorated with a verdict.
  accent: '#7dd3fc',
  accentHover: '#b6e6ff',
  accentLine: 'rgba(125, 211, 252, 0.30)',
  accentWash: 'rgba(125, 211, 252, 0.10)',

  // ═══ VERDICTS ═════════════════════════════════════════════════════════════
  anchored: '#4ade80',
  selfReferential: '#f87171',
  unknown: '#fbbf24',
  notACheck: '#94a3b8',

  anchoredWash: 'rgba(74, 222, 128, 0.10)',
  selfReferentialWash: 'rgba(248, 113, 113, 0.10)',
  unknownWash: 'rgba(251, 191, 36, 0.10)',
  notACheckWash: 'rgba(148, 163, 184, 0.08)',
} as const;

// ═══ TYPE ═══════════════════════════════════════════════════════════════════
// NO WEBFONTS. Invariant, not preference. System stacks only.
//
// MONO IS QUOTED FROM THE WORLD, SANS IS KEEL TALKING.
// Node names, file paths, commands, exit codes, class names → mono.
// Prose, headings, arguments, annotations → sans.
export const font = {
  sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Mono", Consolas, monospace',
} as const;

export const track = {
  ratio: '-0.045em',
  display: '-0.022em',
  tight: '-0.01em',
  normal: '0',
  eyebrow: '0.18em',
  brand: '0.22em',
} as const;

export const fw = {
  regular: 400,
  medium: 500,
  semibold: 600, // there is no 700 — heavy strokes bloom on a near-black canvas
} as const;

export const lh = {
  ratio: 0.9,
  tight: 1.18,
  snug: 1.35,
  body: 1.65,
} as const;

// ═══ RADIUS ═════════════════════════════════════════════════════════════════
export const radius = {
  xs: 3,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 999,
} as const;

// ═══ VIDEO GEOMETRY ═════════════════════════════════════════════════════════
// The video is 1920×1080, ~2.6× the 760px reading measure the tokens assume,
// so type sizes are scaled from the token ramp rather than used raw. The ramp's
// RATIOS are preserved; only the base changes.
export const SCALE = 2.6;
export const fs = {
  ratio: 168, // --k-fs-ratio ceiling, scaled for a 1080p frame
  display: 62, // --k-fs-display
  h1: 44, // --k-fs-h1
  h2: 34, // --k-fs-h2
  h3: 28, // --k-fs-h3
  lede: 30, // --k-fs-lede
  body: 24, // --k-fs-body
  ui: 22, // --k-fs-ui
  sm: 20, // --k-fs-sm
  xs: 18, // --k-fs-xs
  micro: 15, // --k-fs-micro — eyebrows, table headers
} as const;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  s20: 80,
  s24: 96,
} as const;

// ═══ VERDICT LOOKUP ═════════════════════════════════════════════════════════
export type GroundingClass =
  | 'anchored'
  | 'self_referential'
  | 'unknown'
  | 'not_a_check';

export const verdict: Record<
  GroundingClass,
  { color: string; wash: string; border: string; dashed: boolean }
> = {
  anchored: {
    color: k.anchored,
    wash: k.anchoredWash,
    border: k.anchored,
    dashed: false,
  },
  self_referential: {
    color: k.selfReferential,
    wash: k.selfReferentialWash,
    border: k.selfReferential,
    dashed: false,
  },
  unknown: {
    color: k.unknown,
    wash: k.unknownWash,
    border: k.unknown,
    dashed: false,
  },
  // Deliberately the least attractive treatment in the system: inert slate and
  // a DASHED border. `not_a_check` is the one shoppable class — it must never
  // look like a place you want your nodes to land.
  not_a_check: {
    color: k.notACheck,
    wash: k.notACheckWash,
    border: k.ink3,
    dashed: true,
  },
};

// ═══ MOTION ═════════════════════════════════════════════════════════════════
// Fast and flat. Instruments settle; they do not perform. No overshoot, no
// bounce. The token ceiling is 200ms; at 30fps that is 6 frames, which reads as
// a cut on video, so scene-level transitions use a longer but still un-eased-out
// settle. Element-level state changes stay inside the token budget.
export const EASE_TOKEN = [0.2, 0, 0.38, 1] as const;
export const FPS = 30;
