// CPU frustum culling and level of detail selection. Pure maths, no three.js import.
// The renderer calls cullAndLod when the camera moves, then draws the surviving
// instances in the same single draw call (instanceCount shrinks, the call count does not grow).

/** Six planes (nx, ny, nz, d), normalised, pointing inward. Gribb and Hartmann extraction. */
export function extractFrustumPlanes(m: ArrayLike<number>, out = new Float32Array(24)): Float32Array {
  // m is a column major 4x4 projection * view matrix (three.js Matrix4.elements order).
  const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]] as const;
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const combos: Array<[number, number, number, number]> = [
    [r3[0] + r0[0], r3[1] + r0[1], r3[2] + r0[2], r3[3] + r0[3]], // left
    [r3[0] - r0[0], r3[1] - r0[1], r3[2] - r0[2], r3[3] - r0[3]], // right
    [r3[0] + r1[0], r3[1] + r1[1], r3[2] + r1[2], r3[3] + r1[3]], // bottom
    [r3[0] - r1[0], r3[1] - r1[1], r3[2] - r1[2], r3[3] - r1[3]], // top
    [r3[0] + r2[0], r3[1] + r2[1], r3[2] + r2[2], r3[3] + r2[3]], // near
    [r3[0] - r2[0], r3[1] - r2[1], r3[2] - r2[2], r3[3] - r2[3]], // far
  ];
  combos.forEach(([a, b, c, d], i) => {
    const len = Math.hypot(a, b, c) || 1;
    out[i * 4] = a / len;
    out[i * 4 + 1] = b / len;
    out[i * 4 + 2] = c / len;
    out[i * 4 + 3] = d / len;
  });
  return out;
}

export function sphereInFrustum(planes: Float32Array, x: number, y: number, z: number, radius: number): boolean {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    if (planes[o] * x + planes[o + 1] * y + planes[o + 2] * z + planes[o + 3] < -radius) return false;
  }
  return true;
}

/** 0 = full detail (icon), 1 = medium (disc and rim), 2 = far (flat disc, no texture fetch). */
export type LodLevel = 0 | 1 | 2;

export interface LodThresholds {
  /** Closer than this distance in world units: full detail. */
  near: number;
  /** Closer than this: medium. Beyond: far. */
  mid: number;
}

export function lodForDistance(distance: number, t: LodThresholds): LodLevel {
  if (distance < t.near) return 0;
  if (distance < t.mid) return 1;
  return 2;
}

/** Full detail also needs enough pixels to be legible. Below minIconPx the icon is dropped. */
export function lodForScreenSize(pixelDiameter: number, minIconPx = 14, minRimPx = 5): LodLevel {
  if (pixelDiameter >= minIconPx) return 0;
  if (pixelDiameter >= minRimPx) return 1;
  return 2;
}

export interface CullResult {
  /** Number of visible instances, packed at the front of the output arrays. */
  count: number;
  /** Number culled by the frustum. */
  culled: number;
}

/**
 * Writes visible agents compactly:
 *  outIndex[k]  original agent index
 *  outLod[k]    lod level
 * Returns counts. Allocation free.
 */
export function cullAndLod(
  positions: Float32Array,
  planes: Float32Array,
  camera: { x: number; y: number; z: number },
  orbRadius: number,
  thresholds: LodThresholds,
  outIndex: Uint16Array,
  outLod: Uint8Array,
  /**
   * Occlusion by the globe itself. An orb on a sphere of radius `sphereRadius` is hidden when
   * its direction dotted with the unit camera direction is below this value. Use 1 / distance
   * (the horizon) minus a margin. Default -Infinity keeps every orb the frustum allows.
   */
  occludeBelow = -Infinity,
  sphereRadius = 1,
): CullResult {
  const n = positions.length / 3;
  const cl = Math.hypot(camera.x, camera.y, camera.z) || 1;
  const cx = camera.x / cl, cy = camera.y / cl, cz = camera.z / cl;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if ((x * cx + y * cy + z * cz) / sphereRadius < occludeBelow) continue;
    if (!sphereInFrustum(planes, x, y, z, orbRadius)) continue;
    const d = Math.hypot(x - camera.x, y - camera.y, z - camera.z);
    outIndex[k] = i;
    outLod[k] = lodForDistance(d, thresholds);
    k++;
  }
  return { count: k, culled: n - k };
}
