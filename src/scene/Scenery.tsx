import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
  type Group,
} from 'three';

import { seeded } from '@/effects/shapes';
import { Colors } from '@/theme';
import { makeFlat, makeSurface, outlineMaterial, surfaceUniforms } from './materials';
import { groupMatrix, mergeParts, type PartSpec, type Vec3 } from './merge';
import { BACKGROUND_LAYER } from './RenderPipeline';

/** Canvas height of the ring; everything stands on this. */
export const FLOOR_Y = -1.6;
/** Ring corners. The view is narrow in portrait, so the ring is too. */
const RING_X = 2.0;
const RING_BACK_Z = -4;
const RING_FRONT_Z = 3.4;

// ---------------------------------------------------------------------------
// Sky: a vertical sunset gradient with faint halftone toward the top.

const SKY_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 cGold, cOrange, cPink, cViolet, cTop;
uniform float uDot, uHalftone;
varying float vY;
void main() {
  float y = vY;
  vec3 c = mix(cGold, cOrange, smoothstep(-1.0, 4.0, y));
  c = mix(c, cPink, smoothstep(3.0, 8.0, y));
  c = mix(c, cViolet, smoothstep(7.0, 13.0, y));
  c = mix(c, cTop, smoothstep(12.0, 20.0, y));
  vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / (uDot * 1.4));
  float d = length(fract(p) - 0.5);
  float r = 0.32 * smoothstep(2.0, 16.0, y);
  float dotMask = 1.0 - smoothstep(r - 0.05, r + 0.05, d);
  c *= 1.0 - 0.18 * dotMask * uHalftone;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        depthWrite: false,
        fog: false,
        uniforms: {
          cGold: { value: new Color(Colors.skyGold) },
          cOrange: { value: new Color(Colors.skyOrange) },
          cPink: { value: new Color(Colors.skyPink) },
          cViolet: { value: new Color(Colors.skyViolet) },
          cTop: { value: new Color(Colors.skyTop) },
          uDot: surfaceUniforms.uDot,
          uHalftone: surfaceUniforms.uHalftone,
        },
      }),
    [],
  );
  return (
    <mesh position={[0, 12, -34]} material={material} renderOrder={-1}>
      <planeGeometry args={[140, 70]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Everything solid is described as data and baked into a few merged meshes
// (see merge.ts): the whole arena draws in 4 calls instead of ~130.

const MOUNTAINS: { x: number; z: number; h: number; r: number; near: boolean; turn: number }[] = [
  { x: -14, z: -27, h: 9, r: 7, near: false, turn: 0.3 },
  { x: -4, z: -29, h: 11, r: 8, near: false, turn: 0.9 },
  { x: 9, z: -28, h: 8, r: 7, near: false, turn: 0.1 },
  { x: -9, z: -24, h: 6.5, r: 6, near: true, turn: 0.6 },
  { x: 3, z: -23, h: 5.5, r: 6, near: true, turn: 0.2 },
  { x: 14, z: -24, h: 7, r: 6, near: true, turn: 0.75 },
];

const STEPS = [
  { z: -7.6, top: -1.15 },
  { z: -8.4, top: -0.6 },
  { z: -9.2, top: -0.05 },
  { z: -10.0, top: 0.5 },
];
const SHIRTS = ['#E8262F', '#2F5BD3', '#FFC75A', '#5BC0EB', '#9B5DE5', '#F15BB5', '#F4F1EA', '#FF7A3D'];
const SKIN = ['#F2C9A0', '#D9A066', '#A86B3C', '#7A4A2A'];

const ROPES: { y: number; color: string }[] = [
  { y: FLOOR_Y + 0.5, color: Colors.ringBlue },
  { y: FLOOR_Y + 0.95, color: Colors.ropeWhite },
  { y: FLOOR_Y + 1.4, color: Colors.gloveRed },
];
const ROPE_HULL: Vec3 = [1.8, 1, 1.8];
const LIGHT_TOP = 3.6;

/** Five-point star outline, for the logo printed on the canvas. */
function starShape(outer: number, inner: number) {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Dims a crowd colour toward the bleachers so the ring and gloves stay the focus. */
const dim = (hex: string) => `#${new Color(hex).lerp(new Color(Colors.bleacher), 0.35).getHexString()}`;

/** Light rig transforms: the pole base, and the tilted lamp panel on top of it. */
function rigMatrix(side: number) {
  return groupMatrix([side * 3.4 * 1.15, 0, -10.8]);
}
function panelMatrix(side: number) {
  return rigMatrix(side).multiply(groupMatrix([0, LIGHT_TOP + 0.35, 0], [0.18, -side * 0.35, 0]));
}

/** Solid scenery: mountains, stands and crowd, light poles, ring. */
function solidParts(): PartSpec[] {
  const parts: PartSpec[] = [];
  const cache = new Map<string, BufferGeometry>();
  const geo = (key: string, make: () => BufferGeometry) => {
    let g = cache.get(key);
    if (!g) {
      g = make();
      cache.set(key, g);
    }
    return g;
  };

  for (const m of MOUNTAINS) {
    parts.push({
      geometry: new ConeGeometry(m.r, m.h, 5, 1),
      color: m.near ? Colors.mountainNear : Colors.mountainFar,
      position: [m.x, FLOOR_Y + m.h / 2 - 1, m.z],
      rotation: [0, m.turn, 0],
      outline: 1.02,
    });
  }

  for (const st of STEPS) {
    const h = st.top - (FLOOR_Y - 0.2);
    parts.push({
      geometry: new BoxGeometry(18, h, 0.8),
      color: Colors.bleacher,
      position: [0, FLOOR_Y - 0.2 + h / 2, st.z],
      outline: [1, 1.02, 1.04],
    });
  }
  const rnd = seeded(77);
  const body = geo('body', () => new BoxGeometry(0.34, 0.44, 0.26));
  const head = geo('head', () => new IcosahedronGeometry(0.14, 0));
  for (const st of STEPS) {
    for (let x = -7.5; x <= 7.5; x += 0.52) {
      if (rnd() < 0.08) continue; // a few empty seats
      const fx = x + (rnd() - 0.5) * 0.16;
      const fz = st.z + (rnd() - 0.5) * 0.12;
      const turn = (rnd() - 0.5) * 0.6;
      const shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
      const skin = SKIN[Math.floor(rnd() * SKIN.length)];
      parts.push({
        geometry: body,
        color: dim(shirt),
        position: [fx, st.top + 0.22, fz],
        rotation: [0, turn, 0],
        outline: 1.1,
      });
      parts.push({
        geometry: head,
        color: skin,
        position: [fx, st.top + 0.58, fz],
        rotation: [0, turn * 2, 0],
        scale: [1, 1.1, 1],
        outline: 1.14,
      });
    }
  }

  for (const side of [-1, 1]) {
    parts.push({
      geometry: geo('pole', () => new CylinderGeometry(0.07, 0.09, LIGHT_TOP - FLOOR_Y, 6)),
      color: Colors.lampPanel,
      position: [0, (LIGHT_TOP + FLOOR_Y) / 2, 0],
      outline: [1.5, 1, 1.5],
      parent: rigMatrix(side),
    });
    parts.push({
      geometry: geo('panel', () => new BoxGeometry(1.4, 0.95, 0.14)),
      color: Colors.lampPanel,
      outline: 1.05,
      parent: panelMatrix(side),
    });
  }

  const depth = RING_FRONT_Z - RING_BACK_Z;
  const postH = 1.75;
  parts.push({
    geometry: new PlaneGeometry(60, 40),
    color: Colors.arenaFloor,
    position: [0, FLOOR_Y - 0.21, -6],
    rotation: [-Math.PI / 2, 0, 0],
    outline: false,
  });
  parts.push({
    geometry: new BoxGeometry(RING_X * 2 + 0.3, 0.2, depth + 0.3),
    color: Colors.ringBlue,
    position: [0, FLOOR_Y - 0.1, (RING_FRONT_Z + RING_BACK_Z) / 2],
    outline: [1.004, 1.06, 1.002],
  });
  parts.push({
    geometry: new ShapeGeometry(starShape(1.1, 0.45)),
    color: Colors.ringLogo,
    position: [0, FLOOR_Y + 0.002, -0.6],
    rotation: [-Math.PI / 2, 0, 0],
    outline: false,
  });
  for (const side of [-1, 1]) {
    parts.push({
      geometry: geo('post', () => new CylinderGeometry(0.09, 0.09, postH, 6)),
      color: Colors.postBlue,
      position: [side * RING_X, FLOOR_Y + postH / 2, RING_BACK_Z],
      outline: [1.4, 1.02, 1.4],
    });
    parts.push({
      geometry: geo('pad', () => new BoxGeometry(0.24, 0.16, 0.24)),
      color: Colors.ropeWhite,
      position: [side * RING_X, FLOOR_Y + postH + 0.06, RING_BACK_Z],
    });
  }
  for (const r of ROPES) {
    parts.push({
      geometry: geo('ropeBack', () => new CylinderGeometry(0.04, 0.04, RING_X * 2, 6)),
      color: r.color,
      position: [0, r.y, RING_BACK_Z],
      rotation: [0, 0, Math.PI / 2],
      outline: ROPE_HULL,
    });
    for (const side of [-1, 1]) {
      parts.push({
        geometry: geo('ropeSide', () => new CylinderGeometry(0.04, 0.04, depth, 6)),
        color: r.color,
        position: [side * RING_X, r.y, (RING_FRONT_Z + RING_BACK_Z) / 2],
        rotation: [Math.PI / 2, 0, 0],
        outline: ROPE_HULL,
      });
    }
  }
  return parts;
}

/**
 * Unlit discs (sun, stadium lamps), each with an ink rim drawn as a slightly larger
 * disc behind it, since back-face hulls cannot outline open shapes.
 */
function discParts(): PartSpec[] {
  const parts: PartSpec[] = [];
  const disc = (
    radius: number,
    segments: number,
    color: string,
    position: Vec3,
    rim: number,
    parent?: PartSpec['parent'],
  ) => {
    parts.push({
      geometry: new CircleGeometry(radius * (1 + rim), segments),
      color: Colors.ink,
      position: [position[0], position[1], position[2] - 0.01],
      outline: false,
      parent,
    });
    parts.push({ geometry: new CircleGeometry(radius, segments), color, position, outline: false, parent });
  };
  disc(3.2, 10, Colors.sun, [6, 2.2, -32], 0.04);
  for (const side of [-1, 1]) {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        disc(0.15, 8, Colors.lamp, [(c - 1) * 0.42, r * 0.42 - 0.21, 0.09], 0.18, panelMatrix(side));
      }
    }
  }
  return parts;
}

/**
 * Everything around the gloves, on the background layer (rendered soft, see
 * RenderPipeline). Static: built once into merged meshes.
 */
export function Scenery() {
  const root = useRef<Group>(null);
  const built = useMemo(() => {
    const solid = mergeParts(solidParts());
    return {
      solid,
      discs: mergeParts(discParts()).surface,
      surface: makeSurface('#FFFFFF', { vertexColors: true }),
      flat: makeFlat('#FFFFFF', true),
    };
  }, []);
  useLayoutEffect(() => {
    root.current?.traverse((o) => o.layers.set(BACKGROUND_LAYER));
  }, []);
  return (
    <group ref={root}>
      <Sky />
      <mesh geometry={built.solid.surface} material={built.surface} />
      <mesh geometry={built.solid.hull} material={outlineMaterial} />
      <mesh geometry={built.discs} material={built.flat} />
    </group>
  );
}
