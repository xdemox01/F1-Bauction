// Race simulation. Each car moves along the circuit (distance s) with a lateral
// offset d. Speed is limited by power, drag, braking, and grip in corners;
// going faster than the grip allows pushes the car wide, and leaving the track
// costs speed. All behaviour comes from the Performance numbers derived from
// the team's cards.

import { uniform } from "../../lib/game/rng.ts";
import type { Rng } from "../../lib/game/rng.ts";
import type { Performance } from "./performance.ts";
import { sampleAt, wrap } from "./track.ts";
import type { Track } from "./track.ts";

export const RACE_RULES = {
  defaultLaps: 3,
  mandatoryStops: 1,
  missedStopPenalty: 10,
  contactPenalty: 2,
  contactPenaltyThreshold: 6, // closing speed (m/s) above which the car behind is penalised
  pitLaneSpeed: 22,
  boost: { drainPerSec: 26, rechargePerSec: 3.5, regenPerSec: 14, cooldownSec: 3, powerBonus: 3.2, topSpeedBonus: 1.07, minToStart: 15 },
  startCountdownSec: 3,
  points: [25, 18, 15, 12, 10, 8],
  carLength: 5,
  carWidth: 2,
};

export type ControlMode = "drive" | "principal";
export type PaceMode = "push" | "normal" | "save";

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. 1 (left)
  boost: boolean;
  /** Put the car back on track (R key). */
  reset?: boolean;
}

export interface PrincipalCommands {
  pace: PaceMode;
  boost: boolean;
}

export interface RaceCar {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  perf: Performance;
  // Dynamic state
  s: number;
  d: number;
  v: number;
  lap: number; // completed laps; -1 before first crossing the line
  wear: number; // 0 = new tyres, 1 = completely worn
  boost: number; // 0..100
  boostCooldown: number;
  boosting: boolean;
  pitRequested: boolean;
  pit: null | { phase: "in" | "stopped" | "out"; remaining: number; duration: number; slow: boolean };
  pitStops: number[];
  penalties: number;
  contacts: number;
  lastContactAt: number;
  mistakeUntil: number;
  offTrack: boolean;
  sliding: boolean;
  finished: boolean;
  finishTime: number | null;
  steerVisual: number;
  /** Heading relative to the track direction, rad (positive = pointing left). */
  yaw: number;
  /** Front-wheel steering angle, rad. */
  steerAngle: number;
  /** Smoothed pedal positions 0..1. */
  thr: number;
  brk: number;
  /** AI difficulty multiplier on how close to the limit the AI drives (1 = normal). */
  aiSkill?: number;
  // AI pacing for the player's car in Team principal mode
  pace: PaceMode;
  /** Multiplayer: commands from this car's manager (pace and boost), applied to the AI driver. */
  commands?: PrincipalCommands;
  /** Multiplayer arcade: the car is driven in a player's browser and its state is set from reports. */
  remote?: boolean;
}

export interface RaceEvent {
  t: number;
  carId: string;
  text: string;
}

export interface Race {
  track: Track;
  laps: number;
  t: number;
  started: boolean;
  finished: boolean;
  cars: RaceCar[];
  events: RaceEvent[];
  mode: ControlMode;
}

export interface Entry {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  perf: Performance;
  /** Higher = better grid slot. */
  gridScore: number;
}

export function createRace(track: Track, entries: Entry[], opts: { laps?: number; mode?: ControlMode } = {}): Race {
  const grid = [...entries].sort((a, b) => b.gridScore - a.gridScore);
  const cars: RaceCar[] = grid.map((e, i) => ({
    id: e.id,
    name: e.name,
    color: e.color,
    isPlayer: e.isPlayer,
    perf: e.perf,
    s: wrap(-12 - i * 9, track.length),
    d: i % 2 === 0 ? 2.8 : -2.8,
    v: 0,
    lap: -1,
    wear: 0,
    boost: 60,
    boostCooldown: 0,
    boosting: false,
    pitRequested: false,
    pit: null,
    pitStops: [],
    penalties: 0,
    contacts: 0,
    lastContactAt: -10,
    mistakeUntil: 0,
    offTrack: false,
    sliding: false,
    finished: false,
    finishTime: null,
    steerVisual: 0,
    yaw: 0,
    steerAngle: 0,
    thr: 0,
    brk: 0,
    pace: "normal",
  }));
  return { track, laps: opts.laps ?? RACE_RULES.defaultLaps, t: -RACE_RULES.startCountdownSec, started: false, finished: false, cars, events: [], mode: opts.mode ?? "drive" };
}

