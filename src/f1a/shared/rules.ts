// Game rules shared by the server (which enforces them) and the client (which displays them).
// Auction rules follow FootbAuction's published rules, adapted from an 11-player
// squad to a 6-slot F1 team.

import type { Category, PoolId, EraSetting } from "./pool.ts";

export const RULES = {
  budget: 100,
  minManagers: 2,
  maxManagers: 10,
  /** Squad: two race drivers + one reserve, a car, a pit crew and a team principal. */
  squad: { driver: 3, car: 1, crew: 1, principal: 1 } as Record<Category, number>,
  /** Auction order, like FootbAuction's goalkeepers → defenders → midfielders → forwards. */
  order: ["driver", "car", "crew", "principal"] as Category[],
  bidClockMs: 10_000,
  soldPauseMs: 2_500,
  increments: [1, 5, 10],
  chatMax: 200,
  chatKeep: 60,
  lineupMs: 60_000,
  reviewMs: 45_000,
  gridMs: 5_000,
  resultsMs: 15_000,
  nameMax: 20,
  codeLength: 5,
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
};

export const SQUAD_SIZE = Object.values(RULES.squad).reduce((a, b) => a + b, 0);

export type AuctionMode = "classic" | "blind";
export type RaceMode = "manager" | "arcade";
export type AiLevel = "easy" | "normal" | "hard";
export const AI_LEVEL_SKILL: Record<AiLevel, number> = { easy: 0.92, normal: 0.97, hard: 1.01 };
export type Strategy = "balanced" | "aggressive" | "conservative";

export const STRATEGY_INFO: Record<Strategy, { label: string; help: string }> = {
  balanced: { label: "Balanced", help: "Normal pace, boost when it helps." },
  aggressive: { label: "Aggressive", help: "Push pace and boost often. Faster, more tyre wear, more risk." },
  conservative: { label: "Conservative", help: "Save tyres, no risks. Slower but rarely retires." },
};

export interface Settings {
  pool: PoolId;
  era: EraSetting;
  customTeams: string[];
  auctionMode: AuctionMode;
  raceMode: RaceMode;
  laps: number;
  races: number;
  /** Blind mode: show team overall during lineup and review (individual ratings stay hidden). */
  showTeamOverall: boolean;
  /** How close AI drivers get to the limit. */
  aiLevel: AiLevel;
}

export const DEFAULT_SETTINGS: Settings = {
  pool: "global",
  era: "current",
  customTeams: [],
  auctionMode: "classic",
  raceMode: "manager",
  laps: 3,
  races: 3,
  showTeamOverall: false,
  aiLevel: "normal",
};

export const LAP_OPTIONS = [2, 3, 5];
export const RACE_OPTIONS = [1, 3, 5];
export const TEAM_COLORS = ["#f0b54a", "#e5484d", "#3e8ef7", "#30a46c", "#a35bf0", "#ff8a3d", "#12b5b0", "#e93d82", "#d4d4d4", "#8fbc3a", "#a1785c", "#6e7f96"];

export function validateSettings(input: Partial<Settings>, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = { ...base };
  if (input.pool && ["global", "current", "legends", "custom"].includes(input.pool)) s.pool = input.pool;
  if (input.era && ["current", "alltime"].includes(input.era)) s.era = input.era;
  if (Array.isArray(input.customTeams)) s.customTeams = input.customTeams.filter((t) => typeof t === "string").slice(0, 30);
  if (input.auctionMode && ["classic", "blind"].includes(input.auctionMode)) s.auctionMode = input.auctionMode;
  if (input.raceMode && ["manager", "arcade"].includes(input.raceMode)) s.raceMode = input.raceMode;
  if (typeof input.laps === "number" && LAP_OPTIONS.includes(input.laps)) s.laps = input.laps;
  if (typeof input.races === "number" && RACE_OPTIONS.includes(input.races)) s.races = input.races;
  if (typeof input.showTeamOverall === "boolean") s.showTeamOverall = input.showTeamOverall;
  if (input.aiLevel && ["easy", "normal", "hard"].includes(input.aiLevel)) s.aiLevel = input.aiLevel;
  return s;
}

/** Credits the AI and the guide treat as a fair price. */
export function fairValue(overall: number): number {
  return Math.max(1, Math.round((overall - 66) * 0.9));
}
