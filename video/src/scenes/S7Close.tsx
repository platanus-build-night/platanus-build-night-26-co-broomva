import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {KeelMark, Mono, Panel, Sans, enterAt} from '../components';
import {font, fs, fw, k, space, track} from '../theme';

/**
 * Scene 7 — CLOSE (8s)
 *
 * The keel-blade settles in, then the wordmark, then the thesis and the install
 * line. The mark is loaded from skills/keel/design/mark.png rather than redrawn
 * — the brand rules forbid re-rendering the emblem, and a hand-coded copy in a
 * video is the silently-drifting second copy those rules exist to prevent.
 *
 * `blockReveal` and `outsider` kept their names from the vector mark's API and
 * now drive the settle and the final resolve. Renaming them would touch the
 * timing constants below for no behavioural gain.
 */

const F = {
  block: 4,
  blockEnd: 42,
  outsider: 50,
  outsiderEnd: 66,
  wordmark: 74,
  thesis: 96,
  command: 118,
  license: 148,
};

export const S7Close: React.FC = () => {
  const frame = useCurrentFrame();

  const blockReveal = interpolate(frame, [F.block, F.blockEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outsider = interpolate(frame, [F.outsider, F.outsiderEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0, 0.38, 1),
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: k.bg0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.sans,
        gap: space.s8,
      }}
    >
      <KeelMark width={300} blockReveal={blockReveal} outsider={outsider} />

      <div
        style={{
          opacity: enterAt(frame, F.wordmark, 14),
          fontFamily: font.sans,
          fontSize: fs.h1,
          fontWeight: fw.medium,
          letterSpacing: track.brand,
          textTransform: 'uppercase',
          color: k.ink0,
          marginTop: space.s6,
        }}
      >
        Keel
      </div>

      <div
        style={{
          opacity: enterAt(frame, F.thesis, 14),
          maxWidth: 1080,
          textAlign: 'center',
        }}
      >
        <Sans size={fs.lede} color={k.ink2}>
          A check is only a check if the signal it reads comes from somewhere the
          thing being checked cannot write to.
        </Sans>
      </div>

      <div style={{opacity: enterAt(frame, F.command, 14), marginTop: space.s6}}>
        <Panel bg={k.bg1} border={k.lineStrong} style={{padding: `${space.s5}px ${space.s10}px`}}>
          <Mono size={fs.h2} color={k.ink0}>
            <span style={{color: k.ink3}}>$ </span>npx skills add broomva/keel
          </Mono>
        </Panel>
      </div>

      <div
        style={{
          opacity: enterAt(frame, F.license, 14),
          display: 'flex',
          alignItems: 'center',
          gap: space.s5,
          marginTop: space.s4,
        }}
      >
        <Sans size={fs.sm} color={k.ink3}>
          MIT
        </Sans>
        <div style={{width: 4, height: 4, background: k.ink3, borderRadius: 1}} />
        <Mono size={fs.sm} color={k.ink3}>
          github.com/broomva/keel
        </Mono>
      </div>
    </div>
  );
};