export function raceDistance(race: Race, car: RaceCar): number {
  // Before the first crossing the car is behind the line: negative distance.
  if (car.lap < 0) return car.s - race.track.length;
  return car.lap * race.track.length + car.s;
}

export function classification(race: Race): RaceCar[] {
  return [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return totalTime(a) - totalTime(b);
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return raceDistance(race, b) - raceDistance(race, a);
  });
}

export function missedStop(car: RaceCar): boolean {
  return car.pitStops.length < RACE_RULES.mandatoryStops;
}

export function totalTime(car: RaceCar): number {
  return (car.finishTime ?? Infinity) + car.penalties + (missedStop(car) ? RACE_RULES.missedStopPenalty : 0);
}

/** Speed the grip allows through curvature k. */
export function cornerLimit(car: RaceCar, k: number): number {
  const grip = car.perf.grip * (1 - 0.32 * car.wear);
  const ak = Math.abs(k);
  return ak < 1e-5 ? Infinity : Math.sqrt(grip / ak);
}

function aiTargetSpeed(race: Race, car: RaceCar, skill: number): number {
  const brake = car.perf.brake * 0.92;
  let target = car.perf.topSpeed * (car.boosting ? RACE_RULES.boost.topSpeedBonus : 1);
  for (let x = 0; x <= 220; x += 6) {
    const k = sampleAt(race.track, car.s + x).k;
    const lim = cornerLimit(car, k) * skill;
    const reachable = Math.sqrt(lim * lim + 2 * brake * x);
    if (reachable < target) target = reachable;
  }
  return target;
}

function aiControl(race: Race, car: RaceCar, rng: Rng, commands?: PrincipalCommands): CarInput {
  if (commands) car.pace = commands.pace;
  const paceMode: PaceMode = car.pace;
  const paceFactor = paceMode === "push" ? 1.0 : paceMode === "normal" ? 0.985 : 0.955;
  const mistake = race.t < car.mistakeUntil ? 1.12 : 1;
  const skill = car.perf.skill * paceFactor * mistake * (car.aiSkill ?? 1);
  const target = aiTargetSpeed(race, car, skill);
  let throttle = 0;
  let brake = 0;
  if (car.v < target - 0.5) throttle = 1;
  else if (car.v > target + 1.2) brake = Math.min(1, (car.v - target) / 6);
  else throttle = 0.4;

  // Racing line: outside on entry, inside at the apex, outside on exit.
  const hw = race.track.halfWidth;
  let dTarget = lineOffset(race.track, car.s + Math.max(8, car.v * 0.35));

  // Overtaking / avoiding the car in front.
  const ahead = carAhead(race, car, 35);
  if (ahead && Math.abs(ahead.d - car.d) < 3.2 && ahead.v < car.v + 4) {
    const side = ahead.d > 0 ? -1 : 1;
    // Better racecraft = more willing to go for a gap; everyone moves over for a much slower car.
    const want = car.perf.racecraft > 0.2 || ahead.v < car.v - 2;
    if (want) dTarget = Math.max(-hw + 1.5, Math.min(hw - 1.5, ahead.d + side * 3.6));
  }
  // Defend: a car close behind makes the AI cover the inside of the next corner (once, not weaving).
  const behind = carBehind(race, car, 14);
  if (behind && car.perf.racecraft > 0.35 && !ahead) {
    const kNext = sampleAt(race.track, car.s + 80).k;
    if (Math.abs(kNext) > 1 / 200) dTarget = dTarget * 0.4 + Math.sign(kNext) * hw * 0.35;
  }

  // Boxed in: don't drive into the back of a slower car in the same line.
  if (ahead) {
    const gap = raceDistance(race, ahead) - raceDistance(race, car);
    if (gap < 12 && Math.abs(ahead.d - car.d) < 2.4 && car.v > ahead.v) {
      throttle = 0;
      brake = Math.max(brake, Math.min(1, (car.v - ahead.v) / 5));
    }
  }

  // Boost: on straights, when chasing someone, or pushing.
  const straightAhead = Math.abs(sampleAt(race.track, car.s + 60).k) < 0.002 && Math.abs(sampleAt(race.track, car.s + 140).k) < 0.003;
  let boost = false;
  // With commands, "boost on" lets the driver use it where it helps (straights) rather than draining it everywhere.
  if (commands) boost = commands.boost && (straightAhead || ahead !== null) && car.boost > 20;
  else if (straightAhead && car.boost > 35 && (ahead !== null || paceMode === "push" || car.boost > 90)) boost = true;

  // Random mistakes: less consistent drivers overcook corners more often.
  if (!commands && race.t > car.mistakeUntil && rng.next() < (1 - car.perf.consistency) * 0.0016) {
    car.mistakeUntil = race.t + uniform(rng, 0.8, 1.6);
  }
  return { throttle, brake, steer: steerTo(race, car, dTarget), boost };
}

