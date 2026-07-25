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

export type Scene = {
  id: string;
  component: React.FC;
  durationInFrames: number;
};

export const SCENES: readonly Scene[] = [
  {id: 's1-problem', component: S1Problem, durationInFrames: 360}, // 12s
  {id: 's2-question', component: S2Question, durationInFrames: 300}, // 10s
  {id: 's3-classes', component: S3Classes, durationInFrames: 540}, // 18s
  {id: 's4-ratio', component: S4Ratio, durationInFrames: 360}, // 12s
  {id: 's5-cheaper', component: S5Cheaper, durationInFrames: 450}, // 15s
  {id: 's6-routing', component: S6Routing, durationInFrames: 450}, // 15s
  {id: 's7-close', component: S7Close, durationInFrames: 240}, // 8s
];

/**
 * The two-minute stage cut.
 *
 * A live narrator has 120 seconds total, and the 90s explainer leaves 30 — which
 * is not a demo, it is a stub. Dropping two scenes buys back the half-minute the
 * live corpus page needs.
 *
 * `s5-cheaper` goes because its chart is chipped "illustrative", and an
 * unmeasured curve on a projector costs the presenter a disclaimer it cannot
 * afford. (The curve is measured now — `reports/curve.svg` — but the scene still
 * renders the chip, and re-cutting the scene is a bigger change than dropping
 * it.) `s6-routing` goes because it answers a question the room has not asked
 * yet at the two-minute mark; it is the best writing in the reel and it belongs
 * in Q&A.
 *
 * Selection is by whole scene ON PURPOSE. Every scene keys its animation to
 * absolute frames inside its own `Sequence`, so shortening `durationInFrames`
 * truncates that scene's final beats mid-move. Dropping a scene only shifts the
 * offsets of the ones after it, which is why this is a filter and not a re-time.
 */
export const PITCH_SCENE_IDS: readonly string[] = [
  's1-problem',
  's2-question',
  's3-classes',
  's4-ratio',
  's7-close',
];

export const PITCH_SCENES: readonly Scene[] = SCENES.filter((s) =>
  PITCH_SCENE_IDS.includes(s.id),
);

const totalFrames = (scenes: readonly Scene[]) =>
  scenes.reduce((n, s) => n + s.durationInFrames, 0);

/** Frame offset of each scene, for rendering stills at scene boundaries. */
const sceneOffsets = (scenes: readonly Scene[]) =>
  scenes.reduce<{id: string; from: number; to: number}[]>((acc, s) => {
    const from = acc.length ? acc[acc.length - 1].to : 0;
    acc.push({id: s.id, from, to: from + s.durationInFrames});
    return acc;
  }, []);

export const TOTAL_FRAMES = totalFrames(SCENES); // 2700 = 90s
export const SCENE_OFFSETS = sceneOffsets(SCENES);

export const PITCH_TOTAL_FRAMES = totalFrames(PITCH_SCENES); // 1800 = 60s
export const PITCH_SCENE_OFFSETS = sceneOffsets(PITCH_SCENES);

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

/**
 * A reel is a scene list laid end to end. Both cuts are the same reel over a
 * different list — the 60s stage cut is a selection, never a re-timing, so a
 * scene plays identically in both or not at all.
 */
const Reel: React.FC<{scenes: readonly Scene[]}> = ({scenes}) => {
  const offsets = sceneOffsets(scenes);
  return (
    <AbsoluteFill style={{background: k.bg0}}>
      {offsets.map((o, i) => {
        const Comp = scenes[i].component;
        return (
          <Sequence
            key={o.id}
            name={o.id}
            from={o.from}
            durationInFrames={scenes[i].durationInFrames}
          >
            <Comp />
          </Sequence>
        );
      })}
      <Progress />
    </AbsoluteFill>
  );
};

export const KeelExplainer: React.FC = () => <Reel scenes={SCENES} />;

/** The 60s cut narrated live in the two-minute pitch. */
export const KeelPitch: React.FC = () => <Reel scenes={PITCH_SCENES} />;
