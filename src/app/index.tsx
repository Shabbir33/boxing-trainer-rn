import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComicText } from '@/effects/ComicText';
import { Burst } from '@/effects/shapes';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '@/game/difficulty';
import { ComicButton } from '@/hud/Results';
import { headTrackingAvailable, useHeadTrackingPermission } from '@/tracking';
import { Colors, Fonts } from '@/theme';

type Control = 'head' | 'tap';
const CONTROLS: { id: Control; label: string }[] = [
  { id: 'head', label: 'HEAD (CAMERA)' },
  { id: 'tap', label: 'TAP' },
];

export default function MenuScreen() {
  const { width } = useWindowDimensions();
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [control, setControl] = useState<Control>(headTrackingAvailable ? 'head' : 'tap');
  const [notice, setNotice] = useState<string | null>(null);
  const camera = useHeadTrackingPermission();

  const fight = async () => {
    let mode = control;
    if (mode === 'head' && !camera.hasPermission) {
      const granted = camera.canRequestPermission && (await camera.requestPermission());
      if (!granted) {
        mode = 'tap';
        setControl('tap');
        setNotice('Camera access is off, so this round uses taps. Enable it in Settings for head control.');
      }
    }
    router.push({ pathname: '/play', params: { difficulty, control: mode } });
  };
  const burst = Math.min(width * 0.95, 420);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <View style={[styles.burst, { width: burst, height: burst }]}>
          <Burst size={burst} seed={21} fill={Colors.gloveRed} innerFill={Colors.gloveRedDark} />
        </View>
        <ComicText size={burst * 0.13}>{"DON'T GET"}</ComicText>
        <ComicText size={burst * 0.17} color={Colors.pow}>
          KNOCKED OUT
        </ComicText>
      </View>

      <View style={styles.controls}>
        <Text style={styles.caption}>DIFFICULTY</Text>
        <View style={styles.chips}>
          {DIFFICULTY_ORDER.map((id) => {
            const active = id === difficulty;
            return (
              <Pressable
                key={id}
                onPress={() => setDifficulty(id)}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {DIFFICULTIES[id].label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.caption}>CONTROLS</Text>
        <View style={styles.chips}>
          {CONTROLS.map(({ id, label }) => {
            const active = id === control;
            const disabled = id === 'head' && !headTrackingAvailable;
            return (
              <Pressable
                key={id}
                disabled={disabled}
                onPress={() => {
                  setControl(id);
                  setNotice(null);
                }}
                style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.sub}>
          {notice ??
            (!headTrackingAvailable
              ? 'Head control needs the development build. Using taps.'
              : `${DIFFICULTIES[difficulty].punches} punches · 3 lives · ${
                  control === 'head' ? 'lean away from the punch' : 'tap away from the punch'
                }`)}
        </Text>
        <ComicButton label="FIGHT!" onPress={fight} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.night,
    paddingHorizontal: 16,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {
    position: 'absolute',
    transform: [{ rotate: '-6deg' }],
  },
  controls: {
    gap: 14,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  caption: {
    fontFamily: Fonts.comic,
    fontSize: 20,
    letterSpacing: 2,
    color: Colors.whoosh,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 3,
    borderColor: Colors.ink,
    borderRadius: 6,
    backgroundColor: '#2A1A4F',
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.gloveRed,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontFamily: Fonts.comic,
    fontSize: 18,
    letterSpacing: 1,
    color: '#B8AEDB',
  },
  chipTextActive: {
    color: Colors.paper,
  },
  sub: {
    color: '#B8AEDB',
    textAlign: 'center',
    fontSize: 14,
  },
});
