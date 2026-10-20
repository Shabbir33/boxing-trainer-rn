import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicText } from '@/effects/ComicText';
import {
  CountdownPop,
  DodgeEffect,
  Fire,
  HitEffect,
  HitVignette,
  KoCrack,
  SplitFlash,
  type FireValue,
} from '@/effects/Effects';
import { DIFFICULTIES, type DifficultyId } from '@/game/difficulty';
import { GameEngine, LIVES, type GameEvent, type RoundStats, type Side } from '@/game/engine';
import { recordScore } from '@/game/bests';
import { buzz, initFeedback, playSfx } from '@/game/feedback';
import { HeadPanel, LeanMeter, type TrackingStatus } from '@/hud/HeadPanel';
import { Hud, type HudState } from '@/hud/Hud';
import { Results } from '@/hud/Results';
import { Arena } from '@/scene/Arena';
import { HeadModel, headTrackingAvailable, type FaceSample } from '@/tracking';
import { Colors } from '@/theme';

const HIT_WORDS = ['POW!', 'BAM!', 'WHAM!', 'SMACK!', 'BONK!'];
const DODGE_WORDS = ['WHOOSH!', 'SLIP!', 'NOPE!', 'SWISH!'];
/** No face for this long counts as lost; taps take over until it's found again. */
const FACE_LOST_MS = 600;

