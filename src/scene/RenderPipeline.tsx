import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
  type Camera,
  type Object3D,
} from 'three';

import { Colors } from '@/theme';
import { surfaceUniforms } from './materials';

/** Layer for everything behind the gloves; rendered soft. Gloves stay on layer 0. */
export const BACKGROUND_LAYER = 1;
/** Background renders at this fraction of screen resolution (also cheaper). */
const BG_SCALE = 0.5;
/** Blur radius in density-independent pixels: a gentle depth-of-field, not a smear. */
const BLUR_DP = 1.6;
/** Sunset haze mixed into the background so the gloves pop forward. */
const HAZE = 0.14;
/** "Soften" mode (behind menus): whole scene at this resolution, blurred twice. */
const SOFT_SCALE = 0.25;
/** How dark the softened scene gets, toward deep violet. */
const SOFT_DARKEN = 0.58;
const SOFT_FADE_S = 0.28;

const CLEAR = new Color(Colors.skyTop);

/** Halftone cell size in density-independent pixels. */
export const HALFTONE_DP = 6;

const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 3x3 Gaussian over the half-res background, then a little haze and desaturation. */
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tBg;
uniform vec2 uStep;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform vec3 uDark;
uniform float uDarken;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tBg, vUv).rgb * 0.25;
  c += texture2D(tBg, vUv + vec2(uStep.x, 0.0)).rgb * 0.125;
  c += texture2D(tBg, vUv - vec2(uStep.x, 0.0)).rgb * 0.125;
  c += texture2D(tBg, vUv + vec2(0.0, uStep.y)).rgb * 0.125;
  c += texture2D(tBg, vUv - vec2(0.0, uStep.y)).rgb * 0.125;
  c += texture2D(tBg, vUv + uStep).rgb * 0.0625;
  c += texture2D(tBg, vUv - uStep).rgb * 0.0625;
  c += texture2D(tBg, vUv + vec2(uStep.x, -uStep.y)).rgb * 0.0625;
  c += texture2D(tBg, vUv + vec2(-uStep.x, uStep.y)).rgb * 0.0625;
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(grey), 0.12);
  c = mix(c, uHaze, uHazeAmt);
  c = mix(c, uDark, uDarken);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

const noop = () => {};

/**
 * Renders without presenting. On native, R3F's `gl.render` also calls expo-gl's
 * `endFrameEXP`, which would show the half-built frame; mute it for this pass.
 */
function renderPass(gl: WebGLRenderer, scene: Object3D, camera: Camera) {
  const ctx = gl.getContext() as unknown as { endFrameEXP?: () => void };
  const present = ctx.endFrameEXP;
  if (typeof present !== 'function') {
    gl.render(scene, camera);
    return;
  }
  ctx.endFrameEXP = noop;
  try {
    gl.render(scene, camera);
  } finally {
    ctx.endFrameEXP = present;
  }
}

interface Pipeline {
  targets: [WebGLRenderTarget, WebGLRenderTarget];
  composite: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial };
}

function createPipeline(): Pipeline {
  const material = new ShaderMaterial({
    vertexShader: COMPOSITE_VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tBg: { value: null },
      uStep: { value: new Vector2() },
      uHaze: { value: new Color(Colors.skyPink) },
      uHazeAmt: { value: HAZE },
      uDark: { value: new Color(Colors.nightDeep) },
      uDarken: { value: 0 },
    },
  });
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), material));
  return {
    targets: [
      new WebGLRenderTarget(1, 1, { depthBuffer: true }),
      new WebGLRenderTarget(1, 1, { depthBuffer: false }),
    ],
    composite: { scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material },
  };
}

function fitTarget(target: WebGLRenderTarget, width: number, height: number) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (target.width !== w || target.height !== h) target.setSize(w, h);
}

/**
 * Takes over the frame. Normally: background (layer 1) at half resolution, softened
 * and hazed, then the gloves (layer 0) sharp on top. With `soften` (menus over the
 * game), the whole scene goes soft: quarter resolution, blurred twice, darkened.
 */
export function RenderPipeline({ soften = false }: { soften?: boolean }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const mix = useRef(0);

  // GPU resources live in a ref: they're mutated every frame, outside React.
  const pipe = useRef<Pipeline | null>(null);
  if (pipe.current === null) pipe.current = createPipeline();

  useEffect(() => {
    const current = pipe.current;
    return () => current?.targets.forEach((t) => t.dispose());
  }, []);

  useFrame(({ gl: renderer, scene, camera }, delta) => {
    const { targets, composite } = pipe.current!;
    // Clears are explicit below; the passes must not wipe each other.
    renderer.autoClear = false;
    renderer.setClearColor(CLEAR, 1);

    mix.current = Math.min(1, Math.max(0, mix.current + (soften ? delta : -delta) / SOFT_FADE_S));
    const m = mix.current;
    const soft = m > 0.001;
    const scale = soft ? SOFT_SCALE : BG_SCALE;
    const [a, b] = targets;
    fitTarget(a, size.width * dpr * scale, size.height * dpr * scale);
    const u = composite.material.uniforms;
    const texels = BLUR_DP * dpr * scale * (soft ? 1.6 : 1);
    u.uStep.value.set(texels / a.width, texels / a.height);

    // 1. Scene into the low-res target. Halftone cells shrink to match so dots keep their size.
    surfaceUniforms.uDot.value = HALFTONE_DP * dpr * scale;
    if (soft) camera.layers.enableAll();
    else camera.layers.set(BACKGROUND_LAYER);
    renderer.setRenderTarget(a);
    renderer.clear();
    renderPass(renderer, scene, camera);

    if (soft) {
      // 2a. Extra blur pass (a -> b), then blur + darken onto the screen. That presents.
      fitTarget(b, a.width, a.height);
      u.tBg.value = a.texture;
      u.uHazeAmt.value = 0;
      u.uDarken.value = 0;
      renderer.setRenderTarget(b);
      renderPass(renderer, composite.scene, composite.camera);

      u.tBg.value = b.texture;
      u.uHazeAmt.value = HAZE * m;
      u.uDarken.value = SOFT_DARKEN * m;
      renderer.setRenderTarget(null);
      renderer.clear();
      camera.layers.set(0);
      renderer.render(composite.scene, composite.camera);
      return;
    }

    // 2. Soft background onto the screen.
    u.tBg.value = a.texture;
    u.uHazeAmt.value = HAZE;
    u.uDarken.value = 0;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderPass(renderer, composite.scene, composite.camera);

    // 3. Gloves, sharp, on top. This is the pass that presents the frame.
    surfaceUniforms.uDot.value = HALFTONE_DP * dpr;
    camera.layers.set(0);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }, 1);

  return null;
}
