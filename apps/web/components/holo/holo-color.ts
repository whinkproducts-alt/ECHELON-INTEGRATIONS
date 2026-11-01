// Converts a design token ("H S% L%" triplet) to linear 0..1 rgb for WebGL and canvas.
// No hex values: the source of truth is the CSS custom property.

export type Rgb = readonly [number, number, number];

export function hslTripletToRgb(triplet: string): Rgb {
  const m = triplet.trim().match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (!m) return [0.5, 0.5, 0.5];
  const h = ((parseFloat(m[1]) % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, parseFloat(m[2]) / 100));
  const l = Math.min(1, Math.max(0, parseFloat(m[3]) / 100));
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Resolves var(--a) chains the browser has already computed. Client only. */
export function readTokenRgb(el: Element, token: string): Rgb {
  const raw = getComputedStyle(el).getPropertyValue(token);
  return hslTripletToRgb(raw);
}

export function rgbCss(c: Rgb, alpha = 1): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${to(c[0])} ${to(c[1])} ${to(c[2])} / ${alpha})`;
}
