import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicText } from '@/effects/ComicText';
import { Heart } from '@/effects/shapes';
import { LIVES } from '@/game/engine';
import { Colors } from '@/theme';
import { ArtPanel } from '@/ui/ArtImage';
import { ComicArt } from '@/ui/comicArt';

export interface HudState {
  lives: number;
  thrown: number;
  total: number;
  score: number;
  combo: number;
}

function ComboBadge({ combo }: { combo: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (combo >= 2) {
      scale.value = withSequence(withTiming(1.5, { duration: 80 }), withTiming(1, { duration: 160 }));
    }
  }, [combo, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (combo < 2) return null;
  return (
    <Animated.View style={style}>
      <ComicText size={26} color={Colors.gold}>{`x${combo} COMBO`}</ComicText>
    </Animated.View>
  );
}

export function Hud({ state, onClose }: { state: HudState; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View pointerEvents="box-none" style={styles.row}>
        <View style={styles.side}>
          <Pressable onPress={onClose} hitSlop={16} style={styles.close}>
            <ComicText size={26}>✕</ComicText>
          </Pressable>
          <View style={styles.hearts}>
            {Array.from({ length: LIVES }, (_, i) => (
              <Heart key={i} size={26} filled={i < state.lives} />
            ))}
          </View>
        </View>
        <ArtPanel art={ComicArt.rowTag} style={styles.scoreTag}>
          <ComicText size={26}>{String(state.score)}</ComicText>
        </ArtPanel>
      </View>
      <View pointerEvents="none" style={[styles.center, { top: insets.top + 6 }]}>
        <ArtPanel art={ComicArt.rowTag} style={styles.counterTag}>
          <ComicText size={30}>{`${state.thrown}/${state.total}`}</ComicText>
        </ArtPanel>
        <ComboBadge combo={state.combo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  side: {
    gap: 8,
  },
  scoreTag: {
    width: 112,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterTag: {
    width: 116,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    alignSelf: 'flex-start',
  },
  hearts: {
    flexDirection: 'row',
    gap: 4,
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
});
