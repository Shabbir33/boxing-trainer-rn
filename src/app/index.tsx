import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicText } from '@/effects/ComicText';
import { DIFFICULTY_ORDER, type DifficultyId } from '@/game/difficulty';
import { headTrackingAvailable, useHeadTrackingPermission } from '@/tracking';
import { Colors } from '@/theme';
import { ArtImage, ArtPanel } from '@/ui/ArtImage';
import { ComicArt, type Art } from '@/ui/comicArt';

type Control = 'head' | 'tap';

const CHIPS: Record<DifficultyId, { off: Art; on: Art }> = {
  easy: { off: ComicArt.chipEasy, on: ComicArt.chipEasyOn },
  normal: { off: ComicArt.chipNormal, on: ComicArt.chipNormalOn },
  hard: { off: ComicArt.chipHard, on: ComicArt.chipHardOn },
  pro: { off: ComicArt.chipPro, on: ComicArt.chipProOn },
};

/**
 * Measured from the approved mock (UI-Assets/Main-Menu.png, 752x1344). Vertical
 * centres are fractions of the usable height; sizes are fractions of the design
 * width D (the screen width, capped so tall phones keep the mock's proportions).
 */
const L = {
  titleTop: 0.006,
  titleWidth: 0.9,
  glovesCenter: 0.468,
  glovesWidth: 0.86,
  chipsCenter: 0.692,
  chipsWidth: 0.95,
  chipWidth: 0.245,
  chipOnScale: 1.2,
  controlsCenter: 0.755,
  controlsWidth: 0.62,
  toggleCenter: 0.812,
  toggleWidth: 0.52,
  /** The mock's pill is flatter than the art; drawn a little squashed to match. */
  toggleAspect: 4.2,
  fightCenter: 0.914,
  fightWidth: 0.92,
  noticeCenter: 0.85,
};

/** Positions a child centred on (cx, cy) in screen space. */
function Centered({ cx, cy, children }: { cx: number; cy: number; children: ReactNode }) {
  return (
    <View pointerEvents="box-none" style={[styles.abs, styles.center, { left: cx - 1000, top: cy - 1000, width: 2000, height: 2000 }]}>
      {children}
    </View>
  );
}

/** Gloves idle in guard: a slow bob and sway, like the in-game opponent. */
function Gloves({ width }: { width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 + t.value * 12 }, { rotate: `${-1.5 + t.value * 3}deg` }],
  }));
  return (
    <Animated.View entering={FadeIn.delay(150).duration(400)} style={style}>
      <ArtImage art={ComicArt.menuGloves} width={width} />
    </Animated.View>
  );
}

/** FIGHT! gently pulses to invite a tap; sinks when pressed. */
function FightButton({ width, onPress }: { width: number; onPress: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 520 }), withTiming(1, { duration: 520 })),
      -1,
      false,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Fight">
      {({ pressed }) => (
        <Animated.View style={[style, pressed && styles.pressed]}>
          <ArtImage art={ComicArt.btnFight} width={width} />
        </Animated.View>
      )}
    </Pressable>
  );
}

export default function MenuScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [control, setControl] = useState<Control>(headTrackingAvailable ? 'head' : 'tap');
  const [notice, setNotice] = useState<string | null>(null);
  const camera = useHeadTrackingPermission();

  const usable = height - insets.top - insets.bottom;
  const D = Math.min(width, usable * 0.6);
  const Y = (f: number) => insets.top + f * usable;
  const cx = width / 2;

  const chooseControl = (next: Control) => {
    if (next === 'head' && !headTrackingAvailable) {
      setNotice('HEAD CONTROL NEEDS THE APP BUILD - USING TAPS');
      return;
    }
    setControl(next);
    setNotice(null);
  };

  const fight = async () => {
    let mode = control;
    if (mode === 'head' && !camera.hasPermission) {
      const granted = camera.canRequestPermission && (await camera.requestPermission());
      if (!granted) {
        mode = 'tap';
        setControl('tap');
        setNotice('CAMERA IS OFF - THIS ROUND USES TAPS');
      }
    }
    router.push({ pathname: '/play', params: { difficulty, control: mode } });
  };

  const titleW = L.titleWidth * D;
  const slot = (L.chipsWidth * D) / DIFFICULTY_ORDER.length;
  const chipW = L.chipWidth * D;
  const toggleW = L.toggleWidth * D;
  const toggleH = toggleW / L.toggleAspect;

  return (
    <View style={styles.root}>
      {/* Explicit 100% size: otherwise the image keeps its natural size (it does on web). */}
      <Image source={ComicArt.menuBg.source} style={styles.background} resizeMode="cover" />

      <Centered cx={cx} cy={Y(L.glovesCenter)}>
        <Gloves width={L.glovesWidth * D} />
      </Centered>

      <Animated.View
        entering={ZoomIn.springify().damping(11)}
        style={[styles.abs, { left: cx - titleW / 2, top: Y(L.titleTop) }]}>
        <ArtImage art={ComicArt.menuTitle} width={titleW} />
      </Animated.View>

      {DIFFICULTY_ORDER.map((id, i) => {
        const active = id === difficulty;
        const art = active ? CHIPS[id].on : CHIPS[id].off;
        const w = active ? chipW * L.chipOnScale : chipW;
        return (
          <Centered key={id} cx={cx + (i - (DIFFICULTY_ORDER.length - 1) / 2) * slot} cy={Y(L.chipsCenter)}>
            <Animated.View entering={FadeInUp.delay(250 + i * 60).springify().damping(14)}>
              <Pressable
                onPress={() => setDifficulty(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={id}
                hitSlop={6}>
                <ArtImage art={art} width={w} />
              </Pressable>
            </Animated.View>
          </Centered>
        );
      })}

      <Centered cx={cx} cy={Y(L.controlsCenter)}>
        <ArtImage art={ComicArt.controlsLabel} width={L.controlsWidth * D} />
      </Centered>

      <Centered cx={cx} cy={Y(L.toggleCenter)}>
        <View style={{ width: toggleW, height: toggleH }}>
          <ArtPanel art={control === 'head' ? ComicArt.toggleHead : ComicArt.toggleTap} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.row]}>
            <Pressable
              style={[styles.half, !headTrackingAvailable && styles.disabledHalf]}
              onPress={() => chooseControl('head')}
              accessibilityRole="button"
              accessibilityState={{ selected: control === 'head', disabled: !headTrackingAvailable }}
              accessibilityLabel="Head control"
            />
            <Pressable
              style={styles.half}
              onPress={() => chooseControl('tap')}
              accessibilityRole="button"
              accessibilityState={{ selected: control === 'tap' }}
              accessibilityLabel="Tap control"
            />
          </View>
        </View>
      </Centered>

      {notice && (
        <Centered cx={cx} cy={Y(L.noticeCenter)}>
          <ComicText size={Math.max(12, D * 0.032)} color={Colors.pow}>
            {notice}
          </ComicText>
        </Centered>
      )}

      <Centered cx={cx} cy={Y(L.fightCenter)}>
        <Animated.View entering={ZoomIn.delay(450).springify().damping(10)}>
          <FightButton width={L.fightWidth * D} onPress={fight} />
        </Animated.View>
      </Centered>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.night,
    overflow: 'hidden',
  },
  abs: {
    position: 'absolute',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
  disabledHalf: {
    backgroundColor: 'rgba(11,5,24,0.45)',
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});
