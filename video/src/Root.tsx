import React from 'react';
import {Composition} from 'remotion';
import {
  KeelExplainer,
  KeelPitch,
  PITCH_TOTAL_FRAMES,
  SCENES,
  SCENE_OFFSETS,
  TOTAL_FRAMES,
} from './Video';
import {FPS} from './theme';

/**
 * Compositions:
 *   KeelExplainer  — the full 90s cut.
 *   KeelPitch      — the 60s stage cut, narrated live in the two-minute pitch.
 *   scene-*        — one composition per scene, so a single scene can be
 *                    previewed, re-timed, or rendered without the other six.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KeelExplainer"
        component={KeelExplainer}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="KeelPitch"
        component={KeelPitch}
        durationInFrames={PITCH_TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {SCENES.map((s, i) => (
        <Composition
          key={s.id}
          id={`scene-${s.id}`}
          component={s.component}
          durationInFrames={SCENE_OFFSETS[i].to - SCENE_OFFSETS[i].from}
          fps={FPS}
          width={1920}
          height={1080}
        />
      ))}
    </>
  );
};
