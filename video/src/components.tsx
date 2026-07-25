import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {
  k,
  font,
  fs,
  fw,
  lh,
  track,
  radius,
  space,
  verdict,
  type GroundingClass,
} from './theme';

/* ════════════════════════════════════════════════════════════════════════════
   MOTION HELPERS
   Fast and flat. The token easing is cubic-bezier(0.2, 0, 0.38, 1) with no
   overshoot and nothing above 200ms. Element entrances here run 10–14 frames
   (330–470ms) — longer than the token ceiling because a 6-frame change reads
   as a cut on video rather than as a settle — but the CURVE is the token curve,
   so nothing bounces and nothing performs.
   ══════════════════════════════════════════════════════════════════════════ */

const TOKEN_EASE = Easing.bezier(0.2, 0, 0.38, 1);

export const enterAt = (frame: number, delay: number, dur = 12): number =>
  interpolate(frame, [delay, delay + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: TOKEN_EASE,
  });

/** Opacity + a short upward settle. No scale, no overshoot. */
export const Rise: React.FC<{
  delay: number;
  dur?: number;
  y?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({delay, dur = 12, y = 10, style, children}) => {
  const frame = useCurrentFrame();
  const t = enterAt(frame, delay, dur);
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   TYPE PRIMITIVES

   MONO IS QUOTED FROM THE WORLD, SANS IS KEEL TALKING.
   `Mono` is for anything Keel did not write: node names, file paths, commands,
   exit codes, class names. `Sans` is for anything Keel did: prose, headings,
   arguments, annotations.
   ══════════════════════════════════════════════════════════════════════════ */

export const Mono: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}> = ({children, size = fs.ui, color = k.ink0, weight = fw.regular, style}) => (
  <span
    style={{
      fontFamily: font.mono,
      fontSize: size,
      color,
      fontWeight: weight,
      letterSpacing: track.normal,
      ...style,
    }}
  >
    {children}
  </span>
);

export const Sans: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}> = ({children, size = fs.body, color = k.ink1, weight = fw.regular, style}) => (
  <span
    style={{
      fontFamily: font.sans,
      fontSize: size,
      color,
      fontWeight: weight,
      lineHeight: lh.snug,
      letterSpacing: track.tight,
      ...style,
    }}
  >
    {children}
  </span>
);

/** Uppercase section label. Accent — this is Keel labelling its own surface. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}> = ({children, color = k.accent, style}) => (
  <div
    style={{
      fontFamily: font.sans,
      fontSize: fs.micro,
      fontWeight: fw.medium,
      letterSpacing: track.eyebrow,
      textTransform: 'uppercase',
      color,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   SURFACES
   Elevation is a background step plus a hairline. Never a shadow — on a
   #07090c canvas a shadow is a smudge.
   ══════════════════════════════════════════════════════════════════════════ */

export const Panel: React.FC<{
  children: React.ReactNode;
  bg?: string;
  border?: string;
  dashed?: boolean;
  style?: React.CSSProperties;
}> = ({children, bg = k.bg1, border = k.line, dashed = false, style}) => (
  <div
    style={{
      background: bg,
      border: `1px ${dashed ? 'dashed' : 'solid'} ${border}`,
      borderRadius: radius.lg,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   GRAPH MARKS
   SQUARES, not circles. A circle in a verification UI reads as a status dot,
   and a status dot is exactly the unaccountable green light Keel exists to
   criticize. A square reads as a cell in a ledger.
   ══════════════════════════════════════════════════════════════════════════ */

export const Mark: React.FC<{
  color: string;
  size?: number;
  dashed?: boolean;
  hollow?: boolean;
  style?: React.CSSProperties;
}> = ({color, size = 20, dashed = false, hollow = false, style}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Math.max(2, Math.round(size * 0.2)),
      background: hollow ? 'transparent' : color,
      border: hollow || dashed ? `1.5px ${dashed ? 'dashed' : 'solid'} ${color}` : 'none',
      flex: 'none',
      ...style,
    }}
  />
);

/** A class chip. Pill radius — tokens reserve it for tags and class chips. */
export const ClassChip: React.FC<{
  cls: GroundingClass;
  size?: number;
  style?: React.CSSProperties;
}> = ({cls, size = fs.xs, style}) => {
  const v = verdict[cls];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space.s2,
        padding: `${space.s1 + 2}px ${space.s3}px`,
        borderRadius: radius.pill,
        background: v.wash,
        border: `1px ${v.dashed ? 'dashed' : 'solid'} ${v.border}`,
        color: v.color,
        fontFamily: font.mono, // a class name is quoted from the schema
        fontSize: size,
        letterSpacing: track.normal,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {cls}
    </span>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   INTEGRITY CHIP
   This is a pitch about ungrounded claims, so any figure on screen that was
   not measured says so, in the narrator's hue, at a size you cannot miss.
   The accent is used here precisely BECAUSE it never encodes a verdict: this
   chip is Keel annotating its own diagram, not Keel scoring something.
   ══════════════════════════════════════════════════════════════════════════ */

export const IllustrativeChip: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({children = 'illustrative — shape only, not measured data', style}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: space.s3,
      padding: `${space.s2}px ${space.s4}px`,
      borderRadius: radius.sm,
      background: k.accentWash,
      border: `1px dashed ${k.accent}`,
      color: k.accent,
      fontFamily: font.sans,
      fontSize: fs.sm,
      fontWeight: fw.medium,
      letterSpacing: track.tight,
      ...style,
    }}
  >
    {children}
  </span>
);

