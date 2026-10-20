import {
  BackSide,
  DataTexture,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from 'three';

import { Colors } from '@/theme';

/** Three hard light bands give the cel-shaded cartoon look. */
function makeToonRamp() {
  const tones = [70, 160, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new DataTexture(data, tones.length, 1, RGBAFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const toonRamp = makeToonRamp();

export function makeToon(color: string) {
  return new MeshToonMaterial({ color, gradientMap: toonRamp });
}

/** Rendered on an enlarged back-face copy of each part to draw an ink outline. */
export const outlineMaterial = new MeshBasicMaterial({ color: Colors.ink, side: BackSide });
