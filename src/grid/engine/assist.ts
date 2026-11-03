// Racing-line assist: a speed profile for one car's performance around the
// circuit, used to colour the suggested line (green = accelerate, yellow =
// prepare to brake / hold, red = brake) and to give brake hints in the HUD.

import type { Performance } from "./performance.ts";
import type { RaceCar } from "./race.ts";
import type { Track } from "./track.ts";

export type AssistColor = 0 | 1 | 2; // green, yellow, red

export interface SpeedProfile {
  /** Target speed at each track sample, m/s. */
  v: Float64Array;
  /** Static zone colour at each sample. */
  zone: Uint8Array;
  step: number;
  brake: number;
}

const cache = new Map<string, SpeedProfile>();

export function speedProfile(track: Track, perf: Performance): SpeedProfile {
  const key = `${track.length.toFixed(1)}|${perf.grip.toFixed(2)}|${perf.brake.toFixed(2)}|${perf.accel.toFixed(2)}|${perf.topSpeed.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = track.n;
  const step = track.length / n;
  const brake = perf.brake * 0.72; // what a driver can count on while still turning in
  const vmax = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(track.k[i]) * 0.85; // the racing line is wider than the centre line
    vmax[i] = Math.min(perf.topSpeed, k < 1e-5 ? Infinity : Math.sqrt((perf.grip * 0.95) / k));
  }
  // Backward pass: how fast you can be here and still make the next corners.
  const back = Float64Array.from(vmax);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx = back[(i + 1) % n];
      back[i] = Math.min(back[i], Math.sqrt(nx * nx + 2 * brake * step));
    }
  }
  // Forward pass: how fast you can get here accelerating out of the last corner.
  const fwd = Float64Array.from(vmax);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const pv = fwd[(i - 1 + n) % n];
      const a = perf.accel * Math.max(0.05, 1 - (pv / perf.topSpeed) ** 2);
      fwd[i] = Math.min(fwd[i], Math.sqrt(pv * pv + 2 * a * step));
    }
  }
  const v = new Float64Array(n);
  const zone = new Uint8Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(back[i], fwd[i]);
  for (let i = 0; i < n; i++) {
    const braking = back[i] < fwd[i] - 0.3 && v[(i + 1) % n] < v[i] - 0.02;
    const cornering = vmax[i] < perf.topSpeed * 0.92 && v[i] >= vmax[i] - 1.5;
    zone[i] = braking ? 2 : cornering ? 1 : 0;
  }
  // Yellow warning strip before every braking zone (~70 m).
  const warn = Math.round(70 / step);
  for (let i = 0; i < n; i++) {
    if (zone[i] === 2 && zone[(i - 1 + n) % n] !== 2) {
      for (let j = 1; j <= warn; j++) {
        const t = (i - j + n) % n;
        if (zone[t] === 0) zone[t] = 1;
      }
    }
  }
  const p = { v, zone, step, brake };
  cache.set(key, p);
  return p;
}

/**
 * Colour of the line at distance x ahead of the car, adjusted for the car's
 * actual approach speed: arriving faster than planned turns the line red earlier.
 */
export function assistColor(track: Track, prof: SpeedProfile, car: RaceCar, x: number): AssistColor {
  const i = Math.floor((((car.s + x) % track.length) + track.length) % track.length / prof.step) % track.n;
  let c = prof.zone[i] as AssistColor;
  if (x > 0 && car.v > prof.v[i]) {
    const need = (car.v * car.v - prof.v[i] * prof.v[i]) / (2 * x);
    if (need > prof.brake * 0.95) c = 2;
    else if (need > prof.brake * 0.6 && c < 1) c = 1;
  }
  return c;
}

/** Simple HUD hint: brake now, lift, or full throttle. */
export function assistHint(track: Track, prof: SpeedProfile, car: RaceCar): "BRAKE" | "LIFT" | "PUSH" {
  let worst = 0;
  for (let x = 5; x <= 260; x += 5) {
    const i = Math.floor((((car.s + x) % track.length) + track.length) % track.length / prof.step) % track.n;
    if (car.v <= prof.v[i]) continue;
    const need = (car.v * car.v - prof.v[i] * prof.v[i]) / (2 * x);
    worst = Math.max(worst, need / prof.brake);
  }
  if (worst > 0.85) return "BRAKE";
  if (worst > 0.55) return "LIFT";
  return "PUSH";
}

/** Gear (1–8) and engine rpm from road speed. */
export function gearbox(v: number, top: number): { gear: number; rpm: number } {
  const x = Math.max(0, Math.min(0.9999, v / (top * 1.04)));
  const gear = Math.min(8, 1 + Math.floor(x * 8));
  const within = x * 8 - (gear - 1);
  return { gear, rpm: Math.round(gear === 1 ? 4000 + 8500 * within : 9000 + 3500 * within) };
}
