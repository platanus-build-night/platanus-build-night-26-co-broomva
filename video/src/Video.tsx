import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {k} from './theme';
import {S1Problem} from './scenes/S1Problem';
import {S2Question} from './scenes/S2Question';
import {S3Classes} from './scenes/S3Classes';
import {S4Ratio} from './scenes/S4Ratio';
import {S5Cheaper} from './scenes/S5Cheaper';
import {S6Routing} from './scenes/S6Routing';
import {S7Close} from './scenes/S7Close';

/**
 * Keel — "How the skill works".
 *
 * Hard cuts between scenes. Instruments settle; they do not perform, and a
 * crossfade between two dark frames reads as a smudge rather than as a
 * transition. Each scene handles its own entrance.
 */

export const SCENES = [
  {id: 's1-problem', component: S1Problem, durationInFrames: 360}, // 12s
  {id: 's2-question', component: S2Question, durationInFrames: 300}, // 10s
  {id: 's3-classes', component: S3Classes, durationInFrames: 540}, // 18s
  {id: 's4-ratio', component: S4Ratio, durationInFrames: 360}, // 12s
  {id: 's5-cheaper', component: S5Cheaper, durationInFrames: 450}, // 15s
  {id: 's6-routing', component: S6Routing, durationInFrames: 450}, // 15s
  {id: 's7-close', component: S7Close, durationInFrames: 240}, // 8s
] as const;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.durationInFrames, 0); // 2700 = 90s

/** Frame offset of each scene, for rendering stills at scene boundaries. */
export const SCENE_OFFSETS = SCENES.reduce<{id: string; from: number; to: number}[]>(
  (acc, s) => {
    const from = acc.length ? acc[acc.length - 1].to : 0;
    acc.push({id: s.id, from, to: from + s.durationInFrames});
    return acc;
  },
  [],
);

/**
 * A hairline progress rule. Accent, because it is Keel's own chrome — the
 * narrator hue is the only hue allowed to decorate. A verdict color here would
 * read as a running score.
 */
const Progress: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 2,
        background: k.line,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${((frame + 1) / durationInFrames) * 100}%`,
          background: k.accent,
          opacity: 0.55,
        }}
      />
    </div>
  );
};

export const KeelExplainer: React.FC = () => {
  return (
    <AbsoluteFill style={{background: k.bg0}}>
      {SCENE_OFFSETS.map((o, i) => {
        const Comp = SCENES[i].component;
        return (
          <Sequence
            key={o.id}
            name={o.id}
            from={o.from}
            durationInFrames={SCENES[i].durationInFrames}
          >
            <Comp />
          </Sequence>
        );
      })}
      <Progress />
    </AbsoluteFill>
  );
};
