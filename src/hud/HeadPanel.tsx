import { memo, type RefObject } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ComicText } from '@/effects/ComicText';
import { SAFE_THRESHOLD } from '@/game/engine';
import { HeadTrackerCamera, type FaceSample } from '@/tracking';
import { Colors } from '@/theme';
import { ArtImage } from '@/ui/ArtImage';
import { ComicArt, LEAN_BAR } from '@/ui/comicArt';

export type TrackingStatus = 'searching' | 'calibrating' | 'tracking' | 'lost' | 'error';

const STATUS_TEXT: Record<TrackingStatus, string | null> = {
  searching: 'SHOW YOUR FACE',
  calibrating: 'HOLD STILL...',
  tracking: null,
  lost: 'FACE LOST - TAP TO DODGE',
  error: 'CAMERA ERROR - TAP TO DODGE',
};

/** Isolated so per-frame lean updates and status changes never re-render the camera. */
const CameraWindow = memo(function CameraWindow({
  onSample,
  onError,
}: {
  onSample: RefObject<(s: FaceSample | null) => void>;
  onError: RefObject<(e: Error) => void>;
}) {
  if (!HeadTrackerCamera) return null;
  return (
    <View style={styles.window}>
      <HeadTrackerCamera onSample={onSample} onError={onError} />
    </View>
  );
});

/**
 * The comic lean meter: the generated gauge with a needle riding its track. The
 * mapping is piecewise so the engine's safe threshold lands exactly on the art's
 * green edge. During a punch, the punch-side zone flashes red and the safe side glows.
 */
export function LeanMeter({ lean, threat }: { lean: SharedValue<number>; threat: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 360);
  const h = w / ComicArt.leanBar.aspect;
  const left = LEAN_BAR.trackLeft * w;
  const right = LEAN_BAR.trackRight * w;
  const center = (left + right) / 2;
  const half = (right - left) / 2;
  const edge = LEAN_BAR.safeEdge;
  const barTop = LEAN_BAR.barTop * h;
  const barH = (LEAN_BAR.barBottom - LEAN_BAR.barTop) * h;
  const needleH = barH * 1.9;
  const needleW = needleH * ComicArt.leanMarker.aspect;
  const needleTop = LEAN_BAR.centerY * h - needleH / 2;
  const zoneW = half * (1 - edge);

  const needle = useAnimatedStyle(() => {
    const l = Math.max(-1, Math.min(1, lean.value));
    const a = Math.abs(l);
    const f = a < SAFE_THRESHOLD ? (a / SAFE_THRESHOLD) * edge : edge + ((a - SAFE_THRESHOLD) / (1 - SAFE_THRESHOLD)) * (1 - edge);
    return { transform: [{ translateX: Math.sign(l) * f * half }] };
  });
  const zone = (side: number) => {
    'worklet';
    const t = threat.value;
    if (t === 0) return { opacity: 0 };
    return t === side
      ? { opacity: 0.75, backgroundColor: Colors.hitRed }
      : { opacity: 0.45, backgroundColor: Colors.paper };
  };
  const leftZone = useAnimatedStyle(() => zone(-1));
  const rightZone = useAnimatedStyle(() => zone(1));

  return (
    <View style={{ width: w, height: h }}>
      <ArtImage art={ComicArt.leanBar} width={w} />
      <Animated.View style={[styles.zone, { left: left + 4, top: barTop + 3, width: zoneW - 4, height: barH - 6 }, leftZone]} />
      <Animated.View
        style={[styles.zone, { left: center + edge * half, top: barTop + 3, width: zoneW - 4, height: barH - 6 }, rightZone]}
      />
      <Animated.View style={[styles.needle, { left: center - needleW / 2, top: needleTop }, needle]}>
        <ArtImage art={ComicArt.leanMarker} height={needleH} />
      </Animated.View>
    </View>
  );
}

export function HeadPanel({
  lean,
  threat,
  status,
  onSample,
  onError,
  bottomInset,
  hidden = false,
}: {
  /** Hide without unmounting, so the camera keeps running behind menus. */
  hidden?: boolean;
  lean: SharedValue<number>;
  /** Side the incoming punch lands on, or 0 between punches. */
  threat: SharedValue<number>;
  status: TrackingStatus;
  onSample: RefObject<(s: FaceSample | null) => void>;
  onError: RefObject<(e: Error) => void>;
  bottomInset: number;
}) {
  const text = STATUS_TEXT[status];

  return (
    <View pointerEvents="none" style={[styles.root, { bottom: bottomInset + 16, opacity: hidden ? 0 : 1 }]}>
      {text && (
        <ComicText size={18} color={status === 'tracking' ? Colors.paper : Colors.gold}>
          {text}
        </ComicText>
      )}
      <CameraWindow onSample={onSample} onError={onError} />
      <LeanMeter lean={lean} threat={threat} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  window: {
    width: 84,
    height: 112,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.ink,
    overflow: 'hidden',
    backgroundColor: Colors.nightDeep,
  },
  zone: {
    position: 'absolute',
    borderRadius: 3,
  },
  needle: {
    position: 'absolute',
  },
});
