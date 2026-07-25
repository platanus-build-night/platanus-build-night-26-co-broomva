import React from 'react';
import {useCurrentFrame} from 'remotion';
import {
  Eyebrow,
  Mono,
  Panel,
  Rise,
  Sans,
  Scene,
  TypeOn,
  enterAt,
} from '../components';
import {font, fs, fw, k, lh, radius, space, track} from '../theme';

/**
 * Scene 2 — THE QUESTION (10s)
 *
 * The thesis types on, then the write boundary becomes a picture.
 *
 * Deliberately NO verdict color in this scene. Both columns of producers are
 * rendered identically; only their POSITION relative to the dashed boundary
 * differs. That is the same argument the Keel mark makes — the outsider is the
 * same size and shape as every cell in the block, and position is the whole
 * argument. Colouring them here would answer the question before scene 3 asks
 * it.
 */

const CPS = 44;
const framesFor = (s: string) => Math.ceil((s.length / CPS) * 30);

const A = 'A check is only a check if the signal it reads comes from somewhere the thing being checked ';
const B = 'cannot write to';
const C = '.';

const TYPE_START = 6;
const B_START = TYPE_START + framesFor(A);
const C_START = B_START + framesFor(B);
const TYPE_END = C_START + framesFor(C);

const INSIDE = ['llm_review.verdict', 'docs/consistency', 'status = "passed"'];
const OUTSIDE = ['process exit code', 'tsc --noEmit', 'stripe charge.succeeded'];

const F = {
  boundary: TYPE_END + 14,
  inside: (i: number) => TYPE_END + 26 + i * 10,
  outside: (i: number) => TYPE_END + 62 + i * 10,
  note: TYPE_END + 104,
};

const ProducerChip: React.FC<{label: string; delay: number}> = ({label, delay}) => {
  const frame = useCurrentFrame();
  const t = enterAt(frame, delay, 11);
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * 8}px)`,
        background: k.bg2,
        border: `1px solid ${k.line}`,
        borderRadius: radius.md,
        padding: `${space.s4}px ${space.s5}px`,
      }}
    >
      <Mono size={fs.body} color={k.ink1}>
        {label}
      </Mono>
    </div>
  );
};

export const S2Question: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene eyebrow="the question">
      {/* ── the thesis ───────────────────────────────────────────────────── */}
      <div
        style={{
          fontFamily: font.sans,
          fontSize: fs.display,
          fontWeight: fw.medium,
          letterSpacing: track.display,
          lineHeight: lh.tight,
          color: k.ink0,
          maxWidth: 1560,
          minHeight: 250,
        }}
      >
        <TypeOn text={A} start={TYPE_START} cps={CPS} caret={frame < B_START} />
        <TypeOn
          text={B}
          start={B_START}
          cps={CPS}
          caret={frame >= B_START && frame < C_START}
          style={{color: k.accent}}
        />
        <TypeOn text={C} start={C_START} cps={CPS} caret={frame >= C_START && frame < F.boundary} />
      </div>

      {/* ── the write boundary, drawn ────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: space.s16,
          marginTop: space.s10,
          opacity: enterAt(frame, F.boundary, 14),
        }}
      >
        {/* inside */}
        <Panel
          dashed
          border={k.lineStrong}
          bg={k.bg1}
          style={{
            width: 860,
            flex: 'none',
            padding: space.s8,
            display: 'flex',
            flexDirection: 'column',
            gap: space.s4,
          }}
        >
          <Eyebrow color={k.ink3} style={{marginBottom: space.s2}}>
            inside the actor&apos;s write boundary
          </Eyebrow>
          {INSIDE.map((label, i) => (
            <ProducerChip key={label} label={label} delay={F.inside(i)} />
          ))}
        </Panel>

        {/* outside */}
        <div
          style={{
            flex: 1,
            padding: space.s8,
            display: 'flex',
            flexDirection: 'column',
            gap: space.s4,
          }}
        >
          <Eyebrow color={k.ink3} style={{marginBottom: space.s2}}>
            outside it
          </Eyebrow>
          {OUTSIDE.map((label, i) => (
            <ProducerChip key={label} label={label} delay={F.outside(i)} />
          ))}
        </div>
      </div>

      <Rise delay={F.note} dur={14} style={{marginTop: space.s8}}>
        <Sans size={fs.lede} color={k.ink2}>
          Same kind of node on both sides. Only the position differs — and the
          position is the whole argument.
        </Sans>
      </Rise>
    </Scene>
  );
};
