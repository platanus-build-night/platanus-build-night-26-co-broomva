import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {
  ClassChip,
  Eyebrow,
  Mono,
  Panel,
  Rise,
  Sans,
  Scene,
  enterAt,
} from '../components';
import {font, fs, fw, k, lh, radius, space, track} from '../theme';

/**
 * Scene 6 — ROUTING (15s)
 *
 * The worked example from the README, stated in the README's own words:
 *
 *   `Rakefile:24 tests` cannot fail — Ruby's `system` does not propagate exit
 *   status, so the task exits 0 when rspec fails. The same assertion already
 *   runs anchored at `.circleci/config.yml:101`, where CI gates on the real
 *   exit code.
 *
 * No file contents are reconstructed here. The two node ids and the two
 * arguments are what Keel actually asserts about this pair; inventing a code
 * snippet to sit under them would be exactly the kind of unbacked claim this
 * video is about.
 *
 * The source card carries NO verdict chip — "ungrounded" is the README's own
 * umbrella term for the routed set, and assigning it a specific class here
 * would be a classification this video did not make. The target card carries
 * the `anchored` chip, because that one Keel does assert.
 */

const F = {
  head: 4,
  source: 34,
  sourceArg: 84,
  arrow: 146,
  target: 178,
  targetArg: 226,
  tagline: 292,
  footnote: 352,
};

const ARROW_W = 190;

export const S6Routing: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [F.arrow, F.arrow + 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0, 0.38, 1),
  });

  return (
    <Scene eyebrow="routing">
      <Rise delay={F.head} dur={12} style={{marginBottom: space.s10}}>
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
          A ratio nobody can act on is a report card. So for every ungrounded
          check, Keel proposes a route to an anchored signal{' '}
          <span style={{color: k.accent}}>that already exists in the same graph</span>.
        </div>
      </Rise>

      <div style={{display: 'flex', alignItems: 'center', gap: space.s8}}>
        {/* ── the ungrounded node ─────────────────────────────────────── */}
        <Rise delay={F.source} dur={13} style={{width: 720, flex: 'none'}}>
          <Panel border={k.lineStrong} style={{padding: space.s6, minHeight: 260}}>
            <Eyebrow color={k.ink3}>ungrounded</Eyebrow>
            <div style={{marginTop: space.s4}}>
              <Mono size={fs.h2} color={k.ink0}>
                Rakefile:24
              </Mono>
              <Mono size={fs.h2} color={k.ink2} style={{marginLeft: '0.6em'}}>
                tests
              </Mono>
            </div>
            <div
              style={{
                marginTop: space.s5,
                opacity: enterAt(frame, F.sourceArg, 14),
              }}
            >
              <Sans size={fs.body} color={k.ink1}>
                Cannot fail. Ruby&apos;s <Mono size={fs.body} color={k.ink0}>system</Mono>{' '}
                does not propagate exit status, so the task exits{' '}
                <Mono size={fs.body} color={k.ink0}>0</Mono> when rspec fails.
              </Sans>
            </div>
          </Panel>
        </Rise>

        {/* ── the route ────────────────────────────────────────────────── */}
        <div style={{width: ARROW_W, flex: 'none', textAlign: 'center'}}>
          <div style={{opacity: draw, marginBottom: space.s3}}>
            <Eyebrow>route</Eyebrow>
          </div>
          <svg width={ARROW_W} height={24} viewBox={`0 0 ${ARROW_W} 24`}>
            <line
              x1={0}
              y1={12}
              x2={(ARROW_W - 16) * draw}
              y2={12}
              stroke={k.accent}
              strokeWidth={2}
            />
            <polygon
              points={`${ARROW_W - 16},5 ${ARROW_W},12 ${ARROW_W - 16},19`}
              fill={k.accent}
              opacity={draw > 0.94 ? 1 : 0}
            />
          </svg>
        </div>

        {/* ── the anchor that already exists ──────────────────────────── */}
        <Rise delay={F.target} dur={13} style={{width: 720, flex: 'none'}}>
          <Panel
            border={k.lineStrong}
            style={{padding: space.s6, minHeight: 260}}
          >
            <ClassChip cls="anchored" />
            <div style={{marginTop: space.s4}}>
              <Mono size={fs.h2} color={k.ink0}>
                .circleci/config.yml:101
              </Mono>
            </div>
            <div
              style={{
                marginTop: space.s5,
                opacity: enterAt(frame, F.targetArg, 14),
              }}
            >
              <Sans size={fs.body} color={k.ink1}>
                The same assertion, already running — where CI gates on the real
                exit code. The proposition does not change. Only who produces the
                signal.
              </Sans>
            </div>
          </Panel>
        </Rise>
      </div>

      {/* ── the rule ─────────────────────────────────────────────────────── */}
      <div style={{marginTop: 'auto', paddingTop: space.s12}}>
        <div style={{opacity: enterAt(frame, F.tagline, 16)}}>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: fs.display,
              fontWeight: fw.semibold,
              letterSpacing: track.display,
              lineHeight: lh.tight,
              color: k.ink0,
            }}
          >
            Independence cannot be manufactured,{' '}
            <span style={{color: k.accent}}>but it can be routed.</span>
          </div>
        </div>
        <div
          style={{
            marginTop: space.s5,
            display: 'flex',
            gap: space.s8,
            opacity: enterAt(frame, F.footnote, 14),
          }}
        >
          <span
            style={{
              padding: `${space.s2}px ${space.s4}px`,
              border: `1px solid ${k.line}`,
              borderRadius: radius.sm,
              fontFamily: font.sans,
              fontSize: fs.sm,
              color: k.ink2,
            }}
          >
            Keel never invents an anchor. &ldquo;No route found&rdquo; is a
            first-class answer.
          </span>
          <span
            style={{
              padding: `${space.s2}px ${space.s4}px`,
              border: `1px solid ${k.line}`,
              borderRadius: radius.sm,
              fontFamily: font.sans,
              fontSize: fs.sm,
              color: k.ink2,
            }}
          >
            Routing never moves the ratio. A proposal is not a change.
          </span>
        </div>
      </div>
    </Scene>
  );
};