export const MeasuredChip: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({children = 'measured', style}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: space.s2,
      padding: `${space.s2}px ${space.s4}px`,
      borderRadius: radius.sm,
      background: 'transparent',
      border: `1px solid ${k.lineStrong}`,
      color: k.ink2,
      fontFamily: font.sans,
      fontSize: fs.sm,
      fontWeight: fw.medium,
      letterSpacing: track.eyebrow,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </span>
);

/* ════════════════════════════════════════════════════════════════════════════
   TYPE-ON
   ══════════════════════════════════════════════════════════════════════════ */

export const TypeOn: React.FC<{
  text: string;
  start: number;
  cps?: number; // characters per second
  style?: React.CSSProperties;
  caret?: boolean;
  caretColor?: string;
}> = ({text, start, cps = 34, style, caret = true, caretColor = k.accent}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - start);
  const shown = Math.min(text.length, Math.floor((elapsed / 30) * cps));
  const done = shown >= text.length;
  // The caret blinks only while typing is in flight, then rests solid for a
  // beat and disappears. Nothing here loops forever — instruments settle.
  const blink = done ? (frame % 30 < 15 ? 1 : 0.25) : 1;
  return (
    <span style={style}>
      {text.slice(0, shown)}
      {caret && shown > 0 ? (
        <span
          style={{
            display: 'inline-block',
            width: '0.5em',
            height: '0.92em',
            marginLeft: '0.08em',
            transform: 'translateY(0.08em)',
            background: caretColor,
            opacity: blink,
          }}
        />
      ) : null}
    </span>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   THE KEEL MARK
   A block of ledger cells — the verification surface — and one cell outside it.
   Same size, same shape, same grid. Only its position differs, and position is
   the whole argument. Geometry copied from skills/keel/design/mark.svg.
   ══════════════════════════════════════════════════════════════════════════ */

export const KeelMark: React.FC<{
  width?: number;
  /** 0 → block only, 1 → the outsider has landed. */
  outsider?: number;
  blockReveal?: number;
  style?: React.CSSProperties;
}> = ({width = 200, outsider = 1, blockReveal = 1, style}) => {
  const cells = [0, 23, 46].flatMap((y) => [0, 23, 46].map((x) => ({x, y})));
  return (
    <svg
      viewBox="0 0 100 64"
      width={width}
      height={(width * 64) / 100}
      style={style}
      role="img"
      aria-label="Keel"
    >
      {cells.map((c, i) => {
        const t = interpolate(blockReveal, [i / cells.length, (i + 1) / cells.length], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <rect
            key={`${c.x}-${c.y}`}
            x={c.x}
            y={c.y}
            width={18}
            height={18}
            rx={3}
            fill={k.ink0}
            opacity={t}
          />
        );
      })}
      {/* The empty slot the outsider passes through is left empty on purpose. */}
      <rect
        x={interpolate(outsider, [0, 1], [64, 82])}
        y={23}
        width={18}
        height={18}
        rx={3}
        fill={k.accent}
        opacity={outsider}
      />
    </svg>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SCENE SHELL
   ══════════════════════════════════════════════════════════════════════════ */

export const Scene: React.FC<{
  eyebrow?: string;
  children: React.ReactNode;
  padding?: number;
}> = ({eyebrow, children, padding = 96}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: k.bg0,
      padding,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: font.sans,
    }}
  >
    {eyebrow ? (
      <Rise delay={0} dur={10} y={6} style={{marginBottom: space.s10}}>
        <div style={{display: 'flex', alignItems: 'center', gap: space.s4}}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <div style={{flex: 1, height: 1, background: k.line}} />
        </div>
      </Rise>
    ) : null}
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0}}>
      {children}
    </div>
  </div>
);

/** A dashed boundary label used in more than one scene. */
export const BoundaryLabel: React.FC<{children: React.ReactNode}> = ({children}) => (
  <Sans size={fs.sm} color={k.ink2} style={{letterSpacing: track.tight}}>
    {children}
  </Sans>
);
