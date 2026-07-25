import React from 'react';
import {useCurrentFrame} from 'remotion';
import {
  ClassChip,
  Eyebrow,
  Mark,
  Mono,
  Panel,
  Rise,
  Sans,
  Scene,
  enterAt,
} from '../components';
import {fs, fw, k, lh, space, track} from '../theme';

/**
 * Scene 1 — THE PROBLEM (12s)
 *
 * A green pipeline where every check is an LLM checking an LLM.
 *
 * The green here is a legitimate use of the anchored token: it is the
 * PIPELINE's own verdict claim, rendered in the color a verdict is rendered in.
 * It is not chrome. The scene's whole move is to take it away.
 */

const ROWS = [
  {
    node: 'review/llm-approval',
    note: 'an LLM approved what an LLM wrote',
  },
  {
    node: 'docs/consistency-check',
    note: 'a doc was checked against another doc',
  },
  {
    node: 'agent/task-complete',
    note: 'the agent asserted that it had finished',
  },
  {
    node: 'deploy/promotion-gate',
    note: 'the gate read a status field the deployer sets',
  },
];

const F = {
  panel: 4,
  row: (i: number) => 16 + i * 13,
  summary: 78,
  note: (i: number) => 108 + i * 24,
  flip: (i: number) => 214 + i * 6,
  headline: 258,
  kicker: 288,
};

export const S1Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const headline = enterAt(frame, F.headline, 14);

  return (
    <Scene eyebrow="the problem">
      <div
        style={{
          display: 'flex',
          gap: space.s16,
          flex: 1,
          minHeight: 0,
          alignItems: 'center',
        }}
      >
        {/* ── the pipeline ─────────────────────────────────────────────── */}
        <Rise delay={F.panel} dur={12} style={{width: 1010, flex: 'none'}}>
          <Panel style={{overflow: 'hidden'}}>
            {/* header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${space.s5}px ${space.s6}px`,
                borderBottom: `1px solid ${k.line}`,
                background: k.bg2,
              }}
            >
              <Mono size={fs.sm} color={k.ink2}>
                broomva/keel · main · 4f0c1ab
              </Mono>
              <div style={{opacity: enterAt(frame, F.summary, 10)}}>
                <div style={{display: 'flex', alignItems: 'center', gap: space.s3}}>
                  <Mark color={k.anchored} size={12} />
                  <Mono size={fs.sm} color={k.anchored}>
                    4 / 4 passed
                  </Mono>
                </div>
              </div>
            </div>

            {/* rows */}
            {ROWS.map((r, i) => {
              const t = enterAt(frame, F.row(i), 11);
              const flip = enterAt(frame, F.flip(i), 12);
              return (
                <div
                  key={r.node}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${space.s6}px ${space.s6}px`,
                    borderBottom:
                      i < ROWS.length - 1 ? `1px solid ${k.line}` : 'none',
                    opacity: t,
                    transform: `translateY(${(1 - t) * 8}px)`,
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: space.s5}}>
                    {/* the mark carries the verdict, and it changes */}
                    <div style={{position: 'relative', width: 16, height: 16}}>
                      <Mark
                        color={k.anchored}
                        size={16}
                        style={{position: 'absolute', opacity: 1 - flip}}
                      />
                      <Mark
                        color={k.selfReferential}
                        size={16}
                        style={{position: 'absolute', opacity: flip}}
                      />
                    </div>
                    <Mono size={fs.ui} color={k.ink0}>
                      {r.node}
                    </Mono>
                  </div>
                  <div style={{position: 'relative', height: 30, width: 210}}>
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        opacity: 1 - flip,
                      }}
                    >
                      <Mono size={fs.ui} color={k.anchored}>
                        passed
                      </Mono>
                    </div>
                    <div
                      style={{position: 'absolute', right: 0, top: -4, opacity: flip}}
                    >
                      <ClassChip cls="self_referential" />
                    </div>
                  </div>
                </div>
              );
            })}
          </Panel>
        </Rise>

        {/* ── what actually produced each signal ───────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: space.s8,
            paddingTop: space.s6,
          }}
        >
          <Rise delay={F.note(0) - 12} dur={10} y={0}>
            <Eyebrow color={k.ink3}>who produced the signal</Eyebrow>
          </Rise>
          {ROWS.map((r, i) => {
            const t = enterAt(frame, F.note(i), 12);
            return (
              <div
                key={r.node}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space.s4,
                  opacity: t,
                  transform: `translateX(${(1 - t) * -12}px)`,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 1,
                    background: k.accentLine,
                    flex: 'none',
                  }}
                />
                <Sans size={fs.body} color={k.ink1}>
                  {r.note}
                </Sans>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── the point ────────────────────────────────────────────────────── */}
      <div style={{marginTop: space.s12, minHeight: 190}}>
        <div
          style={{
            opacity: headline,
            transform: `translateY(${(1 - headline) * 12}px)`,
          }}
        >
          <div
            style={{
              fontSize: fs.display,
              fontWeight: fw.semibold,
              letterSpacing: track.display,
              lineHeight: lh.tight,
              color: k.ink0,
              maxWidth: 1500,
            }}
          >
            Green does not mean verified.
          </div>
        </div>
        <div
          style={{
            marginTop: space.s5,
            opacity: enterAt(frame, F.kicker, 14),
          }}
        >
          <Sans size={fs.lede} color={k.ink2} style={{lineHeight: lh.snug}}>
            Every check in this pipeline is a system grading work its own class of
            system produced.
          </Sans>
        </div>
      </div>
    </Scene>
  );
};
