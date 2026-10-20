import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { Colors, Fonts } from '@/theme';

/** Bangers' baseline sits this far down a line box (fraction of font size). */
const BASELINE = 0.86;

/**
 * Comic lettering: Bangers with one clean ink outline (a real SVG stroke under the
 * fill, no offset shadow). An invisible native Text sizes the box, so layout behaves
 * like ordinary text; the SVG draws the lettering on top once measured.
 *
 * The SVG gets generous slack around the measured box: native text measurement and
 * SVG glyph rendering differ slightly, and a tight canvas clips the last letter.
 * `maxWidth` shrinks the font until the text fits (labels inside fixed art).
 */
export function ComicText({
  children,
  size,
  color = Colors.paper,
  stroke,
  maxWidth,
  style,
}: {
  children: string;
  size: number;
  color?: string;
  /** Outline thickness outside the glyph, in dp. 0 = no outline. */
  stroke?: number;
  /** Shrink to fit within this width (dp). */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [fit, setFit] = useState<{ base: number; size: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const fs = fit && fit.base === size ? fit.size : size;
  const sw = stroke ?? Math.max(2, Math.round(fs * 0.08));
  const lineH = fs * 1.08;
  const lines = children.split('\n');

  const measure: TextStyle = {
    fontFamily: Fonts.comic,
    fontSize: fs,
    lineHeight: lineH,
    textAlign: 'center',
    includeFontPadding: false,
    color: 'transparent',
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (maxWidth && width > maxWidth + 0.5) {
      setFit({ base: size, size: Math.max(8, fs * (maxWidth / width)) });
      return;
    }
    if (!box || Math.abs(box.w - width) > 0.5 || Math.abs(box.h - height) > 0.5) {
      setBox({ w: width, h: height });
    }
  };

  const padX = sw + fs * 0.35;
  const padY = sw + fs * 0.15;
  const svgW = (box?.w ?? 0) + padX * 2;
  const svgH = (box?.h ?? 0) + padY * 2;

  return (
    <View style={[style, { width: box?.w ?? 0, height: box?.h ?? 0 }]} pointerEvents="none">
      {/* Measured in a very wide hidden lane so it never wraps to the parent's width:
          the SVG draws each line unwrapped, so a wrapped measurement would let the
          lettering spill over its neighbours. */}
      <View style={styles.measureLane}>
        <Text style={measure} onLayout={onLayout}>
          {children}
        </Text>
      </View>
      {box && (
        <Svg width={svgW} height={svgH} style={{ position: 'absolute', left: -padX, top: -padY }}>
          {lines.map((line, i) => (
            <OutlinedLine
              key={i}
              x={svgW / 2}
              y={padY + i * lineH + (lineH - fs) / 2 + fs * BASELINE}
              size={fs}
              line={line}
              color={color}
              sw={sw}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

function OutlinedLine({
  x,
  y,
  size,
  line,
  color,
  sw,
}: {
  x: number;
  y: number;
  size: number;
  line: string;
  color: string;
  sw: number;
}) {
  const common = { x, y, fontFamily: Fonts.comic, fontSize: size, textAnchor: 'middle' as const };
  return (
    <>
      {sw > 0 && (
        <SvgText {...common} fill={Colors.ink} stroke={Colors.ink} strokeWidth={sw * 2} strokeLinejoin="round">
          {line}
        </SvgText>
      )}
      <SvgText {...common} fill={color}>
        {line}
      </SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  measureLane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 4000,
    alignItems: 'flex-start',
    opacity: 0,
  },
});
