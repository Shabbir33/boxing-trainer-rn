import { BufferGeometry, CapsuleGeometry, CylinderGeometry, IcosahedronGeometry } from 'three';

/**
 * Procedural low-poly boxing glove, modelled in the guard pose:
 *   +y = knuckle roll (top), +z = back of the hand (faces the camera),
 *   -z = palm side, -y = cuff. The thumb sits on the inner side (set per glove).
 * Built by sculpting simple primitives, so the facets stay clean and even.
 */

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Sculpts a sphere's vertices in place. `fn` maps a unit-sphere point to the new position. */
function sculpt(geo: BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]) {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * The padded fist: a big rounded knuckle roll on top, a flatter back of the hand,
 * a fuller palm side where the fingers curl in, narrowing into the wrist.
 */
export function makeMittGeometry() {
  return sculpt(new IcosahedronGeometry(1, 2), (px, py, pz) => {
    const len = Math.hypot(px, py, pz);
    const x0 = px / len;
    const y0 = py / len;
    const z0 = pz / len;
    const top = Math.max(0, y0);
    const bot = Math.max(0, -y0);

    // Tall, loaf-shaped knuckle roll: broad across, shallower front-to-back;
    // the bottom pinches toward the wrist.
    let x = x0 * 0.29 * (1 + 0.12 * top) * (1 - 0.34 * bot * bot);
    const y = y0 * (y0 > 0 ? 0.42 : 0.32);
    let z = z0 * (z0 > 0 ? 0.2 : 0.25) * (1 - 0.1 * top) * (1 - 0.36 * bot * bot);

    // Fingers curl over the top toward the palm, pushing the roll forward.
    z -= 0.06 * top * top;
    // Back of the hand is broad and fairly flat.
    if (z0 > 0) z *= 0.86 + 0.14 * Math.abs(y0);
    // Slight crease on the palm side where the fingertips tuck into the palm.
    const crease = Math.exp(-((y0 + 0.2) ** 2) / 0.03) * Math.max(0, -z0);
    z += 0.035 * crease;
    // A touch of squareness across the knuckles.
    x *= 1 + 0.05 * smooth(0.2, 0.8, top) * (1 - Math.abs(z0));

    return [x, y, z];
  });
}

/**
 * Thumb pad: a tapered capsule, thick at the base and narrowing toward the tip,
 * which is stitched onto the side of the knuckle roll.
 */
export function makeThumbGeometry() {
  const geo = new CapsuleGeometry(0.1, 0.3, 2, 7);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // y runs -0.25..0.25; taper the top (tip) to ~65% width.
    const k = 1 - 0.35 * smooth(-0.25, 0.25, y);
    pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k * 0.9);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Wrist cuff: a slightly oval, gently tapering tube. */
export function makeCuffGeometry(radiusTop: number, radiusBottom: number, height: number) {
  const geo = new CylinderGeometry(radiusTop, radiusBottom, height, 10, 1);
  geo.scale(1, 1, 0.86);
  return geo;
}
