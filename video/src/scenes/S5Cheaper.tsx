import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {
  Eyebrow,
  IllustrativeChip,
  Mono,
  Panel,
  Rise,
  Sans,
  Scene,
  enterAt,
} from '../components';
import {font, fs, fw, k, lh, radius, space, track} from '../theme';

/**
 * Scene 5 — IT GETS CHEAPER (15s)
 *
 * Probe crystallization: a novel shape costs a model call, a recurring shape
 * gets crystallized into a small reviewable script and costs nothing next time.
 *
 * INTEGRITY: the cost curve on the right is a SHAPE, not a dataset. Keel has
 * not published a measured cost-per-node series, so the chart carries an
 * explicit `illustrative` chip, its axes are dashed rather than ticked, and it
 * has no numeric scale on either axis. Nothing here should be readable as a
 * measurement, because nothing here was measured.
 */

const F = {
  head: 4,
  step: (i: number) => 34 + i * 76,
  chart: 44,
  chip: 54,
  curve: 74,
  curveEnd: 268,
  abstain: 292,
  close: 344,
};

const CHART_W = 720;
const CHART_H = 300;

const curvePath = (() => {
  const pts: string[] = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * CHART_W;
    // Illustrative decay: cost FALLS as the probe library grows. Chosen for
    // legibility, fitted to nothing. In SVG y grows downward, so a high value
    // is a small y.
    const value = Math.exp(-3.1 * t); // 1 → ~0.045
    const y = CHART_H * (1 - value);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
})();

const Step: React.FC<{
  index: number;
  delay: number;
  label: string;
  title: string;
  mono: string;
  cost: string;
  costAccent?: boolean;
}> = ({index, delay, label, title, mono, cost, costAccent}) => {
  const frame = useCurrentFrame();
  const t = enterAt(frame, delay, 13);
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * 10}px)`,
        display: 'flex',
        gap: space.s5,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: fs.sm,
          color: k.ink3,
          width: 26,
          flex: 'none',
          paddingTop: 4,
        }}
      >
        {index}
      </div>
      <Panel style={{flex: 1, padding: space.s5}}>
        <Eyebrow color={k.ink3}>{label}</Eyebrow>
        <div style={{marginTop: space.s3}}>
          <Sans size={fs.body} color={k.ink0}>
            {title}
          </Sans>
        </div>
        <div
          style={{
            marginTop: space.s4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.s5,
          }}
        >
          <Mono size={fs.sm} color={k.ink2}>
            {mono}
          </Mono>
          <span
            style={{
              flex: 'none',
              padding: `${space.s1 + 2}px ${space.s3}px`,
              borderRadius: radius.sm,
              border: `1px solid ${costAccent ? k.accent : k.lineStrong}`,
              background: costAccent ? k.accentWash : 'transparent',
              color: costAccent ? k.accent : k.ink2,
              fontFamily: font.sans,
              fontSize: fs.xs,
              fontWeight: fw.medium,
              whiteSpace: 'nowrap',
            }}
          >
            {cost}
          </span>
        </div>
      </Panel>
    </div>
  );
};

export const S5Cheaper: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [F.curve, F.curveEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0, 0.38, 1),
  });

  return (
    <Scene eyebrow="it gets cheaper">
      <Rise delay={F.head} dur={12} style={{marginBottom: space.s8}}>
        <div
          style={{
            fontFamily: font.sans,
            fontSize: fs.h1,
            fontWeight: fw.medium,
            letterSpacing: track.display,
            lineHeight: lh.snug,
            color: k.ink0,
            maxWidth: 1600,
          }}
        >
          Novel shapes are judged by the agent. Recurring shapes get{' '}
          <span style={{color: k.accent}}>crystallized into probes</span> — so the
          next occurrence costs no model call at all.
        </div>
      </Rise>

      <div style={{display: 'flex', gap: space.s16, flex: 1, minHeight: 0}}>
        {/* ── the loop ─────────────────────────────────────────────────── */}
        <div
          style={{
            width: 880,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: space.s5,
          }}
        >
          <Step
            index={1}
            delay={F.step(0)}
            label="run 1 · novel shape"
            title="No probe matches. The agent traces the causal path and judges it."
            mono="decidedBy: 'agent'"
            cost="1 model call"
          />
          <Step
            index={2}
            delay={F.step(1)}
            label="crystallize"
            title="The shape — not the repo — is written out as a small reviewable script."
            mono="~/.config/keel/probes/rake-system-exit.v1.ts"
            cost="reviewable"
          />
          <Step
            index={3}
            delay={F.step(2)}
            label="run 2 · same shape"
            title="The probe matches and assesses it. No model is called."
            mono="decidedBy: 'probe'"
            cost="0 model calls"
            costAccent
          />
        </div>

        {/* ── the illustrative curve ───────────────────────────────────── */}
        <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
          <div style={{opacity: enterAt(frame, F.chip, 12), marginBottom: space.s5}}>
            <IllustrativeChip />
          </div>
          <div style={{opacity: enterAt(frame, F.chart, 14)}}>
            <Eyebrow color={k.ink3}>cost per node</Eyebrow>
            <svg
              width={CHART_W}
              height={CHART_H + 40}
              viewBox={`0 0 ${CHART_W} ${CHART_H + 40}`}
              style={{marginTop: space.s4, overflow: 'visible'}}
            >
              {/* Axes are DASHED and unticked — there is no scale here because
                  there is no dataset here. */}
              <line
                x1={0}
                y1={CHART_H}
                x2={CHART_W}
                y2={CHART_H}
                stroke={k.ink3}
                strokeWidth={1}
                strokeDasharray="4 5"
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={CHART_H}
                stroke={k.ink3}
                strokeWidth={1}
                strokeDasharray="4 5"
              />
              <path
                d={curvePath}
                fill="none"
                stroke={k.accent}
                strokeWidth={2.5}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
                strokeLinecap="round"
              />
            </svg>
            <div
              style={{
                width: CHART_W,
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: space.s2,
              }}
            >
              <Sans size={fs.xs} color={k.ink3}>
                probe library size →
              </Sans>
            </div>
          </div>

          <div
            style={{
              marginTop: space.s8,
              opacity: enterAt(frame, F.abstain, 14),
              maxWidth: CHART_W,
            }}
          >
            <Sans size={fs.body} color={k.ink1}>
              A probe that is unsure <strong style={{fontWeight: fw.semibold, color: k.ink0}}>abstains</strong>.
              It may never return <Mono size={fs.body} color={k.ink1}>unknown</Mono>.
              A lazy probe degrades to <em>ask</em>, never to <em>looks fine</em>.
            </Sans>
          </div>
        </div>
      </div>

      <div style={{marginTop: space.s6, opacity: enterAt(frame, F.close, 14)}}>
        <Sans size={fs.lede} color={k.ink2}>
          The probe library is code, so it compounds across everyone who runs Keel.
        </Sans>
      </div>
    </Scene>
  );
};
