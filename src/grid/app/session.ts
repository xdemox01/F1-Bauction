// Game session: which phase we're in, the auction, the chosen team and the
// player's record. Saved to localStorage so a reload resumes the auction or
// team selection (a race in progress restarts from the grid).

import type { CardCategory } from "../../lib/cards/types.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import type { AuctionState } from "../engine/auction.ts";
import { CATEGORIES, categoryOf } from "../engine/auction.ts";
import type { TeamItems } from "../engine/performance.ts";
import type { ControlMode } from "../engine/race.ts";

export type Phase = "title" | "auction" | "team" | "race" | "results";

export const TEAM_COLORS: Record<string, string> = {
  player: "#f0b54a",
  ai1: "#e5484d",
  ai2: "#3e8ef7",
  ai3: "#30a46c",
  ai4: "#a35bf0",
};

export interface Settings {
  laps: number;
  mode: ControlMode;
  auctionSpeed: number;
}

export interface ResultRow {
  id: string;
  name: string;
  isPlayer: boolean;
  driver: string;
  car: string;
  crew: string;
  position: number;
  time: number | null;
  penalties: number;
  missedStop: boolean;
  pitStops: number[];
  contacts: number;
  points: number;
}

export interface Session {
  version: 1;
  phase: Phase;
  auction: AuctionState | null;
  selection: Record<CardCategory, string | null>;
  settings: Settings;
  results: ResultRow[] | null;
  record: { races: number; wins: number; podiums: number; points: number; auctions: number };
}

export const SAVE_KEY = "parc-ferme.grid-auction.v1";

export function newSession(): Session {
  return {
    version: 1,
    phase: "title",
    auction: null,
    selection: { driver: null, car: null, pit_crew: null },
    settings: { laps: 3, mode: "drive", auctionSpeed: 1 },
    results: null,
    record: { races: 0, wins: 0, podiums: 0, points: 0, auctions: 0 },
  };
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newSession();
    const s = JSON.parse(raw) as Session;
    if (s.version !== 1 || !s.phase || !s.settings || !s.record) return newSession();
    // A race can't be resumed mid-way; go back to team selection.
    if (s.phase === "race") s.phase = "team";
    return s;
  } catch {
    return newSession();
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: play continues without saving */
  }
}

/** Best item of each category a bidder owns (used for AI teams and as the player's default). */
export function bestLineup(items: { slug: string }[]): Record<CardCategory, string | null> {
  const out: Record<CardCategory, string | null> = { driver: null, car: null, pit_crew: null };
  for (const cat of CATEGORIES) {
    const own = items.filter((i) => categoryOf(i.slug) === cat).sort((a, b) => requireTemplate(b.slug).overall - requireTemplate(a.slug).overall);
    out[cat] = own[0]?.slug ?? null;
  }
  return out;
}

export function toTeamItems(sel: Record<CardCategory, string | null>): TeamItems | null {
  if (!sel.driver || !sel.car || !sel.pit_crew) return null;
  return { driver: requireTemplate(sel.driver), car: requireTemplate(sel.car), pit_crew: requireTemplate(sel.pit_crew) };
}