/** Steering controller used by the AI: aims for a lateral offset a little way ahead, through the same physics as the player. */
function steerTo(race: Race, car: RaceCar, dTarget: number): number {
  const v = Math.max(car.v, 6);
  const look = Math.max(10, v * 0.55);
  const kA = sampleAt(race.track, car.s + look * 0.4).k;
  const psiDes = Math.atan2(dTarget - car.d, look);
  const omega = kA * v + 2.4 * (psiDes - car.yaw);
  const delta = Math.atan((omega * WHEELBASE) / v);
  return Math.max(-1, Math.min(1, delta / maxSteer(car.v)));
}

function carBehind(race: Race, car: RaceCar, within: number): RaceCar | null {
  const me = raceDistance(race, car);
  for (const o of race.cars) {
    if (o === car || o.pit || o.finished) continue;
    const gap = me - raceDistance(race, o);
    if (gap > 0 && gap < within) return o;
  }
  return null;
}

// --- Racing line ----------------------------------------------------------
const lineCache = new WeakMap<Track, Float64Array>();

function smoothCircular(src: Float64Array, w: number): Float64Array {
  const n = src.length;
  const out = new Float64Array(n);
  let sum = 0;
  for (let j = -w; j <= w; j++) sum += src[(j + n) % n];
  for (let i = 0; i < n; i++) {
    out[i] = sum / (2 * w + 1);
    sum += src[(i + w + 1) % n] - src[(i - w + n) % n];
  }
  return out;
}

/** Lateral offset of the ideal line at every track sample (outside-inside-outside). */
export function racingLine(track: Track): Float64Array {
  const cached = lineCache.get(track);
  if (cached) return cached;
  const n = track.n;
  const inside = new Float64Array(n);
  for (let i = 0; i < n; i++) inside[i] = Math.tanh(track.k[i] * 260);
  const narrow = smoothCircular(smoothCircular(inside, 8), 8);
  const wide = smoothCircular(smoothCircular(inside, 34), 34);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.max(-1, Math.min(1, 2.2 * narrow[i] - 1.6 * wide[i]));
  const line = smoothCircular(smoothCircular(raw, 10), 10);
  for (let i = 0; i < n; i++) line[i] *= track.halfWidth * 0.78;
  lineCache.set(track, line);
  return line;
}

export function lineOffset(track: Track, s: number): number {
  const line = racingLine(track);
  const step = track.length / track.n;
  const u = wrap(s, track.length) / step;
  const i = Math.floor(u) % track.n;
  const f = u - Math.floor(u);
  return line[i] + (line[(i + 1) % track.n] - line[i]) * f;
}

// --- Vehicle physics -------------------------------------------------------
export const WHEELBASE = 3.6;
export const PHYS = {
  /** Steering lock at walking pace, rad; it shrinks with speed. */
  steerLock: 0.34,
  steerSpeedRef: 26,
  /** How fast the wheel turns, rad/s. */
  steerRate: 1.0,
  kerbWidth: 1.4,
  /** Barrier distance beyond the track edge, m. */
  wall: 12,
  grassGrip: 0.55,
};

export function maxSteer(v: number): number {
  return PHYS.steerLock / (1 + v / PHYS.steerSpeedRef);
}

const approach = (x: number, target: number, maxStep: number) => (x < target ? Math.min(target, x + maxStep) : Math.max(target, x - maxStep));

/**
 * One physics step for a car on track. Pedals and steering are smoothed; the
 * front tyres can only give so much lateral force (less while braking), so
 * asking for more than the grip makes the car understeer wide and scrub speed.
 * Returns the distance travelled along the centre line.
 */
