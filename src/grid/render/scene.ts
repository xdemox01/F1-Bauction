// Builds the 3D circuit and cars, and draws a race frame with the chosen camera.

import { seededRng } from "../../lib/game/rng.ts";
import type { Race, RaceCar } from "../engine/race.ts";
import { classification, lineOffset } from "../engine/race.ts";
import { assistColor, speedProfile } from "../engine/assist.ts";
import { sampleAt, worldPos } from "../engine/track.ts";
import type { Track } from "../engine/track.ts";
import { Geometry, hexToRgb, mat4, Renderer } from "./gl.ts";
import type { Mesh } from "./gl.ts";

export type CameraMode = "chase" | "cockpit" | "tv" | "overview";
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: "Chase cam",
  cockpit: "Onboard",
  tv: "TV cameras",
  overview: "Helicopter",
};

const SKY = [0.62, 0.74, 0.86];
const ASPHALT = [0.24, 0.25, 0.27];
const GRASS_A = [0.27, 0.48, 0.22];
const GRASS_B = [0.3, 0.52, 0.24];
const WHITE = [0.95, 0.95, 0.95];
const RED = [0.82, 0.12, 0.1];
const GRAVEL = [0.72, 0.64, 0.48];
const CARBON = [0.08, 0.08, 0.09];

