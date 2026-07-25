import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {
  Eyebrow,
  Mark,
  MeasuredChip,
  Mono,
  Rise,
  Sans,
  Scene,
  enterAt,
} from '../components';
import {font, fs, fw, k, lh, space, track, verdict} from '../theme';

/**
 * Scene 4 — THE RATIO (12s)
 *
 * MEASURED. Every number in this scene is Keel's own self-measurement:
 *   anchored 8 · self_referential 11 · unknown 0 · not_a_check 13
 *   32 gathered edges · ratio = 8 / (8 + 11 + 0) = 0.421
 *
 * THE RATIO NEVER TRAVELS ALONE. The absolute anchored count and the gathered
 * surface are on screen with it, always — a 1.0 over one edge and a 0.7 over
 * fifty are different claims, and a bare ratio rewards deleting checks.
 */

const COUNTS = {
  anchored: 8,
  self_referential: 11,
  unknown: 0,
  not_a_check: 13,
} as const;

const TOTAL =
  COUNTS.anchored + COUNTS.self_referential + COUNTS.unknown + COUNTS.not_a_check; // 32
const DENOM = COUNTS.anchored + COUNTS.self_referential + COUNTS.unknown; // 19
const RATIO = COUNTS.anchored / DENOM; // 0.42105…

const CELLS: {cls: keyof typeof COUNTS}[] = [
  ...Array.from({length: COUNTS.anchored}, () => ({cls: 'anchored' as const})),
  ...Array.from({length: COUNTS.self_referential}, () => ({
    cls: 'self_referential' as const,
  })),
  ...Array.from({length: COUNTS.unknown}, () => ({cls: 'unknown' as const})),
  ...Array.from({length: COUNTS.not_a_check}, () => ({cls: 'not_a_check' as const})),
];

const F = {
  gridLabel: 6,
  cell: (i: number) => 14 + i * 2.6,
  exclude: 128,
  formula: 152,
  substitute: 190,
  count: 206,
  countEnd: 292,
  stats: 236,
  caption: 268,
};

export const S4Ratio: React.FC = () => {
  const frame = useCurrentFrame();

  const shown = interpolate(frame, [F.count, F.countEnd], [0, RATIO], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0, 0.38, 1),
  });
  const excl = enterAt(frame, F.exclude, 16);

  return (
    <Scene eyebrow="the ratio">
      <div
        style={{
          display: 'flex',
          gap: space.s24,
          flex: 1,
          alignItems: 'center',
          paddingBottom: space.s16,
        }}
      >
        {/* ── the gathered surface, one mark per node ──────────────────── */}
        <div style={{width: 620, flex: 'none'}}>
          <Rise delay={F.gridLabel} dur={10} y={0}>
            <Eyebrow color={k.ink3}>32 verification edges gathered</Eyebrow>
          </Rise>
          <div
            style={{
              marginTop: space.s6,
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 46px)',
              gap: 14,
            }}
          >
            {CELLS.map((c, i) => {
              const t = enterAt(frame, F.cell(i), 8);
              const v = verdict[c.cls];
              const isExcluded = c.cls === 'not_a_check';
              return (
                <div
                  key={i}
                  style={{
                    opacity: t * (isExcluded ? 1 - excl * 0.78 : 1),
                    transform: isExcluded
                      ? `translate(${excl * 26}px, ${excl * 34}px)`
                      : 'none',
                  }}
                >
                  <Mark
                    color={v.color}
                    size={46}
                    dashed={v.dashed}
                    hollow={v.dashed}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: space.s10,
              opacity: enterAt(frame, F.exclude + 12, 14),
            }}
          >
            <Sans size={fs.sm} color={k.ink2}>
              13 <Mono size={fs.sm} color={k.ink2}>not_a_check</Mono> leave the
              denominator. A node that asserts nothing would be a lie in either
              column.
            </Sans>
          </div>
        </div>

        {/* ── the arithmetic ───────────────────────────────────────────── */}
        <div style={{flex: 1, paddingTop: space.s4}}>
          <div style={{opacity: enterAt(frame, F.formula, 12)}}>
            <Mono size={fs.h3} color={k.ink2}>
              anchored / (anchored + self_referential + unknown)
            </Mono>
          </div>
          <div style={{marginTop: space.s5, opacity: enterAt(frame, F.substitute, 12)}}>
            <Mono size={fs.h1} color={k.ink0}>
              8 / (8 + 11 + 0)
            </Mono>
          </div>

          <div
            style={{
              marginTop: space.s6,
              fontFamily: font.sans,
              fontSize: fs.ratio,
              fontWeight: fw.medium,
              letterSpacing: track.ratio,
              lineHeight: lh.ratio,
              color: k.ink0,
              fontVariantNumeric: 'tabular-nums',
              opacity: enterAt(frame, F.count, 8),
            }}
          >
            {shown.toFixed(3)}
          </div>

          <div
            style={{
              marginTop: space.s6,
              display: 'flex',
              alignItems: 'center',
              gap: space.s5,
              opacity: enterAt(frame, F.caption, 14),
            }}
          >
            <Sans size={fs.lede} color={k.accent} weight={fw.medium}>
              keel, measuring itself
            </Sans>
            <MeasuredChip />
          </div>

          <div
            style={{
              marginTop: space.s8,
              display: 'flex',
              flexDirection: 'column',
              gap: space.s3,
              opacity: enterAt(frame, F.stats, 14),
              borderTop: `1px solid ${k.line}`,
              paddingTop: space.s6,
            }}
          >
            {(
              [
                ['anchored', COUNTS.anchored],
                ['self_referential', COUNTS.self_referential],
                ['unknown', COUNTS.unknown],
                ['not_a_check', COUNTS.not_a_check],
              ] as const
            ).map(([name, n]) => (
              <div
                key={name}
                style={{display: 'flex', alignItems: 'center', gap: space.s4}}
              >
                <Mark
                  color={verdict[name].color}
                  size={14}
                  dashed={verdict[name].dashed}
                  hollow={verdict[name].dashed}
                />
                <Mono
                  size={fs.sm}
                  color={k.ink1}
                  style={{width: 230, display: 'inline-block'}}
                >
                  {name}
                </Mono>
                <Mono
                  size={fs.sm}
                  color={k.ink0}
                  style={{fontVariantNumeric: 'tabular-nums'}}
                >
                  {n}
                </Mono>
                {name === 'unknown' ? (
                  <Sans size={fs.xs} color={k.ink3} style={{marginLeft: space.s3}}>
                    would fail closed
                  </Sans>
                ) : null}
              </div>
            ))}
            <div style={{marginTop: space.s3}}>
              <Sans size={fs.xs} color={k.ink3}>
                {TOTAL} edges gathered · denominator {DENOM}
              </Sans>
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
};