function drive(race: Race, car: RaceCar, inp: CarInput, dt: number): number {
  const track = race.track;
  const hw = track.halfWidth;
  const B = RACE_RULES.boost;
  if (inp.reset) {
    car.d = Math.max(-hw + 2, Math.min(hw - 2, lineOffset(track, car.s)));
    car.yaw = 0;
    car.steerAngle = 0;
    car.v = Math.min(car.v, 8);
    race.events.push({ t: race.t, carId: car.id, text: "Car reset onto the track" });
  }
  car.thr = approach(car.thr, Math.max(0, Math.min(1, inp.throttle)), dt * (inp.throttle > car.thr ? 3.2 : 7));
  car.brk = approach(car.brk, Math.max(0, Math.min(1, inp.brake)), dt * (inp.brake > car.brk ? 6 : 9));
  const v = car.v;
  const lock = maxSteer(v);
  const rate = PHYS.steerRate * (0.75 + car.perf.steerRate / 40);
  car.steerAngle = approach(car.steerAngle, Math.max(-1, Math.min(1, inp.steer)) * lock, rate * dt);
  car.steerAngle = Math.max(-lock, Math.min(lock, car.steerAngle));

  const absd = Math.abs(car.d);
  const onGrass = absd > hw + PHYS.kerbWidth;
  car.offTrack = onGrass;
  const grip = car.perf.grip * (1 - 0.32 * car.wear) * (onGrass ? PHYS.grassGrip : 1);
  const top = car.perf.topSpeed * (car.boosting ? B.topSpeedBonus : 1) * (onGrass ? 0.45 : 1);

  // Lateral: kinematic yaw rate, capped by tyre grip (less grip available under braking).
  const latAvail = grip * Math.sqrt(Math.max(0.25, 1 - 0.6 * car.brk * car.brk));
  let omega = (v / WHEELBASE) * Math.tan(car.steerAngle);
  let scrub = 0;
  car.sliding = false;
  const demand = Math.abs(v * omega);
  if (v > 2 && demand > latAvail) {
    const over = demand / latAvail;
    omega = (Math.sign(omega) * latAvail) / v; // understeer: the car runs wide
    car.sliding = over > 1.1;
    scrub = Math.min(over - 1, 1.2) * 5;
    car.wear = Math.min(1, car.wear + (over - 1) * 0.0025 * dt);
  }
  const latUse = Math.min(1, Math.abs(v * omega) / Math.max(1, grip));

  // Longitudinal: power fades with speed; braking and traction share the tyre with cornering.
  let a = 0;
  a += car.thr * (car.perf.accel + (car.boosting ? B.powerBonus : 0)) * Math.max(0, 1 - (v / top) ** 2) * (1 - 0.45 * latUse * latUse);
  a -= car.brk * car.perf.brake * (onGrass ? 0.55 : 1) * (1 - 0.35 * latUse * latUse);
  a -= 0.012 * v + scrub;
  if (onGrass) a -= 0.04 * v;
  if (v > top) a -= (v - top) * 1.5;
  car.v = Math.max(0, v + a * dt);

  // Move in track coordinates.
  const k = sampleAt(track, car.s).k;
  const sDot = (car.v * Math.cos(car.yaw)) / Math.max(0.3, 1 - k * car.d);
  car.yaw += (omega - k * sDot) * dt;
  car.yaw = Math.max(-1.1, Math.min(1.1, car.yaw));
  car.d += car.v * Math.sin(car.yaw) * dt;
  // Barriers.
  const wall = hw + PHYS.wall;
  if (Math.abs(car.d) > wall) {
    const out = Math.sign(car.d);
    car.d = out * wall;
    if (Math.sign(car.yaw) === out) {
      const hit = car.v * Math.abs(Math.sin(car.yaw));
      car.v *= Math.max(0.35, 1 - hit / 25);
      car.yaw = -car.yaw * 0.25;
      if (hit > 4 && race.t - car.lastContactAt > 1) {
        car.lastContactAt = race.t;
        race.events.push({ t: race.t, carId: car.id, text: "Hit the barrier" });
      }
    }
  }
  car.steerVisual += (car.steerAngle / Math.max(0.05, lock) - car.steerVisual) * Math.min(1, dt * 8);
  return sDot * dt;
}

function carAhead(race: Race, car: RaceCar, within: number): RaceCar | null {
  let best: RaceCar | null = null;
  let bestGap = within;
  const me = raceDistance(race, car);
  for (const o of race.cars) {
    if (o === car || o.pit || o.finished) continue;
    const gap = raceDistance(race, o) - me;
    if (gap > 0 && gap < bestGap) {
      bestGap = gap;
      best = o;
    }
  }
  return best;
}

