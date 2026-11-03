// Seed catalogue for milestone 1.
//
// FACTUAL data here is limited to names, nationalities and 2026 team entries,
// entered manually and flagged as unverified until the F1 data service
// (milestone 7) confirms it. Car numbers and career statistics are deliberately
// left empty rather than guessed.
//
// ALL ATTRIBUTES ARE GAME ESTIMATES. They are subjective gameplay ratings, not
// measured performance, and every template is marked `estimated: true`.

import { computeOverall, rarityForOverall } from "./rating.ts";
import type {
  CarAttributes,
  CardTemplate,
  Driver,
  DriverAttributes,
  DriverSeason,
  Edition,
  PitCrewAttributes,
  Team,
} from "./types.ts";

export const SEED_SOURCE = "Manual seed from the 2026 entry list (unverified - to be confirmed by the F1 data service)";
export const SEED_UPDATED_AT = "2026-10-25T00:00:00Z";
const ESTIMATE_NOTE = "Game estimate. Subjective gameplay rating, not measured performance.";

export const SEASONS = [2020, 2024, 2026] as const;

// Neutral game accents (not team trademark colours).
export const TEAMS: Team[] = [
  { id: "mclaren", name: "McLaren", accent: "#f59e0b" },
  { id: "ferrari", name: "Ferrari", accent: "#ef4444" },
  { id: "red-bull", name: "Red Bull Racing", accent: "#6366f1" },
  { id: "mercedes", name: "Mercedes", accent: "#14b8a6" },
  { id: "aston-martin", name: "Aston Martin", accent: "#22c55e" },
  { id: "alpine", name: "Alpine", accent: "#3b82f6" },
  { id: "williams", name: "Williams", accent: "#0ea5e9" },
  { id: "racing-bulls", name: "Racing Bulls", accent: "#8b5cf6" },
  { id: "haas", name: "Haas", accent: "#94a3b8" },
  { id: "audi", name: "Audi", accent: "#a3a3a3" },
  { id: "cadillac", name: "Cadillac", accent: "#eab308" },
];

type DriverRow = [id: string, fullName: string, nationality: string, teamId: string, attrs: number[]];

// attrs order: pace, racecraft, consistency, tyre_management, wet_weather, experience
const DRIVER_ROWS: DriverRow[] = [
  ["lando-norris", "Lando Norris", "GBR", "mclaren", [94, 90, 90, 89, 88, 82]],
  ["oscar-piastri", "Oscar Piastri", "AUS", "mclaren", [93, 89, 91, 90, 85, 74]],
  ["charles-leclerc", "Charles Leclerc", "MCO", "ferrari", [95, 89, 86, 87, 87, 85]],
  ["lewis-hamilton", "Lewis Hamilton", "GBR", "ferrari", [91, 92, 88, 91, 94, 99]],
  ["max-verstappen", "Max Verstappen", "NLD", "red-bull", [97, 96, 95, 92, 96, 90]],
  ["isack-hadjar", "Isack Hadjar", "FRA", "red-bull", [85, 82, 80, 80, 80, 58]],
  ["george-russell", "George Russell", "GBR", "mercedes", [92, 87, 89, 88, 88, 84]],
  ["kimi-antonelli", "Andrea Kimi Antonelli", "ITA", "mercedes", [88, 83, 80, 82, 84, 60]],
  ["fernando-alonso", "Fernando Alonso", "ESP", "aston-martin", [88, 94, 90, 92, 91, 99]],
  ["lance-stroll", "Lance Stroll", "CAN", "aston-martin", [78, 78, 76, 78, 82, 82]],
  ["pierre-gasly", "Pierre Gasly", "FRA", "alpine", [84, 85, 84, 84, 84, 82]],
  ["franco-colapinto", "Franco Colapinto", "ARG", "alpine", [79, 78, 74, 76, 76, 52]],
  ["alexander-albon", "Alexander Albon", "THA", "williams", [85, 85, 86, 86, 82, 78]],
  ["carlos-sainz", "Carlos Sainz", "ESP", "williams", [88, 88, 89, 90, 85, 88]],
  ["liam-lawson", "Liam Lawson", "NZL", "racing-bulls", [81, 83, 78, 79, 80, 60]],
  ["arvid-lindblad", "Arvid Lindblad", "GBR", "racing-bulls", [79, 77, 74, 75, 75, 40]],
  ["esteban-ocon", "Esteban Ocon", "FRA", "haas", [82, 84, 82, 84, 85, 84]],
  ["oliver-bearman", "Oliver Bearman", "GBR", "haas", [82, 82, 78, 80, 78, 56]],
  ["nico-hulkenberg", "Nico Hülkenberg", "DEU", "audi", [83, 84, 86, 83, 82, 92]],
  ["gabriel-bortoleto", "Gabriel Bortoleto", "BRA", "audi", [81, 80, 80, 80, 78, 55]],
  ["sergio-perez", "Sergio Pérez", "MEX", "cadillac", [82, 85, 78, 86, 80, 95]],
  ["valtteri-bottas", "Valtteri Bottas", "FIN", "cadillac", [82, 80, 85, 82, 80, 94]],
];

// attrs order: pace, aero, straight_line_speed, tyre_management, reliability
const CAR_ROWS: [teamId: string, attrs: number[]][] = [
  ["mclaren", [93, 94, 88, 92, 90]],
  ["ferrari", [90, 88, 92, 86, 87]],
  ["red-bull", [90, 89, 91, 87, 86]],
  ["mercedes", [91, 89, 90, 88, 90]],
  ["aston-martin", [83, 85, 80, 82, 78]],
  ["alpine", [80, 81, 82, 79, 80]],
  ["williams", [84, 82, 87, 81, 83]],
  ["racing-bulls", [82, 82, 83, 80, 82]],
  ["haas", [80, 79, 82, 81, 80]],
  ["audi", [79, 80, 79, 80, 76]],
  ["cadillac", [74, 75, 76, 74, 72]],
];

