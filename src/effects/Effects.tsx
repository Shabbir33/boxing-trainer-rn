import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Side } from '@/game/engine';
import { Colors } from '@/theme';
import { ArtImage } from '@/ui/ArtImage';
import { ComicArt, type Art } from '@/ui/comicArt';
import { ComicText } from './ComicText';
import { seeded, Star } from './shapes';

/** Generated comic lettering for each effect word. */
const WORD_ART: Record<string, Art> = {
  'POW!': ComicArt.fxPow,
  'BAM!': ComicArt.fxBam,
  'WHAM!': ComicArt.fxWham,
  'SMACK!': ComicArt.fxSmack,
  'BONK!': ComicArt.fxBonk,
  'K.O.!': ComicArt.titleKo,
  'WRONG WAY!': ComicArt.fxWrongWay,
  'WHOOSH!': ComicArt.fxWhoosh,
  'SLIP!': ComicArt.fxSlip,
  'NOPE!': ComicArt.fxNope,
  'SWISH!': ComicArt.fxSwish,
  'CLOSE ONE!': ComicArt.fxCloseOne,
};
const wordArt = (word: string) => WORD_ART[word] ?? ComicArt.fxPow;

interface Screen {
  width: number;
  height: number;
}

/**
 * Outcome codes for pre-mounted effects. Effects are mounted hidden before a punch
 * lands and started by writing one of these to their `fire` value, so the moment of
 * impact costs no React render (which shares a thread with the 3D scene).
 */
export const Fire = { waiting: 0, dodge: 1, close: 2, hit: 3, wrongWay: 4 } as const;
export type FireValue = SharedValue<number>;

const DODGE_CODES: number[] = [Fire.dodge, Fire.close];
const HIT_CODES: number[] = [Fire.hit, Fire.wrongWay];
const ANY_CODES: number[] = [...DODGE_CODES, ...HIT_CODES];

/** Runs `start` on the UI thread when `fire` switches to one of `codes`. */
function useOnFire(fire: FireValue, codes: number[], start: () => void) {
  useAnimatedReaction(
    () => fire.value,
    (v, prev) => {
      if (v !== prev && codes.includes(v)) start();
    },
  );
}

/** Pop-in for a pre-mounted effect: hidden until fired, then overshoot, hold, fade. */
function useFiredPop(fire: FireValue, codes: number[], holdMs: number, from = 0.2) {
  const scale = useSharedValue(from);
  const opacity = useSharedValue(0);
  useOnFire(fire, codes, () => {
    'worklet';
    scale.value = withSequence(
      withTiming(1.15, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 110 }),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 0 }),
      withDelay(holdMs, withTiming(0, { duration: 200 })),
    );
  });
  return { scale, opacity };
}

/** Visible only while `fire` holds `code`; picks between pre-rendered label variants. */
function useVariant(fire: FireValue, code: number) {
  return useAnimatedStyle(() => ({ opacity: fire.value === code ? 1 : 0 }));
}

/** Pop-in on mount: overshoot, settle, hold, fade. */
function usePop(holdMs: number, from = 0.2) {
  const scale = useSharedValue(from);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.15, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 110 }),
    );
    opacity.value = withDelay(holdMs, withTiming(0, { duration: 200 }));
  }, [scale, opacity, holdMs]);
  return { scale, opacity };
}

function DizzyStars({
  fire,
  cx,
  cy,
  radius,
}: {
  fire: FireValue;
  cx: number;
  cy: number;
  radius: number;
}) {
  const progress = useSharedValue(-1); // < 0 = hidden until fired
  useOnFire(fire, HIT_CODES, () => {
    'worklet';
    progress.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 950, easing: Easing.linear }),
    );
  });
  const size = radius * 0.5;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <OrbitingStar key={i} index={i} progress={progress} cx={cx} cy={cy} radius={radius} size={size} />
      ))}
    </>
  );
}

function OrbitingStar({
  index,
  progress,
  cx,
  cy,
  radius,
  size,
}: {
  index: number;
  progress: { value: number };
  cx: number;
  cy: number;
  radius: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const a = Math.max(0, t) * Math.PI * 3 + (index * Math.PI * 2) / 3;
    const fade = t < 0 ? 0 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    return {
      opacity: fade,
      transform: [
        { translateX: Math.cos(a) * radius },
        { translateY: Math.sin(a) * radius * 0.35 },
        { scale: 0.75 + 0.3 * Math.sin(a) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 }, style]}>
      <Star size={size} />
    </Animated.View>
  );
}

