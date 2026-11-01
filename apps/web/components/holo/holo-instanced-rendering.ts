// One draw call for every orb.
//
// Technique: a single quad (4 vertices, 2 triangles) is instanced once per visible agent.
// Per instance data lives in two small attributes (position and state, lod and seed).
// The fragment shader draws the disc, rim and state icon procedurally, so there are no
// per orb meshes, materials or textures. State icons come from one texture atlas.
//
// Fragment cost is kept low on purpose:
//  - no loops, no lighting, no normal maths
//  - r squared is used for the discard test, sqrt only for orbs that survive it
//  - far orbs (lod 2) return a flat colour before any texture fetch
//  - alpha to coverage gives smooth edges without blending or sorting

import * as THREE from 'three';
import { HOLO_ORB_STATES, HOLO_STATE_TOKENS } from './holo-types';
import { readTokenRgb } from './holo-color';

export const ATLAS_COLS = 3;
export const ATLAS_ROWS = 2;
export const ATLAS_CELL = 64;

type IconPainter = (g: CanvasRenderingContext2D, s: number) => void;

/** One glyph per state, white on transparent. Shapes differ so state is readable without colour. */
const ICONS: Record<(typeof HOLO_ORB_STATES)[number], IconPainter> = {
  // idle: a small centred ring
  idle: (g, s) => { g.lineWidth = s * 0.07; g.beginPath(); g.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2); g.stroke(); },
  // working: a forward chevron pair
  working: (g, s) => {
    g.lineWidth = s * 0.09; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const dx of [-0.12, 0.1]) {
      g.beginPath(); g.moveTo(s * (0.4 + dx), s * 0.3); g.lineTo(s * (0.58 + dx), s * 0.5); g.lineTo(s * (0.4 + dx), s * 0.7); g.stroke();
    }
  },
  // thinking: three dots
  thinking: (g, s) => { for (const x of [0.28, 0.5, 0.72]) { g.beginPath(); g.arc(s * x, s / 2, s * 0.07, 0, Math.PI * 2); g.fill(); } },
  // awaiting approval: a clock face
  awaiting_approval: (g, s) => {
    g.lineWidth = s * 0.07; g.lineCap = 'round';
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(s / 2, s * 0.34); g.lineTo(s / 2, s / 2); g.lineTo(s * 0.62, s * 0.58); g.stroke();
  },
  // blocked: a cross
  blocked: (g, s) => {
    g.lineWidth = s * 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.32, s * 0.32); g.lineTo(s * 0.68, s * 0.68); g.moveTo(s * 0.68, s * 0.32); g.lineTo(s * 0.32, s * 0.68); g.stroke();
  },
  // offline: a flat dash
  offline: (g, s) => { g.lineWidth = s * 0.09; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.3, s / 2); g.lineTo(s * 0.7, s / 2); g.stroke(); },
};

/** Paints the 3x2 icon atlas. Client only (needs a canvas). */
export function buildStateAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * ATLAS_CELL;
  canvas.height = ATLAS_ROWS * ATLAS_CELL;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  g.strokeStyle = 'rgb(255 255 255)';
  g.fillStyle = 'rgb(255 255 255)';
  HOLO_ORB_STATES.forEach((state, i) => {
    g.save();
    g.translate((i % ATLAS_COLS) * ATLAS_CELL, Math.floor(i / ATLAS_COLS) * ATLAS_CELL);
    ICONS[state](g, ATLAS_CELL);
    g.restore();
  });
  return canvas;
}

