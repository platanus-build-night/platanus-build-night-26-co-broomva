import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Mark, Mono, Rise, Sans, Scene, enterAt} from '../components';
import {
  font,
  fs,
  fw,
  k,
  lh,
  radius,
  space,
  track,
  verdict,
  type GroundingClass,
} from '../theme';

/**
 * Scene 3 — THE FOUR CLASSES (18s)
 *
 * Exactly four, matching `GroundingClass` in schemas/keel.ts. The schema is
 * frozen; so is this list.
 *
 * `not_a_check` is rendered deliberately worse than the other three: inert
 * slate, a dashed rule, prose set in --k-ink-2 rather than --k-ink-1. It is the
 * one shoppable class — mis-filing a real check there shrinks the denominator
 * and inflates the score — so it must never look like a place you want your
 * nodes to land.
 */

type Row = {
  cls: GroundingClass;
  prose: string;
  example: string;
  tag?: string;
};

const ROWS: Row[] = [
  {
    cls: 'anchored',
    prose:
      'The producer sits outside the write boundary. The runtime decides the exit code, and no amount of persuasion changes it.',
    example: 'bun test  →  exit 1',
  },
  {
    cls: 'self_referential',
    prose:
      'The producer sits inside it. An LLM judging output, a doc checked against a doc, a status field something set itself.',
    example: 'uses: llm-review@v3',
  },
  {
    cls: 'unknown',
    prose:
      'The fork point could not be traced. Absence of evidence of dependence is not evidence of independence.',
    example: 'curl -s "$DEPLOY_HOOK"',
    tag: 'fails closed — counts against the ratio',
  },
  {
    cls: 'not_a_check',
    prose:
      'It asserts nothing about correctness. Excluded from the ratio — which is exactly why it is the one class worth shopping into.',
    example: 'rspec || true',
    tag: 'excluded from the denominator',
  },
];

const F = {
  head: 4,
  row: (i: number) => 46 + i * 104,
  close: 486,
};

const ClassRow: React.FC<{row: Row; delay: number}> = ({row, delay}) => {
  const frame = useCurrentFrame();
  const t = enterAt(frame, delay, 13);
  const v = verdict[row.cls];
  const inert = row.cls === 'not_a_check';

  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * 12}px)`,
        display: 'flex',
        gap: space.s6,
        paddingTop: space.s6,
        paddingBottom: space.s6,
        borderTop: `1px ${inert ? 'dashed' : 'solid'} ${inert ? k.ink3 : k.line}`,
      }}
    >
      <Mark
        color={v.color}
        size={26}
        dashed={v.dashed}
        hollow={v.dashed}
        style={{marginTop: 8}}
      />
      <div style={{flex: 1, minWidth: 0}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: space.s8,
          }}
        >
          <Mono size={fs.h1} color={v.color} weight={fw.medium}>
            {row.cls}
          </Mono>
          <div
            style={{
              background: inert ? 'transparent' : k.bg1,
              border: `1px ${inert ? 'dashed' : 'solid'} ${inert ? k.ink3 : k.line}`,
              borderRadius: radius.md,
              padding: `${space.s2}px ${space.s4}px`,
              flex: 'none',
            }}
          >
            <Mono size={fs.sm} color={inert ? k.ink3 : k.ink1}>
              {row.example}
            </Mono>
          </div>
        </div>
        <div style={{marginTop: space.s3, maxWidth: 1280}}>
          <Sans size={fs.body} color={inert ? k.ink2 : k.ink1}>
            {row.prose}
          </Sans>
        </div>
        {row.tag ? (
          <div style={{marginTop: space.s3}}>
            <span
              style={{
                fontFamily: font.sans,
                fontSize: fs.xs,
                letterSpacing: track.eyebrow,
                textTransform: 'uppercase',
                color: inert ? k.ink3 : v.color,
                fontWeight: fw.medium,
              }}
            >
              {row.tag}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const S3Classes: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene eyebrow="the classification">
      <Rise delay={F.head} dur={12} style={{marginBottom: space.s6}}>
        <div
          style={{
            fontFamily: font.sans,
            fontSize: fs.h1,
            fontWeight: fw.medium,
            letterSpacing: track.display,
            lineHeight: lh.snug,
            color: k.ink0,
            maxWidth: 1500,
          }}
        >
          The question is never <span style={{color: k.ink2}}>is this a good check</span>
          . It is:{' '}
          <span style={{color: k.accent}}>
            who produces the signal, and can the actor write to it?
          </span>
        </div>
      </Rise>

      <div style={{flex: 1}}>
        {ROWS.map((row, i) => (
          <ClassRow key={row.cls} row={row} delay={F.row(i)} />
        ))}
      </div>

      <div style={{opacity: enterAt(frame, F.close, 14), marginTop: space.s4}}>
        <Sans size={fs.lede} color={k.ink2}>
          Every verification edge gets exactly one class.
        </Sans>
      </div>
    </Scene>
  );
};
