import type { ReactNode } from 'react';
import { BufferGeometry, type Material } from 'three';

import { outlineMaterial } from './materials';

export type Vec3 = [number, number, number];

/** Default ink-hull size: 7% larger than the part, all round. */
export const OUTLINE = 1.07;

/**
 * A mesh plus its ink outline (an enlarged back-face copy). `outline` scales the hull
 * in the geometry's own axes — thin parts like ropes want it fat sideways, not lengthwise.
 */
export function Part({
  geometry,
  material,
  position,
  rotation,
  scale = [1, 1, 1],
  outline = OUTLINE,
}: {
  /** JSX geometry, or a prebuilt geometry shared by the part and its hull. */
  geometry: ReactNode | BufferGeometry;
  material: Material;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  outline?: number | Vec3 | false;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {geometry instanceof BufferGeometry ? (
        <>
          <mesh material={material} geometry={geometry} />
          {outline !== false && <mesh material={outlineMaterial} geometry={geometry} scale={outline} />}
        </>
      ) : (
        <>
          <mesh material={material}>{geometry}</mesh>
          {outline !== false && (
            <mesh material={outlineMaterial} scale={outline}>
              {geometry}
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
