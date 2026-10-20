import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import {
  BoxGeometry,
  Shape,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector3,
  Quaternion,
} from 'three';

import { seeded } from '@/effects/shapes';
import { Colors } from '@/theme';
import { makeFlat, makeSurface, outlineMaterial, surfaceUniforms } from './materials';
import { Part, type Vec3 } from './Part';
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

const inkFlat = makeFlat(Colors.ink);

/** Flat disc with an ink rim. Back-face hulls can't outline open shapes, so draw one behind. */
function Disc({
  radius,
  segments,
  color,
  position,
  rim = 0.1,
}: {
  radius: number;
  segments: number;
  color: string;
  position: Vec3;
  rim?: number;
}) {
  const material = useMemo(() => makeFlat(color), [color]);
  return (
    <group position={position}>
      <mesh material={inkFlat} position={[0, 0, -0.01]}>
        <circleGeometry args={[radius * (1 + rim), segments]} />
      </mesh>
      <mesh material={material}>
        <circleGeometry args={[radius, segments]} />
      </mesh>
    </group>
  );
}

function Sun() {
  return <Disc radius={3.2} segments={10} color={Colors.sun} position={[6, 2.2, -32]} rim={0.04} />;
}

const MOUNTAINS: { x: number; z: number; h: number; r: number; near: boolean; turn: number }[] = [
  { x: -14, z: -27, h: 9, r: 7, near: false, turn: 0.3 },
  { x: -4, z: -29, h: 11, r: 8, near: false, turn: 0.9 },
  { x: 9, z: -28, h: 8, r: 7, near: false, turn: 0.1 },
  { x: -9, z: -24, h: 6.5, r: 6, near: true, turn: 0.6 },
  { x: 3, z: -23, h: 5.5, r: 6, near: true, turn: 0.2 },
  { x: 14, z: -24, h: 7, r: 6, near: true, turn: 0.75 },
];

