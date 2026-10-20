import { memo, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ComicText } from '@/effects/ComicText';
import { SAFE_THRESHOLD } from '@/game/engine';
import { HeadTrackerCamera, type FaceSample } from '@/tracking';
import { Colors } from '@/theme';

export type TrackingStatus = 'searching' | 'calibrating' | 'tracking' | 'lost' | 'error';

const METER_W = 180;
const DOT = 16;

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

const SAFE_ZONE = 'rgba(43,255,136,0.35)';
const SAFE_ZONE_LIT = 'rgba(43,255,136,0.9)';
const DANGER_ZONE = 'rgba(255,45,61,0.75)';

export function HeadPanel({
  lean,
  threat,
  status,
  onSample,
  onError,
  bottomInset,
}: {
  lean: SharedValue<number>;
  /** Side the incoming punch lands on, or 0 between punches. */
  threat: SharedValue<number>;
  status: TrackingStatus;
  onSample: RefObject<(s: FaceSample | null) => void>;
  onError: RefObject<(e: Error) => void>;
  bottomInset: number;
}) {
  // While a punch is coming, only the far side is green; the punch side turns red.
  const dotStyle = useAnimatedStyle(() => {
    const t = threat.value;
    const away = t === 0 ? Math.abs(lean.value) : -lean.value * t;
    const color =
      away >= SAFE_THRESHOLD
        ? Colors.safeGreen
        : t !== 0 && away <= -SAFE_THRESHOLD
          ? Colors.hitRed
          : Colors.paper;
    return {
      transform: [{ translateX: lean.value * (METER_W / 2) }],
      backgroundColor: color,
    };
  });
  const zoneColor = (zoneSide: number) => {
    'worklet';
    const t = threat.value;
    if (t === 0) return SAFE_ZONE;
    return t === zoneSide ? DANGER_ZONE : SAFE_ZONE_LIT;
  };
  const leftZoneStyle = useAnimatedStyle(() => ({ backgroundColor: zoneColor(-1) }));
  const rightZoneStyle = useAnimatedStyle(() => ({ backgroundColor: zoneColor(1) }));
  const text = STATUS_TEXT[status];
  const zone = (METER_W / 2) * (1 - SAFE_THRESHOLD);

  return (
    <View pointerEvents="none" style={[styles.root, { bottom: bottomInset + 16 }]}>
      {text && (
        <ComicText size={18} color={status === 'tracking' ? Colors.paper : Colors.gold}>
          {text}
        </ComicText>
      )}
      <CameraWindow onSample={onSample} onError={onError} />
      <View style={styles.meter}>
        <Animated.View style={[styles.zone, { left: 0, width: zone }, leftZoneStyle]} />
        <Animated.View style={[styles.zone, { right: 0, width: zone }, rightZoneStyle]} />
        <View style={styles.centerTick} />
        <Animated.View style={[styles.dot, dotStyle]} />
      </View>
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
  meter: {
    width: METER_W,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.ink,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  centerTick: {
    position: 'absolute',
    width: 2,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
});