const VERTEX = /* glsl */ `
  attribute vec4 aPos;   // xyz position, w state index
  attribute vec2 aMeta;  // x lod level, y per orb seed
  uniform float uSize;
  varying vec2 vUv;
  varying float vState;
  varying float vLod;
  varying float vSeed;
  void main() {
    vUv = position.xy;
    vState = aPos.w;
    vLod = aMeta.x;
    vSeed = aMeta.y;
    vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uStateColors[6];
  uniform vec3 uIconColor;
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform float uMotion;   // 0 when reduced motion is on
  varying vec2 vUv;
  varying float vState;
  varying float vLod;
  varying float vSeed;
  void main() {
    float r2 = dot(vUv, vUv);
    if (r2 > 1.0) discard;
    int s = int(vState + 0.5);
    vec3 col = uStateColors[s];
    if (vLod > 1.5) {               // far: flat disc, nothing else
      gl_FragColor = vec4(col, 1.0);
      return;
    }
    float r = sqrt(r2);
    float edge = 1.0 - smoothstep(0.9, 1.0, r);
    // awaiting approval pulses its rim as well as showing a clock icon
    float pulse = (s == 3) ? 0.75 + 0.25 * sin(uTime * 4.0 + vSeed * 6.28) * uMotion : 1.0;
    float rim = smoothstep(0.66, 0.78, r);
    vec3 c = mix(col * 0.22, col * pulse, rim);
    if (vLod < 0.5) {               // near: state icon from the atlas
      vec2 cell = vec2(mod(float(s), 3.0), floor(float(s) / 3.0));
      vec2 uv = vec2(vUv.x * 0.5 + 0.5, 0.5 - vUv.y * 0.5);
      float a = texture2D(uAtlas, (cell + uv) / vec2(3.0, 2.0)).a;
      c = mix(c, uIconColor, a);
    }
    gl_FragColor = vec4(c, edge);
  }
`;

export interface OrbField {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  /** Rewrites the visible instances. Call after culling or after states change. */
  write(count: number, indices: Uint16Array, lods: Uint8Array, positions: Float32Array, states: Uint8Array): void;
  setTime(seconds: number): void;
  setMotion(on: boolean): void;
  /** Re-reads the design tokens (call after a theme or tenant accent change). */
  refreshColors(root: Element): void;
  dispose(): void;
}

export function createOrbField(agentCount: number, orbRadius: number, root: Element): OrbField {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(agentCount * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aMeta = new THREE.InstancedBufferAttribute(new Float32Array(agentCount * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPos', aPos);
  geometry.setAttribute('aMeta', aMeta);
  geometry.instanceCount = 0;

  const atlas = new THREE.CanvasTexture(buildStateAtlas());
  atlas.flipY = false;
  atlas.minFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;

  const stateColors = HOLO_ORB_STATES.map(() => new THREE.Vector3(0.5, 0.5, 0.5));
  const iconColor = new THREE.Vector3(1, 1, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uSize: { value: orbRadius },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uAtlas: { value: atlas },
      uStateColors: { value: stateColors },
      uIconColor: { value: iconColor },
    },
    transparent: false,
    depthWrite: true,
    depthTest: true,
    alphaToCoverage: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // culling is done per instance on the CPU

  const refreshColors = (el: Element) => {
    HOLO_ORB_STATES.forEach((s, i) => {
      const [r, g, b] = readTokenRgb(el, HOLO_STATE_TOKENS[s]);
      stateColors[i].set(r, g, b);
    });
    const [r, g, b] = readTokenRgb(el, '--foreground');
    iconColor.set(r, g, b);
  };
  refreshColors(root);

  return {
    mesh,
    geometry,
    material,
    write(count, indices, lods, positions, states) {
      const p = aPos.array as Float32Array;
      const m = aMeta.array as Float32Array;
      for (let k = 0; k < count; k++) {
        const i = indices[k];
        p[k * 4] = positions[i * 3];
        p[k * 4 + 1] = positions[i * 3 + 1];
        p[k * 4 + 2] = positions[i * 3 + 2];
        p[k * 4 + 3] = states[i];
        m[k * 2] = lods[k];
        m[k * 2 + 1] = (i * 0.618034) % 1; // stable per orb phase offset
      }
      aPos.clearUpdateRanges(); aPos.addUpdateRange(0, count * 4); aPos.needsUpdate = true;
      aMeta.clearUpdateRanges(); aMeta.addUpdateRange(0, count * 2); aMeta.needsUpdate = true;
      geometry.instanceCount = count;
    },
    setTime(seconds) { material.uniforms.uTime.value = seconds; },
    setMotion(on) { material.uniforms.uMotion.value = on ? 1 : 0; },
    refreshColors,
    dispose() { geometry.dispose(); material.dispose(); atlas.dispose(); },
  };
}
