// Fibonacci (golden spiral) sphere layout. Near uniform spacing, no clustering at the poles.
// Pure maths so it can be unit tested without WebGL.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Returns a flat xyz array of length n * 3, points on a sphere of the given radius. */
export function fibonacciSphere(n: number, radius = 1): Float32Array {
  const out = new Float32Array(Math.max(0, n) * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    out[i * 3] = Math.cos(theta) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return out;
}

/** Smallest distance between any two points. O(n^2), for tests and layout checks only. */
export function minNeighbourDistance(positions: Float32Array): number {
  const n = positions.length / 3;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Orb radius that leaves a small gap between the closest neighbours. */
export function orbRadiusFor(positions: Float32Array, fill = 0.72): number {
  const d = minNeighbourDistance(positions);
  return Number.isFinite(d) ? (d / 2) * fill : 0.05;
}
