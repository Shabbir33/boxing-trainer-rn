import { Pressable, StyleSheet, View } from 'react-native';

import { ComicText } from '@/effects/ComicText';
import { Colors } from '@/theme';

/**
 * Slanted sticker button from the comic UI: ink border, hard offset shadow,
 * and it sinks onto its shadow when pressed.
 */
export function ComicButton({
  label,
  onPress,
  color = Colors.pow,
  textColor = Colors.paper,
  size = 30,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <View style={styles.wrap}>
          <View style={[styles.face, styles.shadow]} />
          <View
            style={[
              styles.face,
              { backgroundColor: color },
              pressed && { transform: [{ skewX: '-10deg' }, { translateX: 3 }, { translateY: 5 }] },
            ]}>
            <View style={styles.unskew}>
              <ComicText size={size} color={textColor}>
                {label}
              </ComicText>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingRight: 5,
    paddingBottom: 6,
  },
  face: {
    borderWidth: 3.5,
    borderColor: Colors.ink,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    transform: [{ skewX: '-10deg' }],
  },
  shadow: {
    ...StyleSheet.absoluteFill,
    top: 6,
    left: 5,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.ink,
  },
  unskew: {
    transform: [{ skewX: '10deg' }],
  },
});
