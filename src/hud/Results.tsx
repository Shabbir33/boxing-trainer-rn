import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { ComicText } from '@/effects/ComicText';
import type { RoundStats } from '@/game/engine';
import { Colors, Fonts } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function ComicButton({
  label,
  onPress,
  color = Colors.pow,
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color },
        pressed && { transform: [{ translateY: 4 }], shadowOffset: { width: 0, height: 0 } },
      ]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Results({
  ko,
  stats,
  total,
  onRetry,
  onMenu,
}: {
  ko: boolean;
  stats: RoundStats;
  total: number;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const perfect = !ko && stats.hits === 0;
  const title = ko ? 'K.O.!' : perfect ? 'FLAWLESS!' : 'SURVIVED!';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.panel}>
        <ComicText size={64} color={ko ? Colors.hitRed : Colors.pow} style={styles.title}>
          {title}
        </ComicText>
        <Row label="Dodged" value={`${stats.dodged}/${total}`} />
        <Row label="Best combo" value={`x${stats.bestCombo}`} />
        <Row label="Close calls" value={String(stats.closeCalls)} />
        <Row
          label="Avg reaction"
          value={stats.avgReactionMs === null ? '—' : `${stats.avgReactionMs} ms`}
        />
        <Row label="Score" value={String(stats.score)} />
        <View style={styles.buttons}>
          <ComicButton label="TRY AGAIN?" onPress={onRetry} />
          <ComicButton label="MENU" onPress={onMenu} color={Colors.paper} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11,5,24,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.paper,
    borderWidth: 4,
    borderColor: Colors.ink,
    borderRadius: 6,
    padding: 20,
    gap: 6,
    transform: [{ rotate: '-2deg' }],
    shadowColor: Colors.ink,
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 12,
  },
  title: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#E4E0D8',
    paddingVertical: 6,
  },
  label: {
    fontFamily: Fonts.comic,
    fontSize: 22,
    color: '#55505F',
    letterSpacing: 1,
  },
  value: {
    fontFamily: Fonts.comic,
    fontSize: 24,
    color: Colors.ink,
    letterSpacing: 1,
  },
  buttons: {
    marginTop: 14,
    gap: 12,
  },
  button: {
    borderWidth: 3,
    borderColor: Colors.ink,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  buttonText: {
    fontFamily: Fonts.comic,
    fontSize: 28,
    color: Colors.ink,
    letterSpacing: 1.5,
  },
});
