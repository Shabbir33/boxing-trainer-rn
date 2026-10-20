import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import type { Group, Material } from 'three';

import { FEINT_MS, RECOVER_MS, type GameEngine, type Side } from '@/game/engine';
import { Colors } from '@/theme';
import { makeToon, outlineMaterial } from './materials';

const OUTLINE = 1.07;

/** Where each glove rests at guard, and where a punch ends up (just in front of the camera). */
const GUARD = { x: 0.42, y: 0.12, z: 0 };
const TARGET = { x: 0.3, y: 0.02, z: 2.95 };
const WINDUP_BACK = 0.38;
const WINDUP_UP = 0.06;

type Vec3 = [number, number, number];

function Part({
  geometry,
  material,
  position,
  rotation,
  scale = [1, 1, 1],
}: {
  geometry: ReactNode;
  material: Material;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh material={material}>{geometry}</mesh>
      <mesh material={outlineMaterial} scale={OUTLINE}>
        {geometry}
      </mesh>
    </group>
  );
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pose {
  x: number;
  y: number;
  z: number;
  /** Turn-over: 0 = guard (knuckles up, back of hand to camera), 1 = knuckles at camera. */
  turn: number;
  /** Corkscrew around the knuckle axis, 0..1 of a half turn. */
  spin: number;
  tilt: number;
  glow: number;
  squash: number;
}

function guardPose(side: Side, t: number): Pose {
  return {
    x: side * GUARD.x + Math.sin(t * 1.3) * 0.025,
    y: GUARD.y + Math.sin(t * 2.4 + side) * 0.035,
    z: GUARD.z + Math.sin(t * 2.4 + side + 1) * 0.02,
    turn: 0,
    spin: 0,
    tilt: -side * 0.12,
    glow: 0,
    squash: 1,
  };
}

/** Dodge recovery at progress `p`: sail past the player's head, then pull back to guard. */
function sailPast(pose: Pose, p: number, targetX: number, side: Side) {
  const guard = { x: pose.x, y: pose.y, z: pose.z };
  const overX = targetX + side * 0.3;
  const overZ = TARGET.z + 1.4;
  if (p < 0.25) {
    const q = p / 0.25;
    pose.x = lerp(targetX, overX, q);
    pose.y = TARGET.y;
    pose.z = lerp(TARGET.z, overZ, q);
    pose.turn = 1;
    pose.spin = 1;
  } else {
    const q = easeInOut((p - 0.25) / 0.75);
    pose.x = lerp(overX, guard.x, q);
    pose.y = lerp(TARGET.y, guard.y, q);
    pose.z = lerp(overZ, guard.z, q);
    pose.turn = 1 - q;
    pose.spin = 1 - q;
  }
}

function computePose(engine: GameEngine | null, side: Side, now: number, t: number): Pose {
  const pose = guardPose(side, t);
  if (!engine) return pose;

  const plan = engine.current;
  const p = engine.phaseProgress(now);
  const punching = plan?.side === side;

  const windupX = pose.x;
  const windupY = pose.y + WINDUP_UP;
  const windupZ = pose.z - WINDUP_BACK;
  const targetX = side * TARGET.x;

  if (engine.phase === 'idle' && engine.activeFeint?.side === side) {
    const f = Math.min(1, (now - engine.activeFeint.start) / FEINT_MS);
    const s = Math.sin(Math.PI * f);
    pose.z += 0.55 * s;
    pose.y -= 0.05 * s;
    pose.turn = 0.45 * s;
  } else if (!punching) {
    // The off hand tucks back a little while the other one fires.
    if (engine.phase === 'windup' || engine.phase === 'strike' || engine.phase === 'contact') {
      pose.z -= 0.08;
    }
  } else if (engine.phase === 'windup') {
    const e = easeOutCubic(p);
    const jitter = Math.sin(now * 0.09) * 0.012 * p;
    pose.x = windupX + jitter;
    pose.y = lerp(pose.y, windupY, e);
    pose.z = lerp(pose.z, windupZ, e);
    pose.turn = -0.18 * e; // cock the wrist back
    pose.glow = p;
  } else if (engine.phase === 'strike') {
    const e = Math.pow(p, 2.2); // accelerate into the camera
    pose.x = lerp(windupX, targetX, e);
    pose.y = lerp(windupY, TARGET.y, e);
    pose.z = lerp(windupZ, TARGET.z, e);
    pose.turn = lerp(-0.18, 1, easeOutCubic(p));
    pose.spin = easeOutCubic(p);
    pose.tilt = 0;
    pose.glow = 1 - p * 0.5;
  } else if (engine.phase === 'contact') {
    // Verdict pending: the glove follows through instead of freezing. The camera
    // tracks the head, so it visibly passes beside a player who has slipped.
    sailPast(pose, (now - engine.phaseStart) / RECOVER_MS, targetX, side);
    pose.tilt = 0;
  } else if (engine.phase === 'recover') {
    if (engine.lastResult === 'dodge' || engine.viaContact) {
      // Timed in ms, not phase progress: a K.O. recovery is longer, and the sail must
      // continue at the same speed it had during `contact`.
      sailPast(pose, Math.min(1, (now - engine.phaseStart) / RECOVER_MS), targetX, side);
    } else {
      // Landed: squash on contact, hold for a beat, then retract.
      const guard = { x: pose.x, y: pose.y, z: pose.z };
      const hold = engine.lives === 0 ? 0.5 : 0.2;
      const q = p < hold ? 0 : easeOutCubic((p - hold) / (1 - hold));
      pose.squash = p < 0.12 ? 1 - 0.25 * Math.sin((p / 0.12) * Math.PI) : 1;
      pose.x = lerp(targetX, guard.x, q);
      pose.y = lerp(TARGET.y, guard.y, q);
      pose.z = lerp(TARGET.z - 0.1, guard.z, q);
      pose.turn = 1 - q;
      pose.spin = 1 - q;
    }
  }
  return pose;
}

export function Glove({ side, engine }: { side: Side; engine: GameEngine | null }) {
  const group = useRef<Group>(null);
  const body = useMemo(() => makeToon(Colors.gloveRed), []);
  const band = useMemo(() => makeToon(Colors.cuffWhite), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const pose = computePose(engine, side, performance.now(), state.clock.elapsedTime);
    g.position.set(pose.x, pose.y, pose.z);
    // Euler XYZ applies Z, then Y (corkscrew about the knuckle axis), then X (turn-over).
    g.rotation.set(pose.turn * (Math.PI / 2), side * pose.spin * Math.PI + -side * 0.25 * (1 - pose.spin), pose.tilt);
    const bulge = 1 / Math.sqrt(pose.squash);
    g.scale.set(bulge, pose.squash, bulge);
    // Wind-up telegraph: the glove heats up yellow.
    body.emissive.setRGB(pose.glow * 0.55, pose.glow * 0.35, 0);
  });

  // Modelled in guard: knuckles up (+y), back of the hand toward the camera (+z),
  // cuff below, thumb on the inner side toward the middle of the screen.
  const inner = -side;

  return (
    <group ref={group}>
      {/* Mitt */}
      <Part
        geometry={<sphereGeometry args={[0.3, 32, 24]} />}
        material={body}
        position={[0, 0.06, 0]}
        scale={[1, 1.18, 0.92]}
      />
      {/* Thumb, hugging the inner side */}
      <Part
        geometry={<capsuleGeometry args={[0.085, 0.2, 8, 16]} />}
        material={body}
        position={[inner * 0.26, -0.02, 0.07]}
        rotation={[0, 0, inner * 0.3]}
      />
      {/* Stripe on the back of the hand */}
      <Part
        geometry={<capsuleGeometry args={[0.035, 0.22, 6, 12]} />}
        material={band}
        position={[0, 0.06, 0.27]}
        rotation={[0.25, 0, 0]}
      />
      {/* Cuff */}
      <Part
        geometry={<cylinderGeometry args={[0.24, 0.21, 0.4, 24]} />}
        material={body}
        position={[0, -0.38, -0.01]}
      />
      {/* White cuff band */}
      <Part
        geometry={<cylinderGeometry args={[0.235, 0.232, 0.09, 24]} />}
        material={band}
        position={[0, -0.3, -0.01]}
      />
    </group>
  );
}