export function HitEffect({
  fire,
  side,
  label,
  ko,
  seed,
  width,
  height,
}: Screen & { fire: FireValue; side: Side; label: string; ko: boolean; seed: number }) {
  const size = width * (ko ? 0.95 : 0.8);
  const cx = width / 2 + side * width * (ko ? 0 : 0.1);
  const cy = height * 0.4;
  const tilt = (seed % 15) - 7;
  const { scale, opacity } = useFiredPop(fire, HIT_CODES, ko ? 1300 : 520);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${tilt}deg` }],
  }));
  const plainLabel = useVariant(fire, Fire.hit);
  const wrongLabel = useVariant(fire, Fire.wrongWay);
  const plainArt = wordArt(label);
  const wrongArt = ko ? plainArt : ComicArt.fxWrongWay;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.centered, { left: cx - size / 2, top: cy - size / 2, width: size, height: size }, style]}>
        <Animated.View style={[styles.overlay, plainLabel]}>
          <ArtImage art={plainArt} width={size} />
        </Animated.View>
        <Animated.View style={[styles.overlay, wrongLabel]}>
          <ArtImage art={wrongArt} width={size} />
        </Animated.View>
      </Animated.View>
      <DizzyStars fire={fire} cx={cx} cy={cy - size * 0.38} radius={size * 0.3} />
    </>
  );
}

export function DodgeEffect({
  fire,
  side,
  label,
  seed,
  width,
  height,
}: Screen & { fire: FireValue; side: Side; label: string; seed: number }) {
  const cx = width / 2 + side * width * 0.05;
  const cy = height * 0.45;

  const lines = useMemo(() => {
    const rnd = seeded(seed);
    const base = side > 0 ? 0 : Math.PI;
    return Array.from({ length: 12 }, () => {
      const a = base + (rnd() - 0.5) * 2.4;
      const r0 = width * (0.22 + rnd() * 0.15);
      const r1 = r0 + width * (0.3 + rnd() * 0.35);
      return {
        x1: cx + Math.cos(a) * r0,
        y1: cy + Math.sin(a) * r0,
        x2: cx + Math.cos(a) * r1,
        y2: cy + Math.sin(a) * r1,
        w: 3 + rnd() * 4,
      };
    });
  }, [seed, side, width, cx, cy]);

  const streak = useSharedValue(0);
  useOnFire(fire, DODGE_CODES, () => {
    'worklet';
    streak.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 340 }));
  });
  const streakStyle = useAnimatedStyle(() => ({
    opacity: streak.value,
    transform: [{ translateX: side * (1 - streak.value) * width * 0.12 }],
  }));

  const { scale, opacity } = useFiredPop(fire, DODGE_CODES, 520, 0.4);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${side * -8}deg` }],
  }));
  const plainLabel = useVariant(fire, Fire.dodge);
  const closeLabel = useVariant(fire, Fire.close);

  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, streakStyle]}>
        <Svg width={width} height={height}>
          {lines.map((l, i) => (
            <Line key={`o${i}`} {...l} stroke={Colors.ink} strokeWidth={l.w + 4} strokeLinecap="round" />
          ))}
          {lines.map((l, i) => (
            <Line key={`f${i}`} {...l} stroke={Colors.paper} strokeWidth={l.w} strokeLinecap="round" />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dodgeLabel,
          { top: height * 0.28, width: width * 0.62 },
          side < 0 ? { left: width * 0.04 } : { right: width * 0.04 },
          labelStyle,
        ]}>
        <Animated.View style={plainLabel}>
          <ArtImage art={wordArt(label)} width={width * 0.6} />
        </Animated.View>
        <Animated.View style={[styles.overlay, closeLabel]}>
          <ArtImage art={ComicArt.fxCloseOne} width={width * 0.62} />
        </Animated.View>
      </Animated.View>
    </>
  );
}

/**
 * The reference video's red/green reveal: the half the punch landed on flashes
 * red, the safe half flashes green.
 */
export function SplitFlash({ fire, side, width }: { fire: FireValue; side: Side; width: number }) {
  const o = useSharedValue(0);
  useOnFire(fire, ANY_CODES, () => {
    'worklet';
    o.value = withSequence(withTiming(0.42, { duration: 50 }), withTiming(0, { duration: 380 }));
  });
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  const half = { position: 'absolute' as const, top: 0, bottom: 0, width: width / 2 };
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View style={[half, { left: 0, backgroundColor: side < 0 ? Colors.hitRed : Colors.safeGreen }]} />
      <View style={[half, { right: 0, backgroundColor: side > 0 ? Colors.hitRed : Colors.safeGreen }]} />
    </Animated.View>
  );
}

export function HitVignette({ fire, width, height }: Screen & { fire: FireValue }) {
  const o = useSharedValue(0);
  useOnFire(fire, HIT_CODES, () => {
    'worklet';
    o.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 600 }));
  });
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="vig" cx="50%" cy="50%" r="75%">
            <Stop offset="0.45" stopColor={Colors.hitRed} stopOpacity={0} />
            <Stop offset="1" stopColor={Colors.hitRed} stopOpacity={0.9} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#vig)" />
      </Svg>
    </Animated.View>
  );
}

/** Cracked-screen lines radiating from the knockout blow. */
export function KoCrack({ fire, side, width, height }: Screen & { fire: FireValue; side: Side }) {
  const cx = width / 2 + side * width * 0.18;
  const cy = height * 0.44;
  const cracks = useMemo(() => {
    const rnd = seeded(4242);
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
      const len = Math.max(width, height) * (0.35 + rnd() * 0.4);
      const pts: string[] = [`${cx},${cy}`];
      for (let k = 1; k <= 6; k++) {
        const r = (len * k) / 6;
        const j = (rnd() - 0.5) * 34;
        pts.push(
          `${cx + Math.cos(a) * r - Math.sin(a) * j},${cy + Math.sin(a) * r + Math.cos(a) * j}`,
        );
      }
      return pts.join(' ');
    });
  }, [cx, cy, width, height]);
  const shown = useAnimatedStyle(() => ({ opacity: HIT_CODES.includes(fire.value) ? 1 : 0 }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shown]}>
      <Svg width={width} height={height}>
        {cracks.map((p, i) => (
          <Polyline key={`o${i}`} points={p} fill="none" stroke={Colors.ink} strokeWidth={8} strokeLinejoin="round" />
        ))}
        {cracks.map((p, i) => (
          <Polyline key={`w${i}`} points={p} fill="none" stroke={Colors.paper} strokeWidth={3} strokeLinejoin="round" />
        ))}
      </Svg>
    </Animated.View>
  );
}

export function CountdownPop({ value, width }: { value: number; width: number }) {
  const { scale, opacity } = usePop(value === 0 ? 450 : 420, 2.2);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centered, style]}>
      {value === 0 ? (
        <ArtImage art={ComicArt.fxFight} width={width * 0.86} />
      ) : (
        <ComicText size={width * 0.36}>{String(value)}</ComicText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centered: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dodgeLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