function buildWorld(track: Track): Geometry {
  const g = new Geometry();
  const hw = track.halfWidth;
  const rng = seededRng(2026);
  // Bounds
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i]);
  }
  const pad = 400;
  // Ground: mown stripes.
  const tile = 60;
  for (let x = minX - pad; x < maxX + pad; x += tile) {
    for (let z = minZ - pad; z < maxZ + pad; z += tile) {
      const c = Math.floor((x - minX) / tile) % 2 === 0 ? GRASS_A : GRASS_B;
      g.quad([x, 0, z], [x + tile, 0, z], [x + tile, 0, z + tile], [x, 0, z + tile], c);
    }
  }

  // Helper: point at (sample i, lateral d, height y).
  const P = (i: number, d: number, y: number) => {
    const ii = ((i % track.n) + track.n) % track.n;
    return [track.x[ii] + track.tz[ii] * d, y, track.z[ii] - track.tx[ii] * d];
  };
  const ribbon = (i: number, d0: number, d1: number, y: number, color: number[]) =>
    g.quad(P(i, d0, y), P(i + 1, d0, y), P(i + 1, d1, y), P(i, d1, y), color);

  // Distance from a point to the nearest part of the track that isn't "here".
  const clearOfTrack = (x: number, z: number, own: number, need: number) => {
    for (let j = 0; j < track.n; j += 2) {
      const along = Math.min(Math.abs(j - own), track.n - Math.abs(j - own));
      if (along < 12) continue;
      if (Math.hypot(track.x[j] - x, track.z[j] - z) < need) return false;
    }
    return true;
  };

  const step = track.length / track.n;
  const pitStartI = Math.floor(track.pitEntry / step) - 10;
  const pitEndI = Math.floor((track.pitExit + 80) / step);
  const inPitZone = (i: number) => i >= pitStartI || i <= pitEndI;

  for (let i = 0; i < track.n; i++) {
    const k = track.k[i];
    const shade = 0.96 + 0.08 * ((i * 7919) % 13) / 13;
    ribbon(i, -hw, hw, 0.2, ASPHALT.map((c) => c * shade));
    // Edge lines
    ribbon(i, hw - 0.45, hw - 0.15, 0.3, WHITE);
    ribbon(i, -hw + 0.15, -hw + 0.45, 0.3, WHITE);
    const corner = Math.abs(k) > 1 / 110;
    if (corner) {
      const kerb = Math.floor(i / 2) % 2 === 0 ? RED : WHITE;
      ribbon(i, hw, hw + 1.4, 0.3, kerb);
      ribbon(i, -hw - 1.4, -hw, 0.3, kerb);
      // Gravel trap on the outside of the corner.
      const outside = k > 0 ? -1 : 1;
      if (!(outside < 0 && inPitZone(i))) {
        const a = outside * (hw + 1.4);
        const b = outside * (hw + 10);
        const mid = P(i, outside * (hw + 10), 0);
        if (clearOfTrack(mid[0], mid[2], i, hw + 3)) ribbon(i, Math.min(a, b), Math.max(a, b), 0.12, GRAVEL);
      }
    }
  }

  // Barriers both sides (skipped where they'd sit on another part of the track).
  for (let i = 0; i < track.n; i += 3) {
    for (const side of [1, -1]) {
      if (side < 0 && inPitZone(i)) continue;
      const d = side * (hw + 13);
      const a = P(i, d, 0);
      const b = P(i + 3, d, 0);
      if (!clearOfTrack(a[0], a[2], i, hw + 4)) continue;
      const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
      const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 + 0.05;
      const panel = Math.floor(i / 6) % 2 === 0 ? [0.2, 0.35, 0.75] : [0.92, 0.92, 0.92];
      g.box(cx, 0.6, cz, len, 0.6, 0.3, panel, yaw);
    }
  }

  // Pit lane, pit wall and garages along the main straight (right-hand side).
  for (let i = pitStartI; i < track.n + pitEndI; i++) {
    ribbon(i, -hw - 9, -hw - 2, 0.2, [0.2, 0.21, 0.23]);
    ribbon(i, -hw - 9.2, -hw - 9, 0.3, WHITE);
  }
  for (let i = pitStartI + 20; i < track.n + pitEndI - 20; i += 3) {
    const a = P(i, -hw - 1.2, 0);
    const b = P(i + 3, -hw - 1.2, 0);
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    g.box((a[0] + b[0]) / 2, 0.6, (a[2] + b[2]) / 2, Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 + 0.05, 0.6, 0.25, [0.85, 0.85, 0.86], yaw);
  }
  for (let i = pitStartI + 30, n = 0; i < track.n + pitEndI - 30; i += 9, n++) {
    const p = P(i, -hw - 15, 0);
    const t = (((i % track.n) + track.n) % track.n);
    const yaw = Math.atan2(-track.tz[t], track.tx[t]);
    g.box(p[0], 3, p[2], 8.5, 3, 5, n % 2 ? [0.82, 0.83, 0.86] : [0.74, 0.76, 0.8], yaw);
  }

  // Grandstand opposite the pits.
  for (let i = track.n - 70; i < track.n + 120; i += 10) {
    const t = ((i % track.n) + track.n) % track.n;
    const yaw = Math.atan2(-track.tz[t], track.tx[t]);
    for (let r = 0; r < 6; r++) {
      const p = P(i, hw + 18 + r * 2.4, 0);
      const crowd = [[0.85, 0.2, 0.2], [0.95, 0.85, 0.3], [0.25, 0.45, 0.85], [0.9, 0.9, 0.9]][(i + r) % 4];
      g.box(p[0], 0.8 + r * 1.3, p[2], 10, 0.8 + r * 1.3, 1.2, r % 2 ? crowd : [0.55, 0.57, 0.6], yaw);
    }
  }

  // Start/finish: chequered line and grid boxes.
  const sq = 1;
  for (let c = 0; c < 14; c++) {
    for (let r = 0; r < 2; r++) {
      const d0 = -hw + c * sq;
      const color = (c + r) % 2 ? WHITE : CARBON;
      const a = P(r, d0, 0.35), b = P(r + 1, d0, 0.35), cc = P(r + 1, d0 + sq, 0.35), d = P(r, d0 + sq, 0.35);
      g.quad(a, b, cc, d, color);
    }
  }
  for (let slot = 0; slot < 6; slot++) {
    const s = -12 - slot * 9;
    const i = Math.floor(((s % track.length) + track.length) % track.length / step);
    const d = slot % 2 === 0 ? 2.8 : -2.8;
    g.quad(P(i, d - 1.2, 0.3), P(i + 1, d - 1.2, 0.3), P(i + 1, d + 1.2, 0.3), P(i, d + 1.2, 0.3), WHITE);
  }
  // Start gantry posts and beam.
  {
    const l = P(6, hw + 2, 0), r = P(6, -hw - 2, 0);
    g.box(l[0], 4, l[2], 0.3, 4, 0.3, [0.3, 0.3, 0.32]);
    g.box(r[0], 4, r[2], 0.3, 4, 0.3, [0.3, 0.3, 0.32]);
    const t = 6;
    const yaw = Math.atan2(-track.tz[t], track.tx[t]);
    const m = P(6, 0, 0);
    g.box(m[0], 7.6, m[2], 0.4, 0.4, hw + 2.2, [0.15, 0.15, 0.17], yaw);
  }

  // Trees.
  let placed = 0;
  for (let attempt = 0; attempt < 3000 && placed < 260; attempt++) {
    const x = minX - pad * 0.8 + rng.next() * (maxX - minX + pad * 1.6);
    const z = minZ - pad * 0.8 + rng.next() * (maxZ - minZ + pad * 1.6);
    let near = false;
    for (let j = 0; j < track.n; j += 4) {
      if (Math.hypot(track.x[j] - x, track.z[j] - z) < 40) {
        near = true;
        break;
      }
    }
    if (near) continue;
    placed++;
    const h = 4 + rng.next() * 5;
    g.box(x, h / 2, z, 0.4, h / 2, 0.4, [0.36, 0.25, 0.16]);
    const green = [0.16 + rng.next() * 0.08, 0.36 + rng.next() * 0.12, 0.14];
    g.box(x, h + 1.4, z, 2.6, 1.8, 2.6, green, rng.next() * Math.PI);
    g.box(x, h + 3.6, z, 1.6, 1.2, 1.6, green.map((c) => c * 1.1), rng.next() * Math.PI);
  }
  return g;
}

