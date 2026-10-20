import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

import { FEINT_MS, RECOVER_MS, type GameEngine, type Side } from '@/game/engine';
import { Colors } from '@/theme';
import { makeCuffGeometry, makeMittGeometry, makeThumbGeometry } from './gloveGeometry';
import { makeSurface } from './materials';
import { Part } from './Part';

/**
 * Guard stance of an orthodox opponent facing the player. Their lead (left) hand is
 * on screen right: a little further forward and lower. The rear hand guards the chin.
 */
const GUARD: Record<Side, { x: number; y: number; z: number }> = {
  1: { x: 0.36, y: 0.02, z: 0.3 },
  [-1]: { x: 0.4, y: 0.16, z: -0.05 },
};
/** Where a punch ends up: just in front of the camera. */
const TARGET = { x: 0.3, y: 0.02, z: 2.95 };
const WINDUP_BACK = 0.38;
const WINDUP_UP = 0.06;
/** Gloves toe in so the knuckles angle toward the centre line. */
const GUARD_YAW = 0.32;
/** Tops lean in toward the face; cuffs point down toward the tucked elbows. */
const GUARD_TILT = 0.14;
/** Slight forward tip so the knuckle roll faces the player. */
const GUARD_TURN = 0.38;
/** Small corkscrew at impact (knuckles level out). */
const STRIKE_YAW = 0.18;
/** Boxer's bounce on the toes, shared by both hands. */
const BOUNCE_HZ = 1.45;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pose {
  x: number;
  y: number;
  z: number;
  /** Pitch: guard tip (~0.16) .. 1 = knuckles pointing at the camera. */
  turn: number;
  /** Rotation about the forearm axis; becomes the corkscrew once the glove is pitched. */
  yaw: number;
  /** Lean of the glove top toward the centre line. */
  tilt: number;
  glow: number;
  squash: number;
}

/**
 * Idle guard. The whole body bounces and weaves, so both gloves share the big
 * motions; each hand adds its own small, slower drift so they never move in lockstep.
 */
function guardPose(side: Side, t: number): Pose {
  const g = GUARD[side];
  const bounce = Math.sin(t * Math.PI * 2 * BOUNCE_HZ);
  const weave = Math.sin(t * 0.85);
  const breathe = Math.sin(t * 0.6 + 0.8);
  const drift = Math.sin(t * 1.9 + side * 1.7);
  return {
    x: side * g.x + weave * 0.045 + drift * 0.008,
    y: g.y + Math.abs(bounce) * 0.03 - 0.015 + drift * 0.01,
    z: g.z + breathe * 0.03,
    turn: GUARD_TURN + bounce * 0.025,
    yaw: -side * GUARD_YAW + weave * 0.06,
    tilt: side * GUARD_TILT + weave * 0.04 + drift * 0.02,
    glow: 0,
    squash: 1,
  };
}

/** Dodge recovery at progress `p`: sail past the player's head, then pull back to guard. */
function sailPast(pose: Pose, p: number, targetX: number, side: Side) {
  const guard = { ...pose };
  const overX = targetX + side * 0.3;
  const overZ = TARGET.z + 1.4;
  if (p < 0.25) {
    const q = p / 0.25;
    pose.x = lerp(targetX, overX, q);
    pose.y = TARGET.y;
    pose.z = lerp(TARGET.z, overZ, q);
    pose.turn = 1;
    pose.yaw = side * STRIKE_YAW;
    pose.tilt = 0;
  } else {
    const q = easeInOut((p - 0.25) / 0.75);
    pose.x = lerp(overX, guard.x, q);
    pose.y = lerp(TARGET.y, guard.y, q);
    pose.z = lerp(overZ, guard.z, q);
    pose.turn = lerp(1, guard.turn, q);
    pose.yaw = lerp(side * STRIKE_YAW, guard.yaw, q);
    pose.tilt = lerp(0, guard.tilt, q);
  }
}

