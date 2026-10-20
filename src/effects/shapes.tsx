import Svg, { Path, Polygon } from 'react-native-svg';

import { Colors } from '@/theme';

/** Deterministic pseudo-random so a burst keeps its shape across re-renders. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function starPoints(spikes: number, outer: number, inner: number, seed: number) {
  const rnd = seeded(seed);
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer * (0.82 + rnd() * 0.3) : inner * (0.9 + rnd() * 0.2);
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return pts.join(' ');
}

/** The jagged "POW!" explosion behind hit lettering. */
export function Burst({
  size,
  seed,
  fill = Colors.pow,
  innerFill = Colors.powInner,
}: {
  size: number;
  seed: number;
  fill?: string;
  innerFill?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5">
      <Polygon
        points={starPoints(14, 1.15, 0.72, seed)}
        fill={fill}
        stroke={Colors.ink}
        strokeWidth={0.07}
        strokeLinejoin="round"
      />
      <Polygon points={starPoints(12, 0.8, 0.55, seed + 7)} fill={innerFill} />
    </Svg>
  );
}

export function Star({ size, color = Colors.pow }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="-1.2 -1.2 2.4 2.4">
      <Polygon
        points={starPoints(5, 1, 0.45, 3)}
        fill={color}
        stroke={Colors.ink}
        strokeWidth={0.16}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Heart({ size, filled }: { size: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"
        fill={filled ? Colors.hitRed : 'transparent'}
        stroke={filled ? Colors.ink : 'rgba(255,255,255,0.35)'}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