/** Car model, nose pointing +x. */
function buildCar(color: string): Geometry {
  const g = new Geometry();
  const c = hexToRgb(color);
  const dark = CARBON;
  g.box(0, 0.3, 0, 2.3, 0.1, 0.8, dark); // floor
  g.box(0.1, 0.58, 0, 1.6, 0.24, 0.42, c); // tub
  for (const z of [0.62, -0.62]) g.box(-0.25, 0.52, z, 0.9, 0.2, 0.22, c); // sidepods
  g.box(-0.95, 0.82, 0, 0.8, 0.22, 0.2, c); // engine cover
  g.box(1.85, 0.45, 0, 0.75, 0.11, 0.17, c); // nose
  g.box(2.5, 0.2, 0, 0.18, 0.04, 0.95, dark); // front wing
  for (const z of [0.93, -0.93]) g.box(2.5, 0.3, z, 0.25, 0.12, 0.03, c);
  g.box(-2.3, 1.05, 0, 0.22, 0.05, 0.62, c); // rear wing
  for (const z of [0.6, -0.6]) g.box(-2.3, 0.82, z, 0.25, 0.28, 0.03, dark);
  g.box(0.35, 0.9, 0, 0.38, 0.06, 0.25, dark); // halo
  g.box(0.25, 0.98, 0, 0.16, 0.13, 0.14, [0.96, 0.85, 0.2]); // helmet
  for (const z of [0.86, -0.86]) g.box(1.45, 0.36, z, 0.36, 0.36, 0.2, [0.07, 0.07, 0.07]); // front wheels
  for (const z of [0.84, -0.84]) g.box(-1.5, 0.38, z, 0.38, 0.38, 0.25, [0.07, 0.07, 0.07]); // rear wheels
  return g;
}

function buildUnitBox(): Geometry {
  const g = new Geometry();
  g.box(0, 0, 0, 0.5, 0.5, 0.5, [1, 1, 1], 0, false);
  return g;
}

interface CamState {
  eye: number[];
  target: number[];
}

export class RaceScene {
  renderer: Renderer;
  private world: Mesh;
  private carMeshes = new Map<string, Mesh>();
  private unit: Mesh;
  private cam: CamState | null = null;
  private tvSpots: number[][] = [];
  private minimapPath: Path2D | null = null;
  private mapTransform = { scale: 1, ox: 0, oz: 0 };

  constructor(canvas: HTMLCanvasElement, private overlay: HTMLCanvasElement, private track: Track, cars: { id: string; color: string }[]) {
    this.renderer = new Renderer(canvas);
    this.world = this.renderer.upload(buildWorld(track));
    this.unit = this.renderer.upload(buildUnitBox());
    for (const c of cars) this.carMeshes.set(c.id, this.renderer.upload(buildCar(c.color)));
    // TV camera spots: outside of tight corners, raised.
    for (let i = 0; i < track.n; i += 60) {
      const k = track.k[i];
      const side = k > 0 ? -1 : 1;
      const p = worldPos(track, i * (track.length / track.n), side * (track.halfWidth + 30));
      this.tvSpots.push([p.x, 14, p.z]);
    }
  }

  private carPose(car: RaceCar) {
    const w = worldPos(this.track, car.s, car.d);
    // Heading = track direction rotated by the car's yaw (left normal is (tz, -tx)).
    const c = Math.cos(car.yaw ?? 0), sn = Math.sin(car.yaw ?? 0);
    const hx = c * w.tx + sn * w.tz;
    const hz = c * w.tz - sn * w.tx;
    const yaw = Math.atan2(-hz, hx);
    return { x: w.x, z: w.z, fx: hx, fz: hz, tx: w.tx, tz: w.tz, yaw };
  }

