import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { ComicText } from '@/effects/ComicText';
import type { RoundStats } from '@/game/engine';
import { Colors } from '@/theme';
import { ArtImage, ArtPanel } from '@/ui/ArtImage';
import { ComicArt, type Art } from '@/ui/comicArt';

/**
 * Measured from the approved mock (UI-Assets/Try-Again-Menu.png, 752x1344).
 * Vertical placement is a fraction of the usable screen height and horizontal of the
 * width, so taller phones get a taller card (as the mock fills its frame).
 * Card internals are fractions of the card's own width (pw) and height (ph).
 */
const SCREEN = {
  titleTop: -0.004,
  titleWidth: 0.95,
  /** How far the title may hang over the card's top edge. */
  titleOverlap: 0.045,
  cardTop: 0.27,
  cardHeight: 0.5,
  cardAspect: 0.78, // width / height
  cardMaxWidth: 0.9,
  /** The mock's card is sheared, not rotated: sides stay upright, top and bottom rise right. */
  cardSkew: '-4.5deg',
  tryCenter: 0.84,
  menuCenter: 0.935,
};
const ROW = { firstCenter: 0.112, pitch: 0.142 }; // of ph
/** Label stickers carry their own lettering (generated art), sized by height. */
const TAG = { left: 0.125, height: 0.152 }; // of pw
const BADGE = { centerX: 0.115, size: 0.185 }; // of pw
const BAND = { left: 0.42, right: 0.945, height: 0.135 }; // of pw
const VALUE = { left: 0.665, right: 0.94, font: 0.115 }; // of pw
const SCORE = {
  box: { left: 0.065, right: 0.945, top: 0.64, bottom: 0.955 }, // x of pw, y of ph
  /** Burst fills the box; text is laid out inside its yellow centre (fractions of the burst). */
  burst: { width: 0.86, heightOfBox: 1.08, cx: 0.47 },
  label: { cy: 0.35, font: 0.2 },
  number: { cy: 0.64, font: 0.47, maxWidth: 0.56 },
  /** NEW BEST! sits on the box's top-right corner, as in the mock. */
  sticker: { width: 0.28 },
};
const SCORE_BLUE = '#2E86F2';

interface Card {
  pw: number;
  ph: number;
}

/** Centres a child on (cx, cy) without knowing its size. */
function At({ cx, cy, children }: { cx: number; cy: number; children: ReactNode }) {
  return (
    <View pointerEvents="none" style={[styles.abs, styles.center, { left: cx - 500, top: cy - 500, width: 1000, height: 1000 }]}>
      {children}
    </View>
  );
}

function StatRow({
  card,
  index,
  icon,
  label,
  value,
}: {
  card: Card;
  index: number;
  icon: Art;
  label: Art;
  value: string;
}) {
  const { pw, ph } = card;
  const cy = (ROW.firstCenter + ROW.pitch * index) * ph;
  const tagH = TAG.height * pw;
  const bandH = BAND.height * pw;
  const badge = BADGE.size * pw;
  const valueW = (VALUE.right - VALUE.left) * pw;
  return (
    <Animated.View entering={FadeInLeft.delay(220 + index * 70).springify().damping(14)} style={StyleSheet.absoluteFill}>
      <ArtPanel
        art={ComicArt.valueBox}
        style={[styles.abs, { left: BAND.left * pw, width: (BAND.right - BAND.left) * pw, top: cy - bandH / 2, height: bandH }]}
      />
      <ArtImage art={label} height={tagH} style={[styles.abs, { left: TAG.left * pw, top: cy - tagH / 2 }]} />
      <ArtImage
        art={icon}
        height={badge}
        style={[styles.abs, { left: BADGE.centerX * pw - (badge * icon.aspect) / 2, top: cy - badge / 2 }]}
      />
      <At cx={((VALUE.left + VALUE.right) / 2) * pw} cy={cy}>
        <ComicText size={VALUE.font * pw} maxWidth={valueW - 6}>
          {value}
        </ComicText>
      </At>
    </Animated.View>
  );
}

/** Light Ben-Day dots over the score box, like the printed panel in the mock. */
function Halftone() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="score-dots" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Circle cx={3.5} cy={3.5} r={1.5} fill="#FFFFFF" fillOpacity={0.18} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#score-dots)" />
    </Svg>
  );
}