// attrs order: pit_stop_speed, consistency, coordination, reliability
const CREW_ROWS: [teamId: string, attrs: number[]][] = [
  ["mclaren", [93, 90, 91, 90]],
  ["ferrari", [90, 84, 88, 85]],
  ["red-bull", [95, 88, 92, 89]],
  ["mercedes", [88, 89, 88, 90]],
  ["aston-martin", [84, 83, 84, 84]],
  ["alpine", [80, 80, 81, 82]],
  ["williams", [86, 85, 85, 84]],
  ["racing-bulls", [85, 83, 84, 83]],
  ["haas", [82, 81, 81, 82]],
  ["audi", [81, 80, 80, 79]],
  ["cadillac", [76, 75, 76, 74]],
];

const toDriverAttrs = ([pace, racecraft, consistency, tyre_management, wet_weather, experience]: number[]): DriverAttributes => ({
  pace, racecraft, consistency, tyre_management, wet_weather, experience,
});
const toCarAttrs = ([pace, aero, straight_line_speed, tyre_management, reliability]: number[]): CarAttributes => ({
  pace, aero, straight_line_speed, tyre_management, reliability,
});
const toCrewAttrs = ([pit_stop_speed, consistency, coordination, reliability]: number[]): PitCrewAttributes => ({
  pit_stop_speed, consistency, coordination, reliability,
});

export const DRIVERS: Driver[] = DRIVER_ROWS.map(([id, fullName, nationality]) => ({
  id, fullName, nationality, dataSource: SEED_SOURCE, dataUpdatedAt: SEED_UPDATED_AT,
}));

export const DRIVER_SEASONS: DriverSeason[] = [
  ...DRIVER_ROWS.map(([driverId, , , teamId]) => ({ driverId, season: 2026, teamId, carNumber: null })),
  // Historical associations used by special editions below.
  { driverId: "max-verstappen", season: 2024, teamId: "red-bull", carNumber: null },
  { driverId: "lewis-hamilton", season: 2020, teamId: "mercedes", carNumber: null },
];

const teamName = (id: string) => {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team.name;
};

function driverTemplate(
  driverId: string,
  season: number,
  teamId: string,
  edition: Edition,
  attrs: number[],
  serialLimit: number | null = null,
): CardTemplate {
  const driver = DRIVER_ROWS.find((d) => d[0] === driverId);
  if (!driver) throw new Error(`Unknown driver ${driverId}`);
  const attributes = toDriverAttrs(attrs);
  return {
    slug: `${season}-driver-${edition}-${driverId}`,
    category: "driver",
    driverId,
    edition,
    rarity: rarityForOverall(computeOverall("driver", attributes)),
    season,
    name: driver[1],
    teamId,
    estimated: true,
    ratingNote: ESTIMATE_NOTE,
    serialLimit,
    attributes,
  };
}

function carTemplate(teamId: string, season: number, edition: Edition, attrs: number[], serialLimit: number | null = null): CardTemplate {
  const attributes = toCarAttrs(attrs);
  return {
    slug: `${season}-car-${edition}-${teamId}`,
    category: "car",
    edition,
    rarity: rarityForOverall(computeOverall("car", attributes)),
    season,
    name: `${teamName(teamId)} ${season} car`,
    teamId,
    estimated: true,
    ratingNote: ESTIMATE_NOTE,
    serialLimit,
    attributes,
  };
}

function crewTemplate(teamId: string, season: number, edition: Edition, attrs: number[], serialLimit: number | null = null): CardTemplate {
  const attributes = toCrewAttrs(attrs);
  return {
    slug: `${season}-pit_crew-${edition}-${teamId}`,
    category: "pit_crew",
    edition,
    rarity: rarityForOverall(computeOverall("pit_crew", attributes)),
    season,
    name: `${teamName(teamId)} pit crew`,
    teamId,
    estimated: true,
    ratingNote: ESTIMATE_NOTE,
    serialLimit,
    attributes,
  };
}

export const CARD_TEMPLATES: CardTemplate[] = [
  ...DRIVER_ROWS.map(([id, , , teamId, attrs]) => driverTemplate(id, 2026, teamId, "standard", attrs)),
  ...CAR_ROWS.map(([teamId, attrs]) => carTemplate(teamId, 2026, "standard", attrs)),
  ...CREW_ROWS.map(([teamId, attrs]) => crewTemplate(teamId, 2026, "standard", attrs)),

  // Special editions (fictional game classifications).
  driverTemplate("arvid-lindblad", 2026, "racing-bulls", "rookie", [81, 79, 76, 77, 77, 42]),
  driverTemplate("kimi-antonelli", 2026, "mercedes", "elite", [91, 86, 83, 85, 87, 63], 1000),
  driverTemplate("fernando-alonso", 2026, "aston-martin", "elite", [90, 96, 92, 94, 93, 99], 1000),
  driverTemplate("lando-norris", 2026, "mclaren", "special_event", [96, 92, 92, 90, 90, 83], 750),
  driverTemplate("max-verstappen", 2024, "red-bull", "championship", [99, 97, 97, 94, 97, 88], 500),
  driverTemplate("lewis-hamilton", 2020, "mercedes", "legendary", [98, 96, 96, 95, 96, 92], 250),
  carTemplate("mclaren", 2026, "elite", [95, 96, 90, 94, 92], 1000),
  crewTemplate("red-bull", 2026, "elite", [98, 91, 94, 92], 1000),
];