  private drawLine(car: RaceCar) {
    const r = this.renderer;
    const prof = speedProfile(this.track, car.perf);
    const COLORS = [[0.15, 0.9, 0.3], [1, 0.82, 0.1], [1, 0.15, 0.1]];
    let prev = worldPos(this.track, car.s - 12, lineOffset(this.track, car.s - 12));
    for (let x = -8; x <= 300; x += 4) {
      const s = car.s + x;
      const w = worldPos(this.track, s, lineOffset(this.track, s));
      const dx = w.x - prev.x, dz = w.z - prev.z;
      const len = Math.hypot(dx, dz);
      const col = COLORS[assistColor(this.track, prof, car, x)];
      const fade = x > 220 ? 1 - (x - 220) / 100 : 1;
      r.draw(this.unit, mat4.multiply(mat4.fromPose((w.x + prev.x) / 2, 0.24, (w.z + prev.z) / 2, Math.atan2(-dz, dx)), scale(len * 0.8, 0.02, 0.5)), col.map((v) => v * (0.55 + 0.45 * fade)));
      prev = w;
    }
  }

  render(race: Race, mode: CameraMode, followId: string, dt: number, opts: { line?: boolean } = {}) {
    const r = this.renderer;
    r.resize();
    const follow = race.cars.find((c) => c.id === followId) ?? race.cars[0];
    const p = this.carPose(follow);
    let eye: number[];
    let target: number[];
    let fog: [number, number] = [250, 1300];
    let fov = 0.95;
    if (mode === "chase") {
      // Look a little ahead along the track so corners are visible.
      // Camera sits behind the car, between its heading and the track direction (no swing when sliding).
      const bx = 0.6 * p.fx + 0.4 * p.tx, bz = 0.6 * p.fz + 0.4 * p.tz;
      const bl = Math.hypot(bx, bz) || 1;
      eye = [p.x - (bx / bl) * 10.5, 4.2, p.z - (bz / bl) * 10.5];
      target = [p.x + (bx / bl) * 16, 1.2, p.z + (bz / bl) * 16];
    } else if (mode === "cockpit") {
      eye = [p.x + p.fx * 0.1, 1.3, p.z + p.fz * 0.1];
      target = [p.x + p.fx * 25, 0.9, p.z + p.fz * 25];
      fov = 1.1;
    } else if (mode === "tv") {
      let best = this.tvSpots[0];
      let bd = Infinity;
      for (const s of this.tvSpots) {
        const d = Math.hypot(s[0] - p.x, s[2] - p.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      eye = best;
      target = [p.x, 0.8, p.z];
      fov = Math.max(0.2, Math.min(0.9, 22 / Math.max(10, bd)));
    } else {
      let cx = 0, cz = 0;
      for (let i = 0; i < this.track.n; i++) {
        cx += this.track.x[i];
        cz += this.track.z[i];
      }
      cx /= this.track.n;
      cz /= this.track.n;
      eye = [cx - 120, 620, cz + 520];
      target = [cx, 0, cz - 20];
      fog = [2000, 3500];
      fov = 0.9;
    }
    // Smooth the chase and onboard cameras.
    if (this.cam && (mode === "chase" || mode === "cockpit")) {
      // Frame-rate independent smoothing; stiff enough not to lag behind the car.
      const a = 1 - Math.exp(-dt * (mode === "chase" ? 12 : 30));
      eye = this.cam.eye.map((v, i) => v + (eye[i] - v) * a);
      target = this.cam.target.map((v, i) => v + (target[i] - v) * a);
    }
    this.cam = { eye, target };
    r.begin(eye, target, SKY, fog, fov, mode === "overview" ? 60 : mode === "tv" ? 3 : 0.6);
    r.draw(this.world);
    if (opts.line && mode !== "overview") this.drawLine(follow);

    // Start lights on the gantry.
    const gantry = worldPos(this.track, 6 * (this.track.length / this.track.n), 0);
    const lit = race.t < 0 ? Math.min(5, Math.floor((race.t + 3) / 0.6) + 1) : 0;
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 1.6;
      const lp = worldPos(this.track, 6 * (this.track.length / this.track.n), off);
      r.draw(this.unit, mat4.multiply(mat4.fromPose(lp.x, 7.1, lp.z, Math.atan2(-gantry.tz, gantry.tx)), scale(0.5, 0.6, 0.6)), i < lit ? [1, 0.1, 0.05] : [0.15, 0.05, 0.05]);
    }

    for (const car of race.cars) {
      const cp = this.carPose(car);
      const mesh = this.carMeshes.get(car.id)!;
      const bounce = car.offTrack ? Math.sin(race.t * 40 + car.s) * 0.05 : 0;
      r.draw(mesh, mat4.fromPose(cp.x, 0.2 + bounce, cp.z, cp.yaw));
      // Rear light: cyan when boosting, red when braking hard.
      const rear = [cp.x - cp.fx * 2.55, 0.82, cp.z - cp.fz * 2.55];
      const glow = car.boosting ? [0.3, 1.6, 1.8] : [0.9, 0.12, 0.1];
      r.draw(this.unit, mat4.multiply(mat4.fromPose(rear[0], rear[1], rear[2], cp.yaw), scale(0.12, car.boosting ? 0.35 : 0.14, 0.3)), glow);
    }

    this.drawOverlay(race, follow, mode);
  }

  private drawOverlay(race: Race, follow: RaceCar, mode: CameraMode) {
    const ov = this.overlay;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = ov.clientWidth, h = ov.clientHeight;
    if (ov.width !== Math.floor(w * dpr) || ov.height !== Math.floor(h * dpr)) {
      ov.width = Math.floor(w * dpr);
      ov.height = Math.floor(h * dpr);
    }
    const ctx = ov.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const order = classification(race);

    // Name tags over cars.
    ctx.font = "600 12px Barlow, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const car of race.cars) {
      if (car === follow && (mode === "cockpit" || mode === "chase")) continue;
      const cp = this.carPose(car);
      const pt = this.renderer.project([cp.x, 2.4, cp.z]);
      if (!pt || pt.depth > 600) continue;
      const pos = order.indexOf(car) + 1;
      const label = `P${pos} ${car.isPlayer ? "YOU" : car.name.split(" ").slice(-1)[0]}`;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = car.isPlayer ? "rgba(240,181,74,0.92)" : "rgba(20,22,26,0.78)";
      ctx.fillRect(pt.x - tw / 2, pt.y - 18, tw, 18);
      ctx.fillStyle = car.isPlayer ? "#15171a" : "#eef0f2";
      ctx.fillText(label, pt.x, pt.y - 5);
    }

    // Minimap (top right).
    const size = Math.min(190, w * 0.32);
    const mx = w - size - 14, my = 14;
    if (!this.minimapPath) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < this.track.n; i++) {
        minX = Math.min(minX, this.track.x[i]); maxX = Math.max(maxX, this.track.x[i]);
        minZ = Math.min(minZ, this.track.z[i]); maxZ = Math.max(maxZ, this.track.z[i]);
      }
      const scale = 1 / Math.max(maxX - minX, maxZ - minZ);
      this.mapTransform = { scale, ox: minX, oz: minZ };
      const path = new Path2D();
      for (let i = 0; i <= this.track.n; i += 4) {
        const j = i % this.track.n;
        const x = (this.track.x[j] - minX) * scale, z = (this.track.z[j] - minZ) * scale;
        if (i === 0) path.moveTo(x, z);
        else path.lineTo(x, z);
      }
      path.closePath();
      this.minimapPath = path;
    }
    ctx.save();
    ctx.fillStyle = "rgba(20,22,26,0.7)";
    ctx.fillRect(mx - 8, my - 8, size + 16, size * 0.72 + 16);
    ctx.translate(mx, my);
    ctx.scale(size, size);
    ctx.lineWidth = 6 / size;
    ctx.strokeStyle = "rgba(238,240,242,0.85)";
    ctx.stroke(this.minimapPath);
    const t = this.mapTransform;
    for (const car of [...race.cars].sort((a) => (a.isPlayer ? 1 : -1))) {
      const wp = worldPos(this.track, car.s, car.d);
      ctx.beginPath();
      ctx.arc((wp.x - t.ox) * t.scale, (wp.z - t.oz) * t.scale, (car.isPlayer ? 7 : 5) / size, 0, Math.PI * 2);
      ctx.fillStyle = car.color;
      ctx.fill();
      if (car.isPlayer) {
        ctx.lineWidth = 2.5 / size;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    }
    // Start line marker
    ctx.fillStyle = "#ffffff";
    ctx.fillRect((this.track.x[0] - t.ox) * t.scale - 1 / size, (this.track.z[0] - t.oz) * t.scale - 6 / size, 2 / size, 12 / size);
    ctx.restore();
  }
}

function scale(x: number, y: number, z: number) {
  const m = mat4.identity();
  m[0] = x * 2;
  m[5] = y * 2;
  m[10] = z * 2;
  return m;
}
