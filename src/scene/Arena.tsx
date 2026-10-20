import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { memo, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GameEngine, GameEvent } from '@/game/engine';
import { Colors } from '@/theme';
import { Glove } from './Glove';

const CAMERA_Z = 3.6;
/** How far the camera slides when the head is fully to one side. */
const HEAD_TRAVEL = 0.85;

/** Runs the game clock on the render loop so timing and visuals stay in lockstep. */
function GameLoop({
  engine,
  onEvents,
}: {
  engine: GameEngine | null;
  onEvents: RefObject<(events: GameEvent[]) => void>;
}) {
  useFrame(() => {
    if (!engine) return;
    const events = engine.tick(performance.now());
    if (events.length) onEvents.current?.(events);
  });
  return null;
}

function CameraRig({ engine }: { engine: GameEngine | null }) {
  const camera = useThree((s) => s.camera);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const head = engine?.headX ?? 0;
    let kick = 0;
    if (engine && engine.phase === 'recover' && engine.lastResult === 'hit') {
      kick = Math.max(0, 1 - (performance.now() - engine.resolvedAt) / 320);
    }
    camera.position.set(
      head * HEAD_TRAVEL + Math.sin(t * 40) * 0.03 * kick,
      Math.sin(t * 1.7) * 0.015 + Math.sin(t * 37) * 0.03 * kick,
      CAMERA_Z + 0.3 * kick,
    );
    camera.rotation.set(0.06 * kick, 0, -head * 0.1 + Math.sin(t * 31) * 0.04 * kick);
  });
  return null;
}

function Ring() {
  const ropes: [number, string][] = [
    [-0.95, Colors.hitRed],
    [-0.45, Colors.paper],
    [0.05, Colors.neonViolet],
  ];
  return (
    <group position={[0, 0, -4.5]}>
      {ropes.map(([y, color]) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[9, 0.05, 0.05]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
      {[-4.5, 4.5].map((x) => (
        <mesh key={x} position={[x, -0.6, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 2, 12]} />
          <meshBasicMaterial color={Colors.gloveRedDark} />
        </mesh>
      ))}
    </group>
  );
}

export const Arena = memo(function Arena({
  engine,
  onEvents,
}: {
  engine: GameEngine | null;
  onEvents: RefObject<(events: GameEvent[]) => void>;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas camera={{ position: [0, 0, CAMERA_Z], fov: 62, near: 0.05, far: 60 }}>
        <color attach="background" args={[Colors.night]} />
        <fog attach="fog" args={[Colors.night, 5, 15]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 3, 5]} intensity={2.4} />
        <directionalLight position={[-3, 1, 2]} intensity={0.6} color={Colors.neonPink} />

        <GameLoop engine={engine} onEvents={onEvents} />
        <CameraRig engine={engine} />

        <gridHelper args={[40, 40, Colors.neonPink, Colors.neonViolet]} position={[0, -1.6, 0]} />
        <Ring />
        <Glove side={-1} engine={engine} />
        <Glove side={1} engine={engine} />
      </Canvas>
    </View>
  );
});
