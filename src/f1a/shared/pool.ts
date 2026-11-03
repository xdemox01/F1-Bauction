// Auction item pools. All ratings are subjective game estimates (not measured
// performance). Factual parts are limited to names, nationalities, teams and
// seasons. Academy drivers and privateer items are fictional fillers.

import { computeOverall } from "../../lib/cards/rating.ts";
import { CARD_TEMPLATES, DRIVERS, TEAMS } from "../../lib/cards/seed.ts";

export type Category = "driver" | "car" | "crew" | "principal";
export type Era = "current" | "legend" | "academy" | "privateer";

export interface Item {
  id: string;
  name: string;
  category: Category;
  era: Era;
  /** Constructor / team the item belongs to. */
  team: string;
  season: number;
  nationality?: string;
  overall: number;
  attrs: Record<string, number>;
  /** True for invented names (academy drivers, privateer fillers). */
  fictional?: boolean;
}

export const CATEGORY_LABEL: Record<Category, string> = { driver: "Driver", car: "Car", crew: "Pit crew", principal: "Team principal" };
export const CATEGORY_PLURAL: Record<Category, string> = { driver: "Drivers", car: "Cars", crew: "Pit crews", principal: "Team principals" };

export const ATTR_LABEL: Record<string, string> = {
  pace: "Pace",
  racecraft: "Racecraft",
  consistency: "Consistency",
  tyre_management: "Tyres",
  wet_weather: "Wet",
  experience: "Experience",
  aero: "Aero",
  straight_line_speed: "Top speed",
  reliability: "Reliability",
  pit_stop_speed: "Stop speed",
  coordination: "Coordination",
  strategy: "Strategy",
  leadership: "Leadership",
  development: "Development",
};

const driverAttrs = (a: number[]) => ({ pace: a[0], racecraft: a[1], consistency: a[2], tyre_management: a[3], wet_weather: a[4], experience: a[5] });
const carAttrs = (a: number[]) => ({ pace: a[0], aero: a[1], straight_line_speed: a[2], tyre_management: a[3], reliability: a[4] });
const crewAttrs = (a: number[]) => ({ pit_stop_speed: a[0], consistency: a[1], coordination: a[2], reliability: a[3] });
const principalAttrs = (a: number[]) => ({ strategy: a[0], leadership: a[1], development: a[2] });

export function principalOverall(a: Record<string, number>): number {
  return Math.floor((a.strategy * 4000 + a.leadership * 3500 + a.development * 2500 + 5000) / 10000);
}

function overallOf(category: Category, attrs: Record<string, number>): number {
  if (category === "principal") return principalOverall(attrs);
  return computeOverall(category === "crew" ? "pit_crew" : category, attrs as never);
}

const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;
const slug = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function make(category: Category, era: Era, name: string, team: string, season: number, attrs: Record<string, number>, extra: Partial<Item> = {}): Item {
  return {
    id: `${era}-${category}-${slug(name)}-${season}`,
    name,
    category,
    era,
    team,
    season,
    overall: overallOf(category, attrs),
    attrs,
    ...extra,
  };
}

// ---------------------------------------------------------------- current grid (from the card catalogue)
const CURRENT: Item[] = CARD_TEMPLATES.filter((t) => t.edition === "standard" && t.season === 2026).map((t) => {
  const category: Category = t.category === "pit_crew" ? "crew" : t.category;
  const nationality = t.category === "driver" ? DRIVERS.find((d) => d.id === t.driverId)?.nationality : undefined;
  return make(category, "current", t.name, teamName(t.teamId), t.season, { ...(t.attributes as unknown as Record<string, number>) }, nationality ? { nationality } : {});
});

// Team principals at the time the data was entered (may have changed since).
const CURRENT_PRINCIPALS: [string, string, number[]][] = [
  ["Toto Wolff", "Mercedes", [90, 92, 91]],
  ["Fred Vasseur", "Ferrari", [86, 85, 84]],
  ["Andrea Stella", "McLaren", [91, 88, 92]],
  ["Laurent Mekies", "Red Bull Racing", [84, 83, 85]],
  ["James Vowles", "Williams", [85, 86, 88]],
  ["Ayao Komatsu", "Haas", [82, 84, 81]],
  ["Jonathan Wheatley", "Audi", [84, 83, 80]],
  ["Alan Permane", "Racing Bulls", [83, 80, 79]],
  ["Graeme Lowdon", "Cadillac", [79, 82, 76]],
];

