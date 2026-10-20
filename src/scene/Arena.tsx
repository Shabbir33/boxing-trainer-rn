import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { memo, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GameEngine, GameEvent } from '@/game/engine';
import { Colors } from '@/theme';
import { Glove } from './Glove';
import { RenderPipeline } from './RenderPipeline';
import { Scenery } from './Scenery';

const CAMERA_Z = 3.6;
/** How far the camera slides when the head is fully to one side. */
const HEAD_TRAVEL = 0.85;
/** Lights must reach both the sharp (gloves) and soft (background) layers. */
const ALL_LAYERS = 0xffffffff;

/** Runs the game clock on the render loop so timing and visuals stay in lockstep. */
function GameLoop({
  engine,
  onEvents,
  onFrame,
}: {
  engine: GameEngine | null;
  onEvents: RefObject<(events: GameEvent[]) => void>;
  onFrame?: RefObject<() => void>;
}) {
  useFrame(() => {
    if (!engine) return;
    const events = engine.tick(performance.now());
    if (events.length) onEvents.current?.(events);
    onFrame?.current?.();
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

export const Arena = memo(function Arena({
  engine,
  onEvents,
  onFrame,
  soften = false,
}: {
  engine: GameEngine | null;
  onEvents: RefObject<(events: GameEvent[]) => void>;
  /** Called after every game tick (e.g. to mirror engine state into the HUD). */
  onFrame?: RefObject<() => void>;
  /** Blur and darken the whole scene (a menu is showing over it). */
  soften?: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* `flat`: no tone mapping, so the comic palette renders exactly as specified. */}
      <Canvas flat camera={{ position: [0, 0, CAMERA_Z], fov: 62, near: 0.05, far: 80 }}>
        <fog attach="fog" args={[Colors.mountainNear, 14, 55]} />
        {/* Light 0 = key (from the side, so shapes split lit/halftone), light 1 = sunset rim.
            The comic shader reads them by index. */}
        <directionalLight position={[4, 4, 2.5]} intensity={2.8} layers-mask={ALL_LAYERS} />
        <directionalLight
          position={[-4, 2, -6]}
          intensity={1.1}
          color={Colors.skyOrange}
          layers-mask={ALL_LAYERS}
        />

        <GameLoop engine={engine} onEvents={onEvents} onFrame={onFrame} />
        <CameraRig engine={engine} />
        <RenderPipeline soften={soften} />

        <Scenery />
        <Glove side={-1} engine={engine} />
        <Glove side={1} engine={engine} />
      </Canvas>
    </View>
  );
});
