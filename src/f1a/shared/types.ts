// Messages between server and browser.

import type { Category, Item } from "./pool.ts";
import type { Settings, Strategy } from "./rules.ts";

export type Phase = "lobby" | "auction" | "lineup" | "review" | "race" | "final";

/** An item as a given viewer may see it (ratings removed in Blind mode). */
export interface ItemView {
  id: string;
  name: string;
  category: Category;
  era: Item["era"];
  team: string;
  season: number;
  nationality?: string;
  fictional?: boolean;
  overall: number | null;
  attrs: Record<string, number> | null;
}

export interface SquadEntryView {
  item: ItemView;
  price: number;
  how: "bought" | "assigned" | "free";
}

export interface ManagerView {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  isYou: boolean;
  connected: boolean;
  credits: number;
  maxBid: number;
  squad: SquadEntryView[];
  needs: Record<Category, number>;
  lineupConfirmed: boolean;
  ready: boolean;
  raceDrivers: string[];
  strategy: Strategy;
  teamOverall: number | null;
}

export interface ChatMessage {
  id: number;
  managerId: string | null;
  name: string;
  color: string;
  text: string;
  at: number;
  system: boolean;
}

export interface LotView {
  no: number;
  item: ItemView;
  category: Category;
  categoryIndex: number;
  highBid: number;
  leaderId: string | null;
  out: string[];
  endsAt: number;
  bids: { managerId: string; amount: number }[];
  result: null | { kind: "sold" | "unsold" | "assigned" | "free"; managerId: string | null; price: number; note: string };
  /** Managers allowed to bid on this lot (need the position and can afford more than the current bid). */
  eligible: string[];
}

export interface RaceEntryView {
  carId: string;
  managerId: string;
  driverName: string;
  color: string;
  number: 1 | 2;
  /** Arcade: this car is driven in the manager's browser. */
  human: boolean;
  /** Only for the viewer's own Arcade car. */
  perf?: import("../../grid/engine/performance.ts").Performance;
}

export interface RaceResultRow {
  carId: string;
  managerId: string;
  driverName: string;
  position: number;
  time: number | null;
  gap: string;
  stops: number;
  penalties: number;
  points: number;
}

export interface StandingRow {
  managerId: string;
  points: number;
  wins: number;
  best: number;
}

export interface RaceView {
  index: number;
  total: number;
  stage: "grid" | "running" | "results";
  stageEndsAt: number | null;
  laps: number;
  mode: "manager" | "arcade";
  speed: number;
  entries: RaceEntryView[];
  results: RaceResultRow[] | null;
  history: { index: number; winnerManagerId: string; winnerDriver: string }[];
}

export interface LobbyView {
  code: string;
  you: string;
  phase: Phase;
  settings: Settings;
  serverNow: number;
  managers: ManagerView[];
  lot: LotView | null;
  auctionLog: { no: number; itemName: string; category: Category; managerId: string | null; price: number; kind: string }[];
  /** Highest prices paid so far (top 5). */
  topPurchases: { no: number; itemName: string; category: Category; managerId: string; price: number }[];
  chat: ChatMessage[];
  phaseEndsAt: number | null;
  standings: StandingRow[];
  race: RaceView | null;
  version: number;
}

/** Compact live race frame, sent ~10 times a second. Car tuple: id, s, d, v, lap, boost, flags, wear, penalties, stops. */
export interface RaceFrame {
  t: number;
  /** Car ids in race order. */
  order: string[];
  cars: [string, number, number, number, number, number, number, number, number, number, number][];
}
export const FLAG = { boosting: 1, pit: 2, offTrack: 4, finished: 8, sliding: 16, pitRequested: 32 };

export type Action =
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "color"; color: string }
  | { type: "addBot" }
  | { type: "removeBot"; managerId: string }
  | { type: "start" }
  | { type: "leave" }
  /** Raise by `increment`, or bid an exact `total`, or `allIn` (your maximum bid). */
  | { type: "bid"; increment?: number; total?: number; allIn?: boolean }
  | { type: "chat"; text: string }
  | { type: "lobbyReady"; ready: boolean }
  | { type: "out" }
  | { type: "lineup"; raceDrivers: string[]; strategy: Strategy }
  | { type: "confirmLineup" }
  | { type: "ready" }
  | { type: "carCommand"; carId: string; pace?: "push" | "normal" | "save"; boost?: boolean; pit?: boolean }
  | { type: "raceSpeed"; speed: number }
  | { type: "arcadeState"; carId: string; s: number; d: number; v: number; lap: number; boost: number; boosting: boolean; wear: number; inPit: boolean; offTrack: boolean; stops: number; penalties: number; yaw?: number }
  | { type: "playAgain" };