function ScoreBox({ card, score, newBest }: { card: Card; score: number; newBest: boolean }) {
  const { pw, ph } = card;
  const b = SCORE.box;
  const boxLeft = b.left * pw;
  const boxW = (b.right - b.left) * pw;
  const boxTop = b.top * ph;
  const boxH = (b.bottom - b.top) * ph;
  const burstW = SCORE.burst.width * pw;
  const burstH = boxH * SCORE.burst.heightOfBox;
  const burstTop = boxTop + (boxH - burstH) / 2;
  const cx = SCORE.burst.cx * pw;
  const stickerW = SCORE.sticker.width * pw;
  const stickerH = stickerW / ComicArt.newBest.aspect;
  return (
    <Animated.View entering={ZoomIn.delay(520).springify().damping(10)} style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.abs, styles.scoreBox, { left: boxLeft, width: boxW, top: boxTop, height: boxH }]}>
        <Halftone />
      </View>
      <ArtPanel
        art={ComicArt.scoreBurst}
        style={[styles.abs, { left: cx - burstW / 2, width: burstW, top: burstTop, height: burstH }]}
      />
      <At cx={cx} cy={burstTop + SCORE.label.cy * burstH}>
        <ComicText size={SCORE.label.font * burstH} color={Colors.ink} stroke={0}>
          SCORE
        </ComicText>
      </At>
      <At cx={cx} cy={burstTop + SCORE.number.cy * burstH}>
        <ComicText size={SCORE.number.font * burstH} maxWidth={burstW * SCORE.number.maxWidth}>
          {String(score)}
        </ComicText>
      </At>
      {newBest && (
        <ArtImage
          art={ComicArt.newBest}
          width={stickerW}
          style={[
            styles.abs,
            { left: boxLeft + boxW - stickerW * 0.92, top: boxTop - stickerH * 0.12, transform: [{ rotate: '6deg' }] },
          ]}
        />
      )}
    </Animated.View>
  );
}

/** A generated button image that sinks a little when pressed. */
function ArtButton({ art, width, label, onPress }: { art: Art; width: number; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <ArtImage art={art} width={width} style={pressed && { transform: [{ scale: 0.95 }, { translateY: 3 }] }} />
      )}
    </Pressable>
  );
}

export function Results({
  ko,
  stats,
  total,
  newBest = false,
  onRetry,
  onMenu,
}: {
  ko: boolean;
  stats: RoundStats;
  total: number;
  newBest?: boolean;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usable = height - insets.top - insets.bottom;
  const Y = (f: number) => insets.top + f * usable;

  const perfect = !ko && stats.hits === 0;
  const title = ko ? ComicArt.titleKo : perfect ? ComicArt.titleFlawless : ComicArt.titleSurvived;
  // Taller title art (K.O.!) is capped so it overlaps only the card's frame, not the rows.
  const titleMaxH = (SCREEN.cardTop + SCREEN.titleOverlap - SCREEN.titleTop) * usable;
  const titleW = Math.min(SCREEN.titleWidth * width, titleMaxH * title.aspect);

  const ph = SCREEN.cardHeight * usable;
  const pw = Math.min(SCREEN.cardAspect * ph, SCREEN.cardMaxWidth * width);
  const card: Card = { pw, ph };
  // Buttons follow the mock's widths (~64% / 53% of the screen), not the card's.
  const tryW = Math.min(0.64 * width, 0.9 * pw, 0.11 * usable * ComicArt.btnTryAgain.aspect);
  const menuW = Math.min(0.53 * width, 0.8 * pw, 0.085 * usable * ComicArt.btnMenu.aspect);
  const tryH = tryW / ComicArt.btnTryAgain.aspect;
  const menuH = menuW / ComicArt.btnMenu.aspect;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.backdrop}>
      <Animated.View
        entering={FadeInDown.delay(120).springify().damping(15)}
        style={[styles.abs, { left: (width - pw) / 2, top: Y(SCREEN.cardTop) }]}>
        {/* Skew on an inner view: the entering animation owns the outer view's transform. */}
        <ArtPanel art={ComicArt.panel} style={{ width: pw, height: ph, transform: [{ skewY: SCREEN.cardSkew }] }}>
          <StatRow card={card} index={0} icon={ComicArt.iconGlove} label={ComicArt.labelDodged} value={`${stats.dodged}/${total}`} />
          <StatRow card={card} index={1} icon={ComicArt.iconCombo} label={ComicArt.labelBestCombo} value={`x${stats.bestCombo}`} />
          <StatRow card={card} index={2} icon={ComicArt.iconWarning} label={ComicArt.labelCloseCalls} value={String(stats.closeCalls)} />
          <StatRow
            card={card}
            index={3}
            icon={ComicArt.iconStopwatch}
            label={ComicArt.labelAvgReaction}
            value={stats.avgReactionMs === null ? '—' : `${stats.avgReactionMs}ms`}
          />
          <ScoreBox card={card} score={stats.score} newBest={newBest} />
        </ArtPanel>
      </Animated.View>

      <Animated.View
        entering={ZoomIn.springify().damping(11)}
        style={[styles.abs, { left: (width - titleW) / 2, top: Y(SCREEN.titleTop) }]}>
        <ArtImage art={title} width={titleW} />
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(380).springify().damping(14)}
        style={[styles.abs, { left: (width - tryW) / 2, top: Y(SCREEN.tryCenter) - tryH / 2 }]}>
        <ArtButton art={ComicArt.btnTryAgain} width={tryW} label="Try again" onPress={onRetry} />
      </Animated.View>
      <Animated.View
        entering={FadeInUp.delay(450).springify().damping(14)}
        style={[styles.abs, { left: (width - menuW) / 2, top: Y(SCREEN.menuCenter) - menuH / 2 }]}>
        <ArtButton art={ComicArt.btnMenu} width={menuW} label="Menu" onPress={onMenu} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    // The 3D scene behind is already blurred and darkened (Arena `soften`).
    backgroundColor: 'rgba(11,5,24,0.3)',
  },
  abs: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBox: {
    backgroundColor: SCORE_BLUE,
    borderWidth: 3,
    borderColor: Colors.ink,
    overflow: 'hidden',
  },
});