/** Effects for one punch, mounted hidden ahead of impact and started via `fire`. */
interface PunchFx {
  id: number;
  side: Side;
  ko: boolean;
  hitLabel: string;
  dodgeLabel: string;
  fire: FireValue;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export default function PlayScreen() {
  const params = useLocalSearchParams<{ difficulty?: string; control?: string }>();
  const difficulty = DIFFICULTIES[params.difficulty as DifficultyId] ?? DIFFICULTIES.normal;
  const headMode = params.control === 'head' && headTrackingAvailable;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [engine, setEngine] = useState(() => new GameEngine(difficulty, performance.now()));
  const [hud, setHud] = useState<HudState>({
    lives: LIVES,
    thrown: 0,
    total: difficulty.punches,
    score: 0,
    combo: 0,
  });
  const [punchFx, setPunchFx] = useState<PunchFx[]>([]);
  const nextFx = useRef<PunchFx | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ ko: boolean; stats: RoundStats; newBest: boolean } | null>(null);
  const [hasDodged, setHasDodged] = useState(false);
  const [tracking, setTracking] = useState<TrackingStatus>('searching');
  const [headModel] = useState(() => new HeadModel());
  const lastFaceAt = useRef(-Infinity);
  const lean = useSharedValue(0);
  /** Side the incoming punch lands on (0 = none); colours the lean meter. */
  const threat = useSharedValue(0);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }));

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const startRound = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPunchFx([]);
    nextFx.current = null;
    setResult(null);
    setCountdown(null);
    setHud({ lives: LIVES, thrown: 0, total: difficulty.punches, score: 0, combo: 0 });
    threat.set(0);
    headModel.reset();
    setEngine(new GameEngine(difficulty, performance.now()));
  };

  useEffect(() => {
    initFeedback();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const shake = (strength: number) => {
    const s = strength;
    shakeX.set(withSequence(
      withTiming(s, { duration: 35 }),
      withTiming(-s * 0.8, { duration: 45 }),
      withTiming(s * 0.5, { duration: 45 }),
      withTiming(-s * 0.25, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    ));
    shakeY.set(withSequence(
      withTiming(-s * 0.6, { duration: 40 }),
      withTiming(s * 0.5, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    ));
  };

  const handleEvents = (events: GameEvent[]) => {
    for (const ev of events) {
      switch (ev.type) {
        case 'countdown':
          setCountdown(ev.value);
          if (ev.value > 0) buzz('tick');
          else playSfx('bell');
          if (ev.value === 0) later(() => setCountdown(null), 700);
          break;
        case 'ready': {
          // Mount the next punch's effects now, while nothing is moving fast; keep the
          // previous set, which may still be fading out.
          const fx: PunchFx = {
            id: nextId.current++,
            side: ev.side,
            ko: ev.ko,
            hitLabel: ev.ko ? 'K.O.!' : pick(HIT_WORDS),
            dodgeLabel: pick(DODGE_WORDS),
            fire: makeMutable<number>(Fire.waiting),
          };
          nextFx.current = fx;
          setPunchFx((list) => [...list.slice(-1), fx]);
          break;
        }
        case 'windup':
          threat.set(ev.side);
          break;
        case 'dodge': {
          threat.set(0);
          playSfx('whoosh');
          buzz('dodge');
          if (ev.close || ev.combo % 3 === 0) playSfx('chime');
          nextFx.current?.fire.set(ev.close ? Fire.close : Fire.dodge);
          setHud((h) => ({ ...h, thrown: h.thrown + 1, score: h.score + ev.points, combo: ev.combo }));
          break;
        }
        case 'hit': {
          threat.set(0);
          const ko = ev.livesLeft === 0;
          playSfx('punch');
          buzz(ko ? 'ko' : 'hit');
          if (ko) playSfx('ko');
          shake(ko ? 28 : 18);
          nextFx.current?.fire.set(ev.wrongWay ? Fire.wrongWay : Fire.hit);
          setHud((h) => ({ ...h, thrown: h.thrown + 1, lives: ev.livesLeft, combo: 0 }));
          break;
        }
        case 'over':
          if (!ev.ko) playSfx('bell');
          setResult({ ko: ev.ko, stats: ev.stats, newBest: recordScore(difficulty.id, ev.stats.score).isNewBest });
          break;
      }
    }
  };

  // The render loop calls this from outside React; keep it pointed at the latest closure.
  const onEvents = useRef(handleEvents);
  useLayoutEffect(() => {
    onEvents.current = handleEvents;
  });

  // Camera samples arrive outside React at the detector's frame rate. Only status
  // transitions touch React state; the lean itself goes straight to the engine.
  const handleSample = (sample: FaceSample | null) => {
    const now = performance.now();
    if (!sample) {
      if (now - lastFaceAt.current > FACE_LOST_MS && tracking !== 'lost' && tracking !== 'searching') {
        setTracking('lost');
        engine.setHeadTarget(0, now);
        lean.set(0);
      }
      return;
    }
    lastFaceAt.current = now;
    if (engine.phase === 'countdown') {
      headModel.calibrate(sample);
      if (tracking !== 'calibrating') setTracking('calibrating');
      return;
    }
    if (tracking !== 'tracking') setTracking('tracking');
    const x = headModel.lean(sample, engine.phase === 'idle');
    engine.setHeadTarget(x, now);
    lean.set(x);
  };
  // Tap mode: the meter mirrors the tap lean, so both control schemes read the same.
  const onFrame = useRef(() => {});
  useLayoutEffect(() => {
    onFrame.current = headMode ? () => {} : () => lean.set(engine.headX);
  });

  const onSample = useRef(handleSample);
  const onCameraError = useRef((error: Error) => {
    console.warn('[head-tracking]', error.message);
    setTracking('error');
  });
  useLayoutEffect(() => {
    onSample.current = handleSample;
  });

  const dodge = (side: Side) => {
    engine.dodge(side, performance.now());
    if (!hasDodged) setHasDodged(true);
  };

  // Arrow keys on web make desk testing easier.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Dev-only handle for scripted testing in the browser.
    if (__DEV__) (window as unknown as { __engine?: GameEngine }).__engine = engine;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') engine.dodge(-1, performance.now());
      if (e.key === 'ArrowRight') engine.dodge(1, performance.now());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
        <Arena engine={engine} onEvents={onEvents} onFrame={onFrame} soften={result !== null} />

        {/* Effects clear when the results menu opens (it sits over a softened scene). */}
        {!result && punchFx.map((fx) => (
          <View key={fx.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <SplitFlash fire={fx.fire} side={fx.side} width={width} />
            <HitVignette fire={fx.fire} width={width} height={height} />
            {fx.ko && <KoCrack fire={fx.fire} side={fx.side} width={width} height={height} />}
            <DodgeEffect
              fire={fx.fire}
              side={fx.side}
              label={fx.dodgeLabel}
              seed={fx.id * 131 + 7}
              width={width}
              height={height}
            />
            <HitEffect
              fire={fx.fire}
              side={fx.side}
              label={fx.hitLabel}
              ko={fx.ko}
              seed={fx.id * 97 + 13}
              width={width}
              height={height}
            />
          </View>
        ))}
      </Animated.View>

      {/* Tap zones: tap the side you want to slip your head toward. */}
      <View style={styles.zones}>
        <Pressable style={styles.zone} onPressIn={() => dodge(-1)} />
        <Pressable style={styles.zone} onPressIn={() => dodge(1)} />
      </View>

      {countdown !== null && <CountdownPop key={countdown} value={countdown} width={width} />}

      {headMode && (
        <HeadPanel
          lean={lean}
          threat={threat}
          status={tracking}
          onSample={onSample}
          onError={onCameraError}
          bottomInset={insets.bottom}
          hidden={result !== null}
        />
      )}

      {!headMode && !result && (
        <View pointerEvents="none" style={[styles.tapPanel, { bottom: insets.bottom + 16 }]}>
          {!hasDodged && countdown === null && (
            <View style={styles.hint}>
              <ComicText size={22}>◀ SLIP</ComicText>
              <ComicText size={16} color={Colors.whoosh}>
                TAP AWAY FROM THE PUNCH
              </ComicText>
              <ComicText size={22}>SLIP ▶</ComicText>
            </View>
          )}
          <LeanMeter lean={lean} threat={threat} />
        </View>
      )}

      {!result && <Hud state={hud} onClose={() => router.back()} />}

      {result && (
        <Results
          ko={result.ko}
          stats={result.stats}
          newBest={result.newBest}
          total={difficulty.punches}
          onRetry={startRound}
          onMenu={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.night,
    overflow: 'hidden',
  },
  zones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  zone: {
    flex: 1,
  },
  tapPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 10,
  },
  hint: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
