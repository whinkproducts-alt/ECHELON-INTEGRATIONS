// Three.js core for the HOLO orb field: scene, camera, controls, culling, LOD and the render loop.
// Layout lives in holo-fibonacci.ts, culling maths in holo-culling-lod.ts,
// the single draw call in holo-instanced-rendering.ts.
// No browser global is touched at module scope. Everything runs after createHoloField() is called.

import * as THREE from 'three';
import { fibonacciSphere, orbRadiusFor } from './holo-fibonacci';
import { cullAndLod, extractFrustumPlanes } from './holo-culling-lod';
import { createOrbField } from './holo-instanced-rendering';
import { FpsMeter, fpsVerdict, type FpsSnapshot, type FpsVerdict } from './holo-fps';

export interface HoloStats extends FpsSnapshot {
  verdict: FpsVerdict;
  /** renderer.info.render.calls for the last frame. The target is exactly 1. */
  drawCalls: number;
  triangles: number;
  visible: number;
  culled: number;
  total: number;
  lod: [number, number, number];
}

export interface HoloOptions {
  canvas: HTMLCanvasElement;
  agentCount: number;
  /** One state index per agent (see HOLO_ORB_STATES). */
  states: Uint8Array;
  reducedMotion: boolean;
  onStats?: (s: HoloStats) => void;
  onError?: (reason: 'context_lost' | 'webgl_unavailable') => void;
}

export interface HoloController {
  setStates(states: Uint8Array): void;
  setReducedMotion(on: boolean): void;
  resize(width: number, height: number): void;
  /** Index of the agent under the pointer, or -1. */
  pick(clientX: number, clientY: number): number;
  nudge(yaw: number, pitch: number): void;
  zoom(delta: number): void;
  refreshColors(): void;
  stats(): HoloStats;
  dispose(): void;
}

const MIN_DIST = 2.2;
const MAX_DIST = 6;

export function createHoloField(opts: HoloOptions): HoloController | null {
  const { canvas, agentCount } = opts;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    opts.onError?.('webgl_unavailable');
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  const positions = fibonacciSphere(agentCount, 1);
  const orbRadius = orbRadiusFor(positions);
  const field = createOrbField(agentCount, orbRadius, canvas);
  scene.add(field.mesh);

  let states = opts.states;
  let motion = !opts.reducedMotion;
  let yaw = 0.4, pitch = 0.25, dist = 3.6;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let dirty = true;
  let width = 1, height = 1;

  const planes = new Float32Array(24);
  const viewProj = new THREE.Matrix4();
  const outIndex = new Uint16Array(agentCount);
  const outLod = new Uint8Array(agentCount);
  const meter = new FpsMeter(120);
  const lodCounts: [number, number, number] = [0, 0, 0];
  let visible = 0, culled = 0, drawCalls = 0, triangles = 0;
  let lastStatsAt = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;
  const clock0 = performance.now();

  function updateCamera() {
    camera.position.set(
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function refreshInstances() {
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    extractFrustumPlanes(viewProj.elements, planes);
    // Visible cap spans distances from dist - 1 (centre) to sqrt(dist^2 - 1) (horizon).
    // Orbs behind the horizon (minus a margin so edge orbs do not pop) are occluded by the globe.
    const res = cullAndLod(
      positions, planes, camera.position, orbRadius,
      { near: dist - 0.65, mid: dist - 0.3 },
      outIndex, outLod,
      1 / dist - 0.12,
    );
    visible = res.count;
    culled = res.culled;
    lodCounts[0] = lodCounts[1] = lodCounts[2] = 0;
    for (let k = 0; k < visible; k++) lodCounts[outLod[k]] += 1;
    field.write(visible, outIndex, outLod, positions, states);
    dirty = false;
  }

  function snapshot(): HoloStats {
    const f = meter.snapshot();
    return { ...f, verdict: fpsVerdict(f), drawCalls, triangles, visible, culled, total: agentCount, lod: [...lodCounts] as [number, number, number] };
  }

  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? now - last : 0;
    last = now;
    if (dt > 0) meter.push(dt);
    if (motion && !dragging) { yaw += dt * 0.00006; dirty = true; }
    field.setTime((now - clock0) / 1000);
    if (dirty) { updateCamera(); refreshInstances(); }
    renderer.render(scene, camera);
    drawCalls = renderer.info.render.calls;
    triangles = renderer.info.render.triangles;
    if (opts.onStats && now - lastStatsAt > 500) { lastStatsAt = now; opts.onStats(snapshot()); }
  }

  const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.006;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY; dirty = true;
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist + e.deltaY * 0.002)); dirty = true; };
  const onLost = (e: Event) => { e.preventDefault(); opts.onError?.('context_lost'); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', onLost);

  raf = requestAnimationFrame(frame);

  return {
    setStates(next) { states = next; dirty = true; },
    setReducedMotion(on) { motion = !on; field.setMotion(!on); },
    resize(w, h) {
      width = Math.max(1, w); height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty = true;
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left, py = clientY - rect.top;
      const v = new THREE.Vector3();
      let best = -1, bestD = Infinity;
      const orbPx = (orbRadius / (dist * Math.tan((camera.fov * Math.PI) / 360))) * (rect.height / 2);
      for (let k = 0; k < visible; k++) {
        const i = outIndex[k];
        v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).project(camera);
        if (v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * rect.width, sy = (-v.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - px, sy - py);
        // nearer (smaller z) wins ties so the front orb is picked
        if (d <= Math.max(orbPx, 6) && d - v.z < bestD) { bestD = d - v.z; best = i; }
      }
      return best;
    },
    nudge(dy, dp) { yaw += dy; pitch = Math.max(-1.2, Math.min(1.2, pitch + dp)); dirty = true; },
    zoom(d) { dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist + d)); dirty = true; },
    refreshColors() { field.refreshColors(canvas); },
    stats: snapshot,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      field.dispose();
      renderer.dispose();
    },
  };
}
