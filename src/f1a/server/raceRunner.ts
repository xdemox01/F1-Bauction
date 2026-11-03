// Runs the championship races on the server, in real time, for everyone in the lobby.
//
// Race Manager: every team runs both race drivers. The server drives all cars
// using each driver's stats; managers send live calls (pace, boost, box).
// Arcade: each manager drives their lead driver in their own browser and
// reports the car's state; the server checks the reports are physically
// plausible, runs AI teams itself, and takes over a car whose driver
// disconnects.

import type { Rng } from "../../lib/game/rng.ts";
import { norm, performance } from "../../grid/engine/performance.ts";
import type { Performance, TeamItems } from "../../grid/engine/performance.ts";
import { classification, createRace, gapToLeader, missedStop, RACE_RULES, step, totalTime } from "../../grid/engine/race.ts";
import type { Entry, PaceMode, Race } from "../../grid/engine/race.ts";
import { buildTrack } from "../../grid/engine/track.ts";
import type { Item } from "../shared/pool.ts";
import { AI_LEVEL_SKILL, RULES } from "../shared/rules.ts";
import type { Strategy } from "../shared/rules.ts";
import type { Action, RaceFrame, RaceResultRow, RaceView } from "../shared/types.ts";
import { FLAG } from "../shared/types.ts";
import type { Lobby, Manager, Result } from "./lobby.ts";

export const TRACK = buildTrack();
const STEP = 1 / 60;
const STALE_MS = 5000;

const asCard = (item: Item) => ({ attributes: item.attrs, overall: item.overall }) as unknown as TeamItems["driver"];

/** Performance for one car: driver + the team's car and crew, adjusted by the team principal. */
export function carPerformance(driver: Item, car: Item, crew: Item, principal: Item): Performance & { strategy: number } {
  const base = performance({ driver: asCard(driver), car: asCard(car), pit_crew: asCard(crew) });
  const dev = norm(principal.attrs.development);
  const lead = norm(principal.attrs.leadership);
  const strat = norm(principal.attrs.strategy);
  return {
    ...base,
    topSpeed: base.topSpeed * (1 + 0.015 * dev),
    grip: base.grip * (1 + 0.02 * dev),
    consistency: Math.min(1, base.consistency + 0.15 * lead),
    skill: base.skill + 0.005 * lead,
    pitTime: Math.max(1.8, base.pitTime - 0.25 * strat),
    strategy: strat,
  };
}

export const STRATEGY_COMMANDS: Record<Strategy, { pace: PaceMode; boost: boolean }> = {
  balanced: { pace: "normal", boost: true },
  aggressive: { pace: "push", boost: true },
  conservative: { pace: "save", boost: false },
};

interface CarMeta {
  carId: string;
  managerId: string;
  driverName: string;
  number: 1 | 2;
  human: boolean;
  lastReport: number;
}

export class RaceRunner {
  index = 0;
  total: number;
  stage: RaceView["stage"] = "grid";
  stageEndsAt: number | null = null;
  race: Race | null = null;
  speed = 1;
  private lastTick = 0;
  private acc = 0;
  meta: CarMeta[] = [];
  results: RaceResultRow[] | null = null;
  history: RaceView["history"] = [];

  private lobby: Lobby;
  private rng: Rng;

  constructor(lobby: Lobby, now: number, rng: Rng) {
    this.lobby = lobby;
    this.rng = rng;
    this.total = lobby.settings.races;
    this.startRace(now);
  }

  private teamItems(m: Manager) {
    const one = (c: Item["category"]) => m.squad.find((s) => s.item.category === c)!.item;
    const drivers = m.raceDrivers.map((id) => m.squad.find((s) => s.item.id === id)!.item);
    return { drivers, car: one("car"), crew: one("crew"), principal: one("principal") };
  }

  private startRace(now: number) {
    const arcade = this.lobby.settings.raceMode === "arcade";
    const entries: Entry[] = [];
    this.meta = [];
    for (const m of this.lobby.managers) {
      const t = this.teamItems(m);
      const drivers = arcade ? t.drivers.slice(0, 1) : t.drivers;
      drivers.forEach((d, i) => {
        const carId = `${m.id}-${i + 1}`;
        const perf = carPerformance(d, t.car, t.crew, t.principal);
        entries.push({
          id: carId,
          name: d.name,
          color: m.color,
          isPlayer: false,
          perf,
          gridScore: 0.4 * d.overall + 0.4 * t.car.overall + 0.2 * t.crew.overall + this.rng.next() * 2,
        });
        this.meta.push({ carId, managerId: m.id, driverName: d.name, number: (i + 1) as 1 | 2, human: arcade && !m.isBot, lastReport: now });
      });
    }
    const race = createRace(TRACK, entries, { laps: this.lobby.settings.laps, mode: "principal" });
    for (const car of race.cars) {
      const meta = this.meta.find((x) => x.carId === car.id)!;
      const m = this.lobby.managers.find((x) => x.id === meta.managerId)!;
      car.commands = { ...STRATEGY_COMMANDS[m.strategy] };
      car.pace = car.commands.pace;
      car.remote = meta.human;
      car.aiSkill = m.isBot ? AI_LEVEL_SKILL[this.lobby.settings.aiLevel ?? "normal"] : 1;
    }
    this.race = race;
    this.stage = "grid";
    this.stageEndsAt = now + (this.lobby.solo() ? 1500 : RULES.gridMs);
    this.results = null;
    this.speed = 1;
  }