function wantsPit(race: Race, car: RaceCar): boolean {
  if (car.pitStops.length >= RACE_RULES.mandatoryStops && car.wear < 0.75) return false;
  const lapsLeft = race.laps - car.lap - 1;
  if (car.pitStops.length < RACE_RULES.mandatoryStops) {
    // Stop once tyres are worn, or at the last chance. A better strategist (team principal) times it closer to ideal.
    const strategy = (car.perf as { strategy?: number }).strategy ?? 0.5;
    return car.wear > 0.36 - 0.08 * strategy || lapsLeft <= 1;
  }
  return false;
}

export interface StepInput {
  /** Manual input for the player's car (Drive mode). */
  player?: CarInput;
  /** Commands for the player's car (Team principal mode). */
  principal?: PrincipalCommands;
  /** Player pressed the pit button (either mode). */
  playerPit?: boolean;
}

export function step(race: Race, dt: number, input: StepInput, rng: Rng): void {
  race.t += dt;
  if (race.t < 0) return; // start lights
  race.started = true;
  const track = race.track;
  const B = RACE_RULES.boost;

  for (const car of race.cars) {
    if (car.isPlayer && input.playerPit && !car.finished) {
      car.pitRequested = !car.pitRequested;
      race.events.push({ t: race.t, carId: car.id, text: car.pitRequested ? "Box this lap" : "Pit call cancelled" });
    }
  }

  for (const car of race.cars) {
    if (car.remote) continue; // state comes from the driver's browser
    const k = sampleAt(track, car.s).k;
    let inp: CarInput;
    if (car.finished) {
      inp = { throttle: car.v > 30 ? 0 : 0.3, brake: car.v > 30 ? 0.3 : 0, steer: steerTo(race, car, lineOffset(track, car.s + 20) * 0.5), boost: false };
    } else if (car.isPlayer && race.mode === "drive" && input.player) {
      inp = input.player;
    } else if (car.isPlayer && race.mode === "principal") {
      inp = aiControl(race, car, rng, input.principal ?? { pace: "normal", boost: false });
    } else if (car.commands) {
      inp = aiControl(race, car, rng, car.commands);
      if (!car.pitRequested && wantsPit(race, car)) car.pitRequested = true;
    } else {
      inp = aiControl(race, car, rng);
      if (!car.pitRequested && wantsPit(race, car)) car.pitRequested = true;
    }

    // --- Pit lane ---------------------------------------------------------
    if (car.pit) {
      const p = car.pit;
      if (p.phase === "stopped") {
        car.v = 0;
        p.remaining -= dt;
        if (p.remaining <= 0) {
          p.phase = "out";
          car.wear = 0;
          car.pitStops.push(p.duration);
          race.events.push({ t: race.t, carId: car.id, text: `Pit stop ${p.duration.toFixed(1)} s${p.slow ? " (slow stop)" : ""}` });
        }
      } else {
        car.v = Math.min(RACE_RULES.pitLaneSpeed, car.v + 6 * dt);
        car.d += (-(track.halfWidth + 5) - car.d) * Math.min(1, dt * 2);
        car.yaw = 0;
        car.steerAngle = 0;
        if (p.phase === "in" && car.lap >= 0 && car.s >= track.pitBox && car.s < track.pitBox + 40) {
          p.phase = "stopped";
        }
        if (p.phase === "out" && car.s >= track.pitExit && car.s < track.pitExit + 60) {
          car.pit = null;
        }
      }
      advance(race, car, dt, rng);
      continue;
    }
    // Pit entry is just before the line; stops aren't allowed on the final lap.
    if (car.pitRequested && !car.finished && car.s >= track.pitEntry && car.s < track.pitEntry + 30 && car.lap >= 0) {
      if (car.lap < race.laps - 1) {
        const slow = rng.next() < car.perf.slowStopChance;
        const duration = Math.max(1.6, car.perf.pitTime + uniform(rng, -car.perf.pitVariance, car.perf.pitVariance) + (slow ? uniform(rng, 2, 4) : 0));
        car.pit = { phase: "in", remaining: duration, duration, slow };
        car.pitRequested = false;
        race.events.push({ t: race.t, carId: car.id, text: "Into the pits" });
        car.v = Math.min(car.v, 40);
        advance(race, car, dt, rng);
        continue;
      }
    }

    // --- Boost ----------------------------------------------------------
    car.boostCooldown = Math.max(0, car.boostCooldown - dt);
    const canBoost = car.boostCooldown === 0 && car.boost > 0 && (car.boosting || car.boost >= B.minToStart);
    car.boosting = inp.boost && canBoost && inp.throttle > 0.5;
    if (car.boosting) {
      car.boost = Math.max(0, car.boost - B.drainPerSec * dt);
      if (car.boost === 0) {
        car.boostCooldown = B.cooldownSec;
        car.boosting = false;
        if (car.isPlayer) race.events.push({ t: race.t, carId: car.id, text: "Boost empty: recharging" });
      }
    } else {
      car.boost = Math.min(100, car.boost + (B.rechargePerSec + B.regenPerSec * inp.brake * car.perf.regen) * dt);
    }

    const ds = drive(race, car, inp, dt);
    advance(race, car, dt, rng, ds);
  }

  resolveContacts(race);

  // Race over when everyone has finished (or after a generous time limit).
  if (race.cars.every((c) => c.finished) || race.t > race.laps * 240) race.finished = true;
}