function Mountains() {
  const far = useMemo(() => makeSurface(Colors.mountainFar), []);
  const near = useMemo(() => makeSurface(Colors.mountainNear), []);
  return (
    <>
      {MOUNTAINS.map((m, i) => (
        <Part
          key={i}
          geometry={<coneGeometry args={[m.r, m.h, 5, 1]} />}
          material={m.near ? near : far}
          position={[m.x, FLOOR_Y + m.h / 2 - 1, m.z]}
          rotation={[0, m.turn, 0]}
          outline={1.02}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stands: stepped bleachers with an instanced low-poly crowd.

const STEPS = [
  { z: -7.6, top: -1.15 },
  { z: -8.4, top: -0.6 },
  { z: -9.2, top: -0.05 },
  { z: -10.0, top: 0.5 },
];
const SHIRTS = ['#E8262F', '#2F5BD3', '#FFC75A', '#5BC0EB', '#9B5DE5', '#F15BB5', '#F4F1EA', '#FF7A3D'];
const SKIN = ['#F2C9A0', '#D9A066', '#A86B3C', '#7A4A2A'];

interface Fan {
  x: number;
  y: number;
  z: number;
  turn: number;
  shirt: string;
  skin: string;
}

function makeCrowd(): Fan[] {
  const rnd = seeded(77);
  const fans: Fan[] = [];
  for (const step of STEPS) {
    for (let x = -7.5; x <= 7.5; x += 0.52) {
      if (rnd() < 0.08) continue; // a few empty seats
      fans.push({
        x: x + (rnd() - 0.5) * 0.16,
        y: step.top,
        z: step.z + (rnd() - 0.5) * 0.12,
        turn: (rnd() - 0.5) * 0.6,
        shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)],
        skin: SKIN[Math.floor(rnd() * SKIN.length)],
      });
    }
  }
  return fans;
}

/** One instanced mesh plus an instanced ink hull, placed from a per-instance transform. */
function InstancedParts({
  geometry,
  color,
  items,
  place,
  hull = 1.1,
}: {
  geometry: BoxGeometry | IcosahedronGeometry;
  color: (i: number) => string;
  items: number;
  place: (i: number, pos: Vector3, rot: Quaternion, scale: Vector3) => void;
  hull?: number;
}) {
  const body = useRef<InstancedMesh>(null);
  const ink = useRef<InstancedMesh>(null);
  const material = useMemo(() => makeSurface('#FFFFFF'), []);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const pos = new Vector3();
    const rot = new Quaternion();
    const scale = new Vector3();
    const c = new Color();
    for (let i = 0; i < items; i++) {
      place(i, pos, rot, scale);
      body.current?.setMatrixAt(i, m.compose(pos, rot, scale));
      body.current?.setColorAt(i, c.set(color(i)));
      ink.current?.setMatrixAt(i, m.compose(pos, rot, scale.multiplyScalar(hull)));
    }
    for (const mesh of [body.current, ink.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [items, place, color, hull]);

  return (
    <>
      <instancedMesh ref={body} args={[geometry, material, items]} />
      <instancedMesh ref={ink} args={[geometry, outlineMaterial, items]} />
    </>
  );
}

function Stands() {
  const bleacher = useMemo(() => makeSurface(Colors.bleacher), []);
  const fans = useMemo(() => makeCrowd(), []);
  const bodyGeo = useMemo(() => new BoxGeometry(0.34, 0.44, 0.26), []);
  const headGeo = useMemo(() => new IcosahedronGeometry(0.14, 0), []);
  // Dim the crowd toward the bleacher colour so the ring and gloves stay the focus.
  const shirts = useMemo(
    () => fans.map((f) => `#${new Color(f.shirt).lerp(new Color(Colors.bleacher), 0.35).getHexString()}`),
    [fans],
  );

  return (
    <>
      {STEPS.map((s) => {
        const h = s.top - (FLOOR_Y - 0.2);
        return (
          <Part
            key={s.z}
            geometry={<boxGeometry args={[18, h, 0.8]} />}
            material={bleacher}
            position={[0, FLOOR_Y - 0.2 + h / 2, s.z]}
            outline={[1, 1.02, 1.04]}
          />
        );
      })}
      <InstancedParts
        geometry={bodyGeo}
        items={fans.length}
        color={(i) => shirts[i]}
        place={(i, pos, rot, scale) => {
          const f = fans[i];
          pos.set(f.x, f.y + 0.22, f.z);
          rot.setFromAxisAngle(UP, f.turn);
          scale.set(1, 1, 1);
        }}
      />
      <InstancedParts
        geometry={headGeo}
        items={fans.length}
        color={(i) => fans[i].skin}
        place={(i, pos, rot, scale) => {
          const f = fans[i];
          pos.set(f.x, f.y + 0.58, f.z);
          rot.setFromAxisAngle(UP, f.turn * 2);
          scale.set(1, 1.1, 1);
        }}
        hull={1.14}
      />
    </>
  );
}

const UP = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Stadium lights: a pole and a lamp panel on each side.

function LightRig({ side }: { side: -1 | 1 }) {
  const pole = useMemo(() => makeSurface(Colors.lampPanel), []);
  const x = side * 3.4;
  const top = 3.6;
  const lamps: Vec3[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) lamps.push([(c - 1) * 0.42, r * 0.42 - 0.21, 0.09]);
  return (
    <group position={[x * 1.15, 0, -10.8]}>
      <Part
        geometry={<cylinderGeometry args={[0.07, 0.09, top - FLOOR_Y, 6]} />}
        material={pole}
        position={[0, (top + FLOOR_Y) / 2, 0]}
        outline={[1.5, 1, 1.5]}
      />
      <group position={[0, top + 0.35, 0]} rotation={[0.18, -side * 0.35, 0]}>
        <Part geometry={<boxGeometry args={[1.4, 0.95, 0.14]} />} material={pole} outline={1.05} />
        {lamps.map((p, i) => (
          <Disc key={i} radius={0.15} segments={8} color={Colors.lamp} position={p} rim={0.18} />
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The ring: canvas, corner posts and three ropes on the back and both sides.

const ROPES: { y: number; color: string }[] = [
  { y: FLOOR_Y + 0.5, color: Colors.ringBlue },
  { y: FLOOR_Y + 0.95, color: Colors.ropeWhite },
  { y: FLOOR_Y + 1.4, color: Colors.gloveRed },
];
const ROPE_HULL: Vec3 = [1.8, 1, 1.8];

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

function Ring() {
  const star = useMemo(() => starShape(1.1, 0.45), []);
  const logo = useMemo(() => makeSurface(Colors.ringLogo), []);
  const canvas = useMemo(() => makeSurface(Colors.ringBlue), []);
  const floor = useMemo(() => makeSurface(Colors.arenaFloor), []);
  const post = useMemo(() => makeSurface(Colors.postBlue), []);
  const pad = useMemo(() => makeSurface(Colors.ropeWhite), []);
  const ropes = useMemo(() => ROPES.map((r) => makeSurface(r.color)), []);
  const depth = RING_FRONT_Z - RING_BACK_Z;
  const postH = 1.75;

  return (
    <>
      <mesh material={floor} position={[0, FLOOR_Y - 0.21, -6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 40]} />
      </mesh>
      {/* Canvas sits on a shallow platform so its edge reads */}
      <Part
        geometry={<boxGeometry args={[RING_X * 2 + 0.3, 0.2, depth + 0.3]} />}
        material={canvas}
        position={[0, FLOOR_Y - 0.1, (RING_FRONT_Z + RING_BACK_Z) / 2]}
        outline={[1.004, 1.06, 1.002]}
      />
      <mesh material={logo} position={[0, FLOOR_Y + 0.002, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[star]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * RING_X, 0, RING_BACK_Z]}>
          <Part
            geometry={<cylinderGeometry args={[0.09, 0.09, postH, 6]} />}
            material={post}
            position={[0, FLOOR_Y + postH / 2, 0]}
            outline={[1.4, 1.02, 1.4]}
          />
          <Part
            geometry={<boxGeometry args={[0.24, 0.16, 0.24]} />}
            material={pad}
            position={[0, FLOOR_Y + postH + 0.06, 0]}
          />
        </group>
      ))}
      {ROPES.map((r, i) => (
        <group key={r.y}>
          {/* Back rope, post to post */}
          <Part
            geometry={<cylinderGeometry args={[0.04, 0.04, RING_X * 2, 6]} />}
            material={ropes[i]}
            position={[0, r.y, RING_BACK_Z]}
            rotation={[0, 0, Math.PI / 2]}
            outline={ROPE_HULL}
          />
          {/* Side ropes running toward the camera */}
          {[-1, 1].map((s) => (
            <Part
              key={s}
              geometry={<cylinderGeometry args={[0.04, 0.04, depth, 6]} />}
              material={ropes[i]}
              position={[s * RING_X, r.y, (RING_FRONT_Z + RING_BACK_Z) / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              outline={ROPE_HULL}
            />
          ))}
        </group>
      ))}
    </>
  );
}

/**
 * Everything around the gloves, on the background layer (rendered soft, see
 * RenderPipeline). Static, so it never re-renders after mount.
 */
export function Scenery() {
  const root = useRef<Group>(null);
  useLayoutEffect(() => {
    root.current?.traverse((o) => o.layers.set(BACKGROUND_LAYER));
  }, []);
  return (
    <group ref={root}>
      <Sky />
      <Sun />
      <Mountains />
      <Stands />
      <LightRig side={-1} />
      <LightRig side={1} />
      <Ring />
    </group>
  );
}
