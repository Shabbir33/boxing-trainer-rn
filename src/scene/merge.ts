import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';

export type Vec3 = [number, number, number];

/**
 * One static piece of a merged mesh. `outline` scales its ink hull in the piece's
 * own axes (thin parts like ropes want it fat sideways, not lengthwise); false = no hull.
 */
export interface PartSpec {
  geometry: BufferGeometry;
  color: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  outline?: number | Vec3 | false;
  /** Transform of an enclosing group, applied after the part's own. */
  parent?: Matrix4;
}

export interface MergedParts {
  /** Positions + vertex colours; draw with a `vertexColors` surface material. */
  surface: BufferGeometry;
  /** Positions only; draw with the back-face ink material. */
  hull: BufferGeometry;
}

const ONE: Vec3 = [1, 1, 1];

function positions(geometry: BufferGeometry, matrix: Matrix4): Float32Array {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const src = g.getAttribute('position');
  const out = new Float32Array(src.count * 3);
  const v = new Vector3();
  for (let i = 0; i < src.count; i++) {
    v.fromBufferAttribute(src, i).applyMatrix4(matrix);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  if (g !== geometry) g.dispose();
  return out;
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** A group transform for `PartSpec.parent`. */
export function groupMatrix(position: Vec3, rotation: Vec3 = [0, 0, 0]) {
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(1, 1, 1),
  );
}

/**
 * Bakes many static parts into two geometries, so a whole set of scenery draws in
 * two calls instead of two per part. On expo-gl every GL command crosses from JS to
 * native, so draw-call count is the main cost of a frame. Normals aren't stored: the
 * surface material is flat-shaded and derives them per pixel.
 */
export function mergeParts(parts: PartSpec[]): MergedParts {
  const surfacePos: Float32Array[] = [];
  const surfaceCol: Float32Array[] = [];
  const hullPos: Float32Array[] = [];
  const matrix = new Matrix4();
  const hullMatrix = new Matrix4();
  const q = new Quaternion();
  const color = new Color();

  for (const p of parts) {
    const s = p.scale ?? ONE;
    q.setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0])));
    matrix.compose(new Vector3(...(p.position ?? [0, 0, 0])), q, new Vector3(...s));
    if (p.parent) matrix.premultiply(p.parent);

    const pos = positions(p.geometry, matrix);
    surfacePos.push(pos);
    color.set(p.color);
    const col = new Float32Array(pos.length);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = color.r;
      col[i + 1] = color.g;
      col[i + 2] = color.b;
    }
    surfaceCol.push(col);

    if (p.outline !== false) {
      const o = p.outline ?? 1.07;
      const os: Vec3 = typeof o === 'number' ? [o, o, o] : o;
      hullMatrix.copy(matrix).multiply(new Matrix4().makeScale(...os));
      hullPos.push(positions(p.geometry, hullMatrix));
    }
  }

  const surface = new BufferGeometry();
  surface.setAttribute('position', new BufferAttribute(concat(surfacePos), 3));
  surface.setAttribute('color', new BufferAttribute(concat(surfaceCol), 3));
  surface.computeBoundingSphere();
  const hull = new BufferGeometry();
  hull.setAttribute('position', new BufferAttribute(concat(hullPos), 3));
  hull.computeBoundingSphere();
  return { surface, hull };
}