// ---------------------------------------------------------------- legends
// attrs: pace, racecraft, consistency, tyre_management, wet_weather, experience
const LEGEND_DRIVERS: [string, string, string, number, number[]][] = [
  ["Ayrton Senna", "BRA", "McLaren", 1988, [98, 96, 92, 90, 99, 90]],
  ["Alain Prost", "FRA", "McLaren", 1989, [94, 95, 97, 97, 86, 95]],
  ["Michael Schumacher", "DEU", "Ferrari", 2004, [98, 96, 96, 94, 98, 95]],
  ["Niki Lauda", "AUT", "Ferrari", 1975, [91, 92, 95, 93, 85, 92]],
  ["Jim Clark", "GBR", "Lotus", 1965, [97, 93, 94, 92, 94, 88]],
  ["Juan Manuel Fangio", "ARG", "Mercedes", 1955, [96, 95, 95, 93, 92, 96]],
  ["Jackie Stewart", "GBR", "Tyrrell", 1971, [94, 93, 95, 92, 97, 90]],
  ["Nelson Piquet", "BRA", "Brabham", 1983, [92, 91, 89, 90, 86, 89]],
  ["Nigel Mansell", "GBR", "Williams", 1992, [95, 94, 86, 88, 90, 90]],
  ["Mika Häkkinen", "FIN", "McLaren", 1998, [95, 91, 90, 89, 87, 88]],
  ["Kimi Räikkönen", "FIN", "Ferrari", 2007, [94, 90, 88, 91, 86, 88]],
  ["Sebastian Vettel", "DEU", "Red Bull Racing", 2013, [95, 89, 93, 92, 91, 90]],
  ["Jenson Button", "GBR", "Brawn", 2009, [88, 88, 89, 95, 94, 90]],
  ["Nico Rosberg", "DEU", "Mercedes", 2016, [92, 86, 92, 90, 85, 88]],
  ["Damon Hill", "GBR", "Williams", 1996, [89, 87, 88, 88, 86, 87]],
  ["Graham Hill", "GBR", "Lotus", 1968, [88, 90, 90, 89, 87, 93]],
  ["Emerson Fittipaldi", "BRA", "Lotus", 1972, [91, 89, 90, 90, 86, 86]],
  ["Mario Andretti", "USA", "Lotus", 1978, [91, 91, 87, 88, 88, 92]],
  ["Jochen Rindt", "AUT", "Lotus", 1970, [94, 90, 85, 86, 88, 84]],
  ["Alberto Ascari", "ITA", "Ferrari", 1952, [95, 90, 93, 90, 88, 86]],
  ["Gilles Villeneuve", "CAN", "Ferrari", 1979, [95, 94, 80, 84, 95, 82]],
  ["Jack Brabham", "AUS", "Brabham", 1966, [89, 90, 91, 90, 87, 94]],
];

const LEGEND_CARS: [string, string, number, number[]][] = [
  ["McLaren MP4/4", "McLaren", 1988, [97, 92, 96, 90, 91]],
  ["Williams FW14B", "Williams", 1992, [96, 97, 90, 92, 86]],
  ["Ferrari F2004", "Ferrari", 2004, [97, 95, 93, 94, 95]],
  ["Red Bull RB19", "Red Bull Racing", 2023, [98, 97, 94, 95, 94]],
  ["Mercedes W11", "Mercedes", 2020, [97, 96, 95, 93, 95]],
  ["Lotus 79", "Lotus", 1978, [93, 96, 86, 88, 80]],
  ["Brabham BT52", "Brabham", 1983, [91, 87, 94, 85, 78]],
  ["Benetton B195", "Benetton", 1995, [91, 89, 90, 90, 86]],
  ["Renault R25", "Renault", 2005, [92, 90, 91, 91, 89]],
  ["Brawn BGP 001", "Brawn", 2009, [93, 94, 88, 92, 90]],
  ["Tyrrell 003", "Tyrrell", 1971, [88, 85, 87, 86, 85]],
  ["Ferrari 312T", "Ferrari", 1975, [91, 88, 92, 87, 86]],
];

const LEGEND_CREWS: [string, number, number[]][] = [
  ["Ferrari", 2004, [94, 95, 95, 94]],
  ["Williams", 1992, [90, 90, 89, 88]],
  ["McLaren", 1988, [91, 92, 91, 90]],
  ["Red Bull Racing", 2019, [97, 88, 92, 89]],
  ["Mercedes", 2020, [93, 94, 93, 94]],
  ["Benetton", 1995, [91, 89, 90, 88]],
  ["Renault", 2005, [90, 89, 89, 90]],
  ["Brawn", 2009, [88, 90, 89, 89]],
  ["Lotus", 1978, [84, 83, 85, 82]],
  ["Brabham", 1983, [89, 84, 88, 84]],
];

const LEGEND_PRINCIPALS: [string, string, number[]][] = [
  ["Ross Brawn", "Ferrari", [98, 92, 94]],
  ["Ron Dennis", "McLaren", [92, 90, 93]],
  ["Frank Williams", "Williams", [89, 94, 90]],
  ["Colin Chapman", "Lotus", [90, 86, 98]],
  ["Jean Todt", "Ferrari", [91, 95, 89]],
  ["Enzo Ferrari", "Ferrari", [86, 96, 88]],
  ["Ken Tyrrell", "Tyrrell", [87, 92, 85]],
  ["Flavio Briatore", "Benetton", [88, 87, 86]],
  ["Christian Horner", "Red Bull Racing", [92, 90, 93]],
  ["Bernie Ecclestone", "Brabham", [90, 88, 86]],
];

