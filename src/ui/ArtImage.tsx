import type { ReactNode } from 'react';
import { Image, ImageBackground, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import type { Art } from './comicArt';

/** A generated art piece at its natural aspect ratio, sized by width (or height). */
export function ArtImage({
  art,
  width,
  height,
  style,
}: {
  art: Art;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const w = width ?? (height ?? 0) * art.aspect;
  const h = height ?? w / art.aspect;
  return <Image source={art.source} style={[{ width: w, height: h }, style]} resizeMode="contain" />;
}

const FILL = { width: '100%', height: '100%' } as const;

/** Art stretched to fill a box, with content on top (panels, tags, value boxes). */
export function ArtPanel({
  art,
  style,
  children,
}: {
  art: Art;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    // imageStyle pins the art to the box; otherwise an unset width/height falls back
    // to the image's natural size (it does on web).
    <ImageBackground source={art.source} resizeMode="stretch" style={style} imageStyle={FILL}>
      {children}
    </ImageBackground>
  );
}