function advance(race: Race, car: RaceCar, dt: number, _rng: Rng, ds = car.v * dt) {
  const track = race.track;
  const before = car.s;
  car.s += ds;
  const paceWear = car.pace === "push" ? 1.15 : car.pace === "save" ? 0.8 : 1;
  if (!car.pit) car.wear = Math.min(1, car.wear + ((car.v * dt) / track.length) * car.perf.tyreWearPerLap * paceWear);
  if (car.s >= track.length) {
    car.s -= track.length;
    if (!car.finished) {
      car.lap += 1;
      if (car.lap >= race.laps) {
        car.finished = true;
        // Interpolate the exact crossing time.
        const frac = (track.length - before) / Math.max(1e-6, ds);
        car.finishTime = race.t - dt + dt * Math.min(1, Math.max(0, frac));
        race.events.push({ t: race.t, carId: car.id, text: "Finished" });
      }
    }
  }
}

function resolveContacts(race: Race) {
  const cars = race.cars.filter((c) => !c.pit && !c.remote && c.lap >= -1);
  const L = race.track.length;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let ds = b.s - a.s;
      if (ds > L / 2) ds -= L;
      if (ds < -L / 2) ds += L;
      const dd = b.d - a.d;
      if (Math.abs(ds) < RACE_RULES.carLength && Math.abs(dd) < RACE_RULES.carWidth) {
        const [rear, front] = ds > 0 ? [a, b] : [b, a];
        const closing = rear.v - front.v;
        // Separate the cars.
        const push = (RACE_RULES.carWidth - Math.abs(dd)) / 2 + 0.05;
        const dir = dd >= 0 ? 1 : -1;
        b.d += dir * push;
        a.d -= dir * push;
        if (closing > 0) {
          rear.v = Math.max(0, front.v - 1);
          front.v = Math.max(0, front.v - closing * 0.15);
        }
        if (race.t - rear.lastContactAt > 1.5) {
          rear.lastContactAt = race.t;
          front.lastContactAt = race.t;
          rear.contacts++;
          if (closing > RACE_RULES.contactPenaltyThreshold) {
            rear.penalties += RACE_RULES.contactPenalty;
            race.events.push({ t: race.t, carId: rear.id, text: `Contact with ${front.name}: +${RACE_RULES.contactPenalty} s penalty` });
          } else {
            race.events.push({ t: race.t, carId: rear.id, text: `Contact with ${front.name}` });
          }
        }
      }
    }
  }
}

export function speedKmh(car: RaceCar): number {
  return Math.round(car.v * 3.6);
}

export function positionOf(race: Race, carId: string): number {
  return classification(race).findIndex((c) => c.id === carId) + 1;
}

export function gapToLeader(race: Race, car: RaceCar): string {
  const order = classification(race);
  const leader = order[0];
  if (leader === car) return "Leader";
  if (car.finished && leader.finished) return `+${(totalTime(car) - totalTime(leader)).toFixed(1)} s`;
  const dist = raceDistance(race, leader) - raceDistance(race, car);
  const laps = Math.floor(dist / race.track.length);
  if (laps >= 1) return `+${laps} lap${laps > 1 ? "s" : ""}`;
  return `+${(dist / Math.max(20, car.v)).toFixed(1)} s`;
}