  tick(now: number) {
    if (this.stage === "grid") {
      if (now >= (this.stageEndsAt ?? 0)) {
        this.stage = "running";
        this.stageEndsAt = null;
        this.lastTick = now;
        this.lobby.version++;
      }
      return;
    }
    if (this.stage === "running") {
      const race = this.race!;
      const dt = Math.min(1, (now - this.lastTick) / 1000) * this.speed;
      this.lastTick = now;
      this.acc += dt;
      while (this.acc >= STEP) {
        step(race, STEP, {}, this.rng);
        this.acc -= STEP;
      }
      // Arcade: hand silent cars to the AI.
      for (const meta of this.meta) {
        const car = race.cars.find((c) => c.id === meta.carId)!;
        if (car.remote && race.t > 0 && now - meta.lastReport > STALE_MS) this.takeOver(meta.carId);
      }
      if (race.cars.every((c) => c.finished) || race.t > race.laps * 240) this.finishRace(now);
      return;
    }
    if (this.stage === "results" && now >= (this.stageEndsAt ?? 0)) {
      if (this.index + 1 < this.total) {
        this.index++;
        this.startRace(now);
      } else {
        this.stageEndsAt = null;
        this.lobby.finishChampionship(now);
      }
      this.lobby.version++;
    }
  }

  private takeOver(carId: string) {
    const car = this.race?.cars.find((c) => c.id === carId);
    if (!car) return;
    car.remote = false;
    const meta = this.meta.find((m) => m.carId === carId);
    if (meta) meta.human = false;
    this.race!.events.push({ t: this.race!.t, carId, text: "Lost connection: the AI is driving" });
    this.lobby.version++;
  }

  handOver(managerId: string) {
    for (const meta of this.meta.filter((m) => m.managerId === managerId)) this.takeOver(meta.carId);
  }

  private finishRace(now: number) {
    const race = this.race!;
    race.finished = true;
    const order = classification(race);
    const rows: RaceResultRow[] = order.map((car, i) => {
      const meta = this.meta.find((m) => m.carId === car.id)!;
      return {
        carId: car.id,
        managerId: meta.managerId,
        driverName: meta.driverName,
        position: i + 1,
        time: car.finished ? Math.round(totalTime(car) * 1000) / 1000 : null,
        gap: i === 0 ? "Winner" : car.finished ? gapToLeader(race, car) : "DNF",
        stops: car.pitStops.length,
        penalties: car.penalties + (missedStop(car) ? RACE_RULES.missedStopPenalty : 0),
        points: car.finished ? (RULES.points[i] ?? 0) : 0,
      };
    });
    this.results = rows;
    this.lobby.recordRace(
      // Team points: both cars count; a team's best finish counts for wins.
      this.lobby.managers.map((m) => {
        const mine = rows.filter((r) => r.managerId === m.id);
        return { managerId: m.id, points: mine.reduce((t, r) => t + r.points, 0), position: Math.min(...mine.map((r) => r.position)) };
      }),
    );
    this.history.push({ index: this.index, winnerManagerId: rows[0].managerId, winnerDriver: rows[0].driverName });
    this.stage = "results";
    this.stageEndsAt = now + (this.lobby.solo() ? 6000 : RULES.resultsMs);
    this.lobby.version++;
  }

  // ------------------------------------------------------------------ manager input
  command(managerId: string, a: Extract<Action, { type: "carCommand" }>): Result {
    if (this.stage !== "running" && this.stage !== "grid") return { ok: false, error: "The race isn’t running." };
    const car = this.race?.cars.find((c) => c.id === a.carId);
    const meta = this.meta.find((m) => m.carId === a.carId);
    if (!car || !meta || meta.managerId !== managerId) return { ok: false, error: "That isn’t your car." };
    if (car.remote) return { ok: false, error: "You’re driving this car yourself." };
    car.commands ??= { pace: "normal", boost: true };
    if (a.pace && ["push", "normal", "save"].includes(a.pace)) car.commands.pace = a.pace;
    if (typeof a.boost === "boolean") car.commands.boost = a.boost;
    if (a.pit) {
      if (car.finished || car.pit) return { ok: false, error: "Can’t call a stop now." };
      car.pitRequested = !car.pitRequested;
      this.race!.events.push({ t: this.race!.t, carId: car.id, text: car.pitRequested ? "Box this lap" : "Stay out" });
    }
    this.lobby.version++;
    return { ok: true };
  }

