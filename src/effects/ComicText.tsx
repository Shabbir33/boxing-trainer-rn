import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/theme';

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

/**
 * Comic-book lettering: Bangers with a thick ink outline and a drop shadow.
 * React Native has no text stroke, so the outline is eight offset ink copies.
 */
export function ComicText({
  children,
  size,
  color = Colors.paper,
  stroke,
  style,
  textStyle,
}: {
  children: string;
  size: number;
  color?: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const sw = stroke ?? Math.max(2, Math.round(size * 0.07));
  const base: TextStyle = {
    fontFamily: Fonts.comic,
    fontSize: size,
    lineHeight: size * 1.08,
    letterSpacing: size * 0.03,
    textAlign: 'center',
    includeFontPadding: false,
  };
  const ink = (dx: number, dy: number, key: string) => (
    <Text
      key={key}
      style={[
        base,
        textStyle,
        StyleSheet.absoluteFill,
        { color: Colors.ink, transform: [{ translateX: dx }, { translateY: dy }] },
      ]}>
      {children}
    </Text>
  );

  return (
    <View style={style} pointerEvents="none">
      {ink(sw * 1.4, sw * 1.9, 'shadow')}
      {DIRECTIONS.map(([dx, dy], i) => ink(dx * sw, dy * sw, String(i)))}
      <Text style={[base, textStyle, { color }]}>{children}</Text>
    </View>
  );
}