function computePose(engine: GameEngine | null, side: Side, now: number, t: number): Pose {
  const pose = guardPose(side, t);
  if (!engine) return pose;
  const guard = { ...pose };

  const plan = engine.current;
  const p = engine.phaseProgress(now);
  const punching = plan?.side === side;

  const windupY = guard.y + WINDUP_UP;
  const windupZ = guard.z - WINDUP_BACK;
  const targetX = side * TARGET.x;

  if (engine.phase === 'idle' && engine.activeFeint?.side === side) {
    const f = Math.min(1, (now - engine.activeFeint.start) / FEINT_MS);
    const s = Math.sin(Math.PI * f);
    pose.z += 0.55 * s;
    pose.y -= 0.05 * s;
    pose.turn = lerp(guard.turn, 0.6, s);
  } else if (!punching) {
    // The off hand tucks back a little while the other one fires.
    if (engine.phase === 'windup' || engine.phase === 'strike' || engine.phase === 'contact') {
      pose.z -= 0.08;
      pose.y += 0.03;
    }
  } else if (engine.phase === 'windup') {
    const e = easeOutCubic(p);
    const jitter = Math.sin(now * 0.09) * 0.012 * p;
    pose.x = guard.x + jitter;
    pose.y = lerp(guard.y, windupY, e);
    pose.z = lerp(guard.z, windupZ, e);
    pose.turn = lerp(guard.turn, guard.turn - 0.3, e); // cock the wrist back
    pose.glow = p;
  } else if (engine.phase === 'strike') {
    const e = Math.pow(p, 2.2); // accelerate into the camera
    const r = easeOutCubic(p);
    pose.x = lerp(guard.x, targetX, e);
    pose.y = lerp(windupY, TARGET.y, e);
    pose.z = lerp(windupZ, TARGET.z, e);
    pose.turn = lerp(guard.turn - 0.3, 1, r);
    pose.yaw = lerp(guard.yaw, side * STRIKE_YAW, r);
    pose.tilt = lerp(guard.tilt, 0, r);
    pose.glow = 1 - p * 0.5;
  } else if (engine.phase === 'contact') {
    // Verdict pending: the glove follows through instead of freezing. The camera
    // tracks the head, so it visibly passes beside a player who has slipped.
    sailPast(pose, (now - engine.phaseStart) / RECOVER_MS, targetX, side);
  } else if (engine.phase === 'recover') {
    if (engine.lastResult === 'dodge' || engine.viaContact) {
      // Timed in ms, not phase progress: a K.O. recovery is longer, and the sail must
      // continue at the same speed it had during `contact`.
      sailPast(pose, Math.min(1, (now - engine.phaseStart) / RECOVER_MS), targetX, side);
    } else {
      // Landed: squash on contact, hold for a beat, then retract.
      const hold = engine.lives === 0 ? 0.5 : 0.2;
      const q = p < hold ? 0 : easeOutCubic((p - hold) / (1 - hold));
      pose.squash = p < 0.12 ? 1 - 0.25 * Math.sin((p / 0.12) * Math.PI) : 1;
      pose.x = lerp(targetX, guard.x, q);
      pose.y = lerp(TARGET.y, guard.y, q);
      pose.z = lerp(TARGET.z - 0.1, guard.z, q);
      pose.turn = lerp(1, guard.turn, q);
      pose.yaw = lerp(side * STRIKE_YAW, guard.yaw, q);
      pose.tilt = lerp(0, guard.tilt, q);
    }
  }
  return pose;
}

export function Glove({ side, engine }: { side: Side; engine: GameEngine | null }) {
  const group = useRef<Group>(null);
  const body = useMemo(() => makeSurface(Colors.gloveRed, { gloss: true }), []);
  const band = useMemo(() => makeSurface(Colors.cuffWhite), []);
  const strap = useMemo(() => makeSurface(Colors.cuffNavy), []);
  const mitt = useMemo(() => makeMittGeometry(), []);
  const thumb = useMemo(() => makeThumbGeometry(), []);
  const cuff = useMemo(() => makeCuffGeometry(0.2, 0.185, 0.4), []);
  const strapGeo = useMemo(() => makeCuffGeometry(0.212, 0.205, 0.15), []);
  const stripe = useMemo(() => makeCuffGeometry(0.216, 0.214, 0.022), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const pose = computePose(engine, side, performance.now(), state.clock.elapsedTime);
    g.position.set(pose.x, pose.y, pose.z);
    // Euler XYZ applies tilt (Z), then yaw (Y), then the pitch toward the camera (X);
    // once pitched, the yaw acts as the corkscrew around the punch direction.
    g.rotation.set(pose.turn * (Math.PI / 2), pose.yaw, pose.tilt);
    const bulge = 1 / Math.sqrt(pose.squash);
    g.scale.set(bulge, pose.squash, bulge);
    // Wind-up telegraph: the glove heats up yellow.
    body.emissive.setRGB(pose.glow * 0.3, pose.glow * 0.2, 0);
  });

  // Thumb on the inner side (toward the centre of the screen).
  const inner = -side;

  return (
    <group ref={group}>
      <Part geometry={mitt} material={body} position={[0, 0.06, 0]} />
      {/* Thumb: rises along the inner side, tip stitched to the knuckle roll */}
      <Part
        geometry={thumb}
        material={body}
        position={[inner * 0.25, 0.08, -0.03]}
        rotation={[-0.3, 0, inner * 0.28]}
        outline={1.1}
      />
      <Part geometry={cuff} material={body} position={[0, -0.42, -0.02]} outline={[1.07, 1.01, 1.07]} />
      {/* Navy wrist strap with white piping */}
      <Part geometry={strapGeo} material={strap} position={[0, -0.39, -0.02]} outline={[1.05, 1.02, 1.05]} />
      <Part geometry={stripe} material={band} position={[0, -0.325, -0.02]} outline={false} />
      <Part geometry={stripe} material={band} position={[0, -0.455, -0.02]} outline={false} />
    </group>
  );
}