// ---------------------------------------------------------------- fictional fillers
const ACADEMY_DRIVERS: [string, string, number[]][] = [
  ["Tomas Varga", "HUN", [76, 72, 70, 72, 70, 45]],
  ["Noah Lindqvist", "SWE", [75, 73, 71, 70, 74, 42]],
  ["Rafael Ortega", "ESP", [74, 75, 68, 71, 69, 44]],
  ["Kenji Morikawa", "JPN", [73, 70, 74, 72, 71, 46]],
  ["Elliot Marsh", "GBR", [72, 71, 72, 73, 72, 40]],
  ["Lucas Ferreira", "BRA", [74, 72, 67, 69, 76, 41]],
  ["Anton Weiss", "DEU", [71, 70, 73, 71, 68, 47]],
  ["Matteo Rinaldi", "ITA", [73, 74, 69, 68, 70, 43]],
  ["Sami Laine", "FIN", [72, 68, 71, 70, 73, 45]],
  ["Hugo Delacroix", "FRA", [70, 72, 70, 69, 70, 48]],
  ["Diego Salas", "MEX", [71, 70, 69, 72, 67, 44]],
  ["Ryan Okafor", "USA", [70, 69, 70, 70, 69, 42]],
];

export const CURRENT_ITEMS: Item[] = [
  ...CURRENT,
  ...CURRENT_PRINCIPALS.map(([n, team, a]) => make("principal", "current", n, team, 2026, principalAttrs(a))),
];

export const LEGEND_ITEMS: Item[] = [
  ...LEGEND_DRIVERS.map(([n, nat, team, season, a]) => make("driver", "legend", n, team, season, driverAttrs(a), { nationality: nat })),
  ...LEGEND_CARS.map(([n, team, season, a]) => make("car", "legend", `${n} (${season})`, team, season, carAttrs(a))),
  ...LEGEND_CREWS.map(([team, season, a]) => make("crew", "legend", `${team} pit crew (${season})`, team, season, crewAttrs(a))),
  ...LEGEND_PRINCIPALS.map(([n, team, a]) => make("principal", "legend", n, team, 0, principalAttrs(a))),
];

export const ACADEMY_ITEMS: Item[] = ACADEMY_DRIVERS.map(([n, nat, a]) =>
  make("driver", "academy", n, "Academy", 2026, driverAttrs(a), { nationality: nat, fictional: true }),
);

/** Generic fictional items used only if a pool runs out. */
export function privateer(category: Category, n: number): Item {
  const base = 62 + (n % 5);
  const attrs =
    category === "driver"
      ? driverAttrs([base, base, base, base, base, 50])
      : category === "car"
        ? carAttrs([base, base, base, base, base])
        : category === "crew"
          ? crewAttrs([base, base, base, base])
          : principalAttrs([base, base, base]);
  const label = { driver: "Privateer driver", car: "Privateer car", crew: "Privateer pit crew", principal: "Privateer principal" }[category];
  return { ...make(category, "privateer", `${label} ${n + 1}`, "Privateer", 2026, attrs), fictional: true };
}

export const ALL_ITEMS: Item[] = [...CURRENT_ITEMS, ...LEGEND_ITEMS, ...ACADEMY_ITEMS];
const byId = new Map(ALL_ITEMS.map((i) => [i.id, i]));
/** Catalogue items by id (privateer fillers are generated per lobby and stored with it). */
export function getItem(id: string): Item | undefined {
  return byId.get(id);
}

// ---------------------------------------------------------------- pools
export const POOLS = ["global", "current", "legends", "custom"] as const;
export type PoolId = (typeof POOLS)[number];
export const POOL_LABEL: Record<PoolId, string> = { global: "Global F1", current: "Current Grid", legends: "Legends", custom: "Custom" };
export type EraSetting = "current" | "alltime";

export interface PoolSettings {
  pool: PoolId;
  era: EraSetting;
  /** Custom pool: constructors to include. */
  customTeams: string[];
}

export const ALL_TEAMS: string[] = [...new Set(ALL_ITEMS.filter((i) => i.era !== "academy").map((i) => i.team))].sort();

/** Era that actually applies (Current Grid is always current, Legends always all-time). */
export function effectiveEra(s: PoolSettings): EraSetting {
  if (s.pool === "current") return "current";
  if (s.pool === "legends") return "alltime";
  return s.era;
}

export function buildPool(s: PoolSettings): Item[] {
  const era = effectiveEra(s);
  let items: Item[];
  if (s.pool === "legends") items = [...LEGEND_ITEMS];
  else if (s.pool === "current") items = [...CURRENT_ITEMS];
  else items = era === "current" ? [...CURRENT_ITEMS] : [...CURRENT_ITEMS, ...LEGEND_ITEMS];
  if (s.pool === "custom" && s.customTeams.length) items = items.filter((i) => s.customTeams.includes(i.team));
  return [...items, ...ACADEMY_ITEMS];
}
