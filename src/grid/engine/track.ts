// Fictional circuit defined by control points (metres), turned into a smooth
// closed centre line sampled every SAMPLE_STEP metres with heading and curvature.

export const TRACK_HALF_WIDTH = 7; // 14 m wide
export const SAMPLE_STEP = 2;

// "Kestrel Park": long main straight, hairpin, fast esses, a sweeper and a chicane.
export const CONTROL_POINTS: [number, number][] = [
  [-200, 0],
  [150, 0],
  [330, 0],
  [420, 30],
  [445, 110],
  [400, 165],
  [320, 160],
  [270, 195],
  [285, 265],
  [360, 300],
  [450, 330],
  [480, 410],
  [430, 470],
  [310, 480],
  [180, 470],
  [80, 430],
  [10, 450],
  [-80, 470],
  [-190, 440],
  [-260, 370],
  [-270, 270],
  [-220, 200],
  [-280, 130],
  [-300, 60],
];

export interface Track {
  length: number;
  n: number;
  x: Float64Array;
  z: Float64Array;
  /** Unit tangent. */
  tx: Float64Array;
  tz: Float64Array;
  /** Signed curvature (1/m); positive turns left. Smoothed. */
  k: Float64Array;
  halfWidth: number;
  /** Distance (from the start line) where the pit lane begins and ends; it runs past the line. */
  pitEntry: number;
  pitBox: number;
  pitExit: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(points: [number, number][] = CONTROL_POINTS): Track {
  // Dense curve.
  const dense: [number, number][] = [];
  const m = points.length;
  for (let i = 0; i < m; i++) {
    const p0 = points[(i - 1 + m) % m];
    const p1 = points[i];
    const p2 = points[(i + 1) % m];
    const p3 = points[(i + 2) % m];
    for (let j = 0; j < 40; j++) {
      const t = j / 40;
      dense.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  // Arc length.
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1];
  const n = Math.floor(length / SAMPLE_STEP);
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = (i * length) / n;
    while (cum[seg + 1] < s) seg++;
    const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = dense[seg];
    const b = dense[(seg + 1) % dense.length];
    x[i] = a[0] + (b[0] - a[0]) * t;
    z[i] = a[1] + (b[1] - a[1]) * t;
  }
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = x[b] - x[a];
    const dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  // Curvature from heading change, then smoothed over ~20 m.
  const raw = new Float64Array(n);
  const step = length / n;
  for (let i = 0; i < n; i++) {
    const b = (i + 1) % n;
    const h1 = Math.atan2(tz[i], tx[i]);
    const h2 = Math.atan2(tz[b], tx[b]);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    // x right, z down in plan view: a positive atan2 change is a right turn, so flip for "left positive".
    raw[i] = -dh / step;
  }
  const k = new Float64Array(n);
  const w = 5;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -w; j <= w; j++) sum += raw[(i + j + n) % n];
    k[i] = sum / (2 * w + 1);
  }
  return {
    length,
    n,
    x,
    z,
    tx,
    tz,
    k,
    halfWidth: TRACK_HALF_WIDTH,
    pitEntry: length - 220,
    pitBox: 90,
    pitExit: 260,
  };
}

export function wrap(s: number, length: number): number {
  return ((s % length) + length) % length;
}

export function indexAt(track: Track, s: number): number {
  return Math.floor(wrap(s, track.length) / (track.length / track.n)) % track.n;
}

/** Interpolated centre-line point and tangent at distance s. */
export function sampleAt(track: Track, s: number) {
  const step = track.length / track.n;
  const u = wrap(s, track.length) / step;
  const i = Math.floor(u) % track.n;
  const j = (i + 1) % track.n;
  const f = u - Math.floor(u);
  const tx = track.tx[i] + (track.tx[j] - track.tx[i]) * f;
  const tz = track.tz[i] + (track.tz[j] - track.tz[i]) * f;
  const l = Math.hypot(tx, tz) || 1;
  return {
    x: track.x[i] + (track.x[j] - track.x[i]) * f,
    z: track.z[i] + (track.z[j] - track.z[i]) * f,
    tx: tx / l,
    tz: tz / l,
    k: track.k[i] + (track.k[j] - track.k[i]) * f,
  };
}

/** World position of a car at distance s and lateral offset d (positive = left of travel). */
export function worldPos(track: Track, s: number, d: number) {
  const p = sampleAt(track, s);
  // Left normal in plan view (x right, z down) is (tz, -tx).
  return { x: p.x + p.tz * d, z: p.z - p.tx * d, tx: p.tx, tz: p.tz };
}

/** True if the circuit's edges never overlap another part of the track. */
export function selfIntersects(track: Track, margin = 2 * TRACK_HALF_WIDTH + 4): boolean {
  const stride = 3;
  for (let i = 0; i < track.n; i += stride) {
    for (let j = i + stride; j < track.n; j += stride) {
      const along = Math.min(j - i, track.n - (j - i)) * (track.length / track.n);
      if (along < 80) continue;
      if (Math.hypot(track.x[i] - track.x[j], track.z[i] - track.z[j]) < margin) return true;
    }
  }
  return false;
}
