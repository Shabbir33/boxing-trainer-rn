import { BackSide, Color, MeshBasicMaterial, MeshToonMaterial, type WebGLProgramParametersWithUniforms } from 'three';

import { Colors } from '@/theme';

/**
 * Uniforms shared by every surface, so an art style can retune the whole scene at once.
 * `uDot` is the halftone cell size in device pixels (set from the pixel ratio).
 */
export const surfaceUniforms = {
  uDot: { value: 7 },
  uHalftone: { value: 1 },
  /** Shadows lean cool, like a printed comic's overlaid blue plate. */
  uShadowTint: { value: new Color('#6A5ACD') },
  uRimColor: { value: new Color(Colors.skyOrange) },
};

/**
 * Comic print shading, replacing the lit result entirely:
 *  - facets facing the key light: flat local colour;
 *  - turning away: dots of the shadow colour, growing facet by facet (Ben-Day ramp);
 *  - facing away: solid shadow colour (same hue, darker, slightly cool);
 *  - edges facing the back light: an orange rim; glossy parts get a hard white glint.
 * Light 0 is the key, light 1 the rim (see Arena).
 */
const COMIC_GLSL = /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec3 n = normalize(normal);
  vec3 shadowCol = base * mix(vec3(1.0), uShadowTint, 0.35) * 0.58;
  float ndl = 1.0;
  float rim = 0.0;
  float glint = 0.0;
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    ndl = dot(n, L);
    #ifdef COMIC_GLOSS
      vec3 h = normalize(L + normalize(vViewPosition));
      glint = step(0.975, dot(n, h));
    #endif
  #endif
  #if NUM_DIR_LIGHTS > 1
    rim = step(0.55, dot(n, directionalLights[1].direction)) * step(ndl, 0.3);
  #endif

  vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / uDot);
  float d = length(fract(p) - 0.5);
  float r = mix(0.12, 0.46, smoothstep(0.35, -0.2, ndl));
  float dots = (1.0 - smoothstep(r - 0.04, r + 0.04, d)) * step(ndl, 0.35);
  float shadow = step(ndl, -0.2);
  float ink = max(shadow, dots * uHalftone);

  vec3 col = mix(base, shadowCol, ink);
  col = mix(col, mix(base, uRimColor, 0.55), rim * 0.85);
  col = mix(col, vec3(1.0), glint * 0.9);
  outgoingLight = col + totalEmissiveRadiance;
}
`;

function addComicShading(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, surfaceUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      'void main() {',
      'uniform float uDot;\nuniform float uHalftone;\nuniform vec3 uShadowTint;\nuniform vec3 uRimColor;\nvoid main() {',
    )
    .replace('#include <opaque_fragment>', `${COMIC_GLSL}\n#include <opaque_fragment>`);
}

/** Flat-faceted surface with comic print shading; used for everything solid. */
export function makeSurface(color: string, { gloss = false }: { gloss?: boolean } = {}) {
  const m = new MeshToonMaterial({ color });
  // Toon materials don't declare `flatShading`, but the renderer honours it on any material.
  (m as MeshToonMaterial & { flatShading: boolean }).flatShading = true;
  if (gloss) m.defines = { COMIC_GLOSS: '' };
  m.onBeforeCompile = addComicShading;
  m.customProgramCacheKey = () => (gloss ? 'comic-gloss' : 'comic');
  return m;
}

/** Unlit flat colour for lamps and the sun. */
export function makeFlat(color: string) {
  return new MeshBasicMaterial({ color, fog: false });
}

/** Rendered on an enlarged back-face copy of each part to draw an ink outline. */
export const outlineMaterial = new MeshBasicMaterial({ color: Colors.ink, side: BackSide });