  setSpeed(speed: number): Result {
    if (this.lobby.settings.raceMode !== "manager") return { ok: false, error: "Arcade races run in real time." };
    if (![1, 2, 4].includes(speed)) return { ok: false, error: "Speed must be 1×, 2× or 4×." };
    this.speed = speed;
    this.lobby.version++;
    return { ok: true };
  }

  /** Arcade: a driver's browser reports its car. Implausible reports are rejected. */
  report(managerId: string, a: Extract<Action, { type: "arcadeState" }>, now: number): Result {
    const race = this.race;
    if (!race || this.stage !== "running") return { ok: false, error: "The race isn’t running." };
    const meta = this.meta.find((m) => m.carId === a.carId);
    const car = race.cars.find((c) => c.id === a.carId);
    if (!car || !meta || meta.managerId !== managerId) return { ok: false, error: "That isn’t your car." };
    if (!car.remote) return { ok: false, error: "The AI is driving this car." };
    if (car.finished) return { ok: true };
    const nums = [a.s, a.d, a.v, a.lap, a.boost, a.wear];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return { ok: false, error: "Bad state." };
    const L = race.track.length;
    const dist = (lap: number, s: number) => (lap < 0 ? s - L : lap * L + s);
    const elapsed = Math.max(0.05, (now - meta.lastReport) / 1000);
    const moved = dist(a.lap, a.s) - dist(car.lap, car.s);
    const maxSpeed = car.perf.topSpeed * RACE_RULES.boost.topSpeedBonus * 1.08 + 2;
    if (a.v > maxSpeed || moved > maxSpeed * elapsed + 40 || moved < -40 || a.lap > car.lap + 1 || a.s < 0 || a.s > L || Math.abs(a.d) > race.track.halfWidth + 10) {
      return { ok: false, error: "Rejected: that car state isn’t physically possible." };
    }
    car.s = a.s;
    car.d = a.d;
    if (typeof a.yaw === "number" && Number.isFinite(a.yaw)) car.yaw = Math.max(-1.2, Math.min(1.2, a.yaw));
    car.v = a.v;
    car.boost = Math.max(0, Math.min(100, a.boost));
    car.boosting = !!a.boosting;
    car.wear = Math.max(0, Math.min(1, a.wear));
    car.offTrack = !!a.offTrack;
    car.pit = a.inPit ? { phase: "stopped", remaining: 0, duration: 0, slow: false } : null;
    while (car.pitStops.length < Math.min(3, Math.max(0, Math.floor(a.stops)))) car.pitStops.push(car.perf.pitTime);
    if (a.lap > car.lap) car.lap = a.lap;
    if (car.lap >= race.laps && !car.finished) {
      car.finished = true;
      car.finishTime = race.t;
      race.events.push({ t: race.t, carId: car.id, text: "Finished" });
    }
    meta.lastReport = now;
    return { ok: true };
  }

  // ------------------------------------------------------------------ views
  view(viewerId?: string): RaceView {
    return {
      index: this.index,
      total: this.total,
      stage: this.stage,
      stageEndsAt: this.stageEndsAt,
      laps: this.lobby.settings.laps,
      mode: this.lobby.settings.raceMode,
      speed: this.speed,
      entries: this.meta.map((m) => ({
        carId: m.carId,
        managerId: m.managerId,
        driverName: m.driverName,
        color: this.lobby.managers.find((x) => x.id === m.managerId)?.color ?? "#999",
        number: m.number,
        human: m.human,
        // Arcade: the driver's own browser needs its car's physics numbers.
        perf: m.human && m.managerId === viewerId ? this.race?.cars.find((c) => c.id === m.carId)?.perf : undefined,
      })),
      results: this.results,
      history: this.history,
    };
  }

  frame(): RaceFrame | null {
    const race = this.race;
    if (!race) return null;
    return {
      t: Math.round(race.t * 100) / 100,
      order: classification(race).map((c) => c.id),
      cars: race.cars.map((c) => [
        c.id,
        Math.round(c.s * 100) / 100,
        Math.round(c.d * 100) / 100,
        Math.round(c.v * 10) / 10,
        c.lap,
        Math.round(c.boost),
        (c.boosting ? FLAG.boosting : 0) | (c.pit ? FLAG.pit : 0) | (c.offTrack ? FLAG.offTrack : 0) | (c.finished ? FLAG.finished : 0) | (c.sliding ? FLAG.sliding : 0) | (c.pitRequested ? FLAG.pitRequested : 0),
        Math.round(c.wear * 100) / 100,
        c.penalties,
        c.pitStops.length,
        Math.round(c.yaw * 100) / 100,
      ]),
    };
  }

  events(limit = 6) {
    return (this.race?.events ?? []).slice(-limit);
  }
}
