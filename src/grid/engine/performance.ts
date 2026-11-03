// Turns card attributes into the numbers the race physics uses.
// Every attribute below changes how the car behaves on track; none is decorative.

import type { CarAttributes, DriverAttributes, PitCrewAttributes, RatedCardTemplate } from "../../lib/cards/types.ts";

/** Maps a 60..99 rating to 0..1. */
export const norm = (rating: number) => Math.min(1, Math.max(0, (rating - 60) / 39));

export interface Performance {
  /** Top speed on a straight, m/s. Car straight-line speed (60%) and pace (40%). */
  topSpeed: number;
  /** Peak acceleration, m/s². Car pace. */
  accel: number;
  /** Braking deceleration, m/s². Driver experience. */
  brake: number;
  /** Lateral grip, m/s²: sets the fastest speed through every corner. Car aero + driver pace. */
  grip: number;
  /** How fast the car can change line, m/s. Car aero + driver racecraft. */
  steerRate: number;
  /** Tyre wear per lap (0..1 of grip life). Car + driver tyre management. */
  tyreWearPerLap: number;
  /** How close the driver gets to the limit (AI and Team principal mode). Driver pace. */
  skill: number;
  /** 0..1: lowers the chance of mistakes. Driver consistency + experience. */
  consistency: number;
  /** 0..1: willingness and ability to overtake and defend. Driver racecraft. */
  racecraft: number;
  /** Base stationary pit-stop time, s. Pit crew pit-stop speed. */
  pitTime: number;
  /** Random spread added to each stop, s. Pit crew consistency. */
  pitVariance: number;
  /** Chance of a slow stop (+2–4 s). Pit crew coordination + reliability. */
  slowStopChance: number;
  /** Extra energy recovered under braking (×). Car reliability (energy systems). */
  regen: number;
}

export interface TeamItems {
  driver: RatedCardTemplate;
  car: RatedCardTemplate;
  pit_crew: RatedCardTemplate;
}

export function performance(team: TeamItems): Performance {
  const d = team.driver.attributes as DriverAttributes;
  const c = team.car.attributes as CarAttributes;
  const p = team.pit_crew.attributes as PitCrewAttributes;
  return {
    topSpeed: 78 + 8 * norm(0.6 * c.straight_line_speed + 0.4 * c.pace),
    accel: 9 + 3.5 * norm(c.pace),
    brake: 29 + 4 * norm(d.experience),
    // Kept in a narrow band so driving skill matters more than the car.
    grip: 22 + 4.5 * norm(c.aero) + 2.5 * norm(d.pace),
    steerRate: 6 + 3 * norm(c.aero) + 2 * norm(d.racecraft),
    tyreWearPerLap: 0.17 * (1.25 - 0.5 * norm((c.tyre_management + d.tyre_management) / 2)),
    skill: 0.9 + 0.08 * norm(d.pace),
    consistency: norm(0.6 * d.consistency + 0.4 * d.experience),
    racecraft: norm(d.racecraft),
    pitTime: 2.2 + 2.6 * (1 - norm(p.pit_stop_speed)),
    pitVariance: 0.8 * (1 - norm(p.consistency)),
    slowStopChance: 0.3 * (1 - norm((p.coordination + p.reliability) / 2)),
    regen: 0.8 + 0.4 * norm(c.reliability),
  };
}

/** Single number used for the starting grid and AI valuations. */
export function teamIndex(team: TeamItems): number {
  return 0.4 * team.driver.overall + 0.4 * team.car.overall + 0.2 * team.pit_crew.overall;
}

/** Player-facing summary of what each card does in the race. */
export function describePerformance(perf: Performance) {
  return [
    { label: "Top speed", value: `${Math.round(perf.topSpeed * 3.6)} km/h`, from: "Car: straight-line speed, pace" },
    { label: "Acceleration", value: `${perf.accel.toFixed(1)} m/s²`, from: "Car: pace" },
    { label: "Cornering grip", value: `${perf.grip.toFixed(1)} m/s²`, from: "Car: aero · Driver: pace" },
    { label: "Braking", value: `${perf.brake.toFixed(1)} m/s²`, from: "Driver: experience" },
    { label: "Steering response", value: `${perf.steerRate.toFixed(1)} m/s`, from: "Car: aero · Driver: racecraft" },
    { label: "Tyre wear", value: `${Math.round(perf.tyreWearPerLap * 100)}% per lap`, from: "Car + Driver: tyre management" },
    { label: "Mistake resistance", value: `${Math.round(perf.consistency * 100)}%`, from: "Driver: consistency, experience" },
    { label: "Pit stop", value: `${perf.pitTime.toFixed(1)} s ± ${perf.pitVariance.toFixed(1)}`, from: "Crew: pit-stop speed, consistency" },
    { label: "Slow-stop risk", value: `${Math.round(perf.slowStopChance * 100)}%`, from: "Crew: coordination, reliability" },
  ];
}
