// Player save state. Plain JSON so it can be stored locally now and mapped to
// the database tables (card_instances, transactions, matches) later.

import type { AcquisitionMethod, CardCategory } from "../cards/types.ts";
import { ECONOMY, SAVE_VERSION } from "./config.ts";
import type { Condition, Strategy } from "./config.ts";
import { cardsInCategory, CATALOGUE } from "./catalogue.ts";
import type { EntrantResult } from "./race.ts";
import { pickOne } from "./rng.ts";
import type { Rng } from "./rng.ts";

export interface Ctx {
  rng: Rng;
  now: Date;
  newId: () => string;
}

export interface CardInstance {
  id: string;
  slug: string;
  acquiredAt: string;
  method: AcquisitionMethod;
}

export type TransactionKind = "starting_balance" | "pack_purchase" | "randoms_entry" | "randoms_reward" | "race_reward";

export interface Transaction {
  id: string;
  at: string;
  kind: TransactionKind;
  /** Positive = credit, negative = debit. */
  amount: number;
  balanceAfter: number;
  note: string;
}

export interface PackOpening {
  id: string;
  requestId: string;
  packId: string;
  at: string;
  cost: number;
  cardIds: string[];
  slugs: string[];
}

export type Team = Record<CardCategory, string | null>;

export interface RandomsOffer {
  category: CardCategory;
  options: string[];
}

export interface RandomsOpponent {
  id: string;
  name: string;
  picks: Record<CardCategory, string>;
  strategy: Strategy;
}

export interface RandomsRun {
  id: string;
  startedAt: string;
  entryCost: number;
  offers: RandomsOffer[];
  picks: string[];
  /** When the current pick started; picks auto-complete after RANDOMS.secondsPerPick. */
  roundStartedAt: string;
  opponents: RandomsOpponent[];
  conditions: Condition;
  phase: "draft" | "strategy" | "finished";
  strategy: Strategy | null;
  result: EntrantResult[] | null;
  coinsAwarded: number;
  /** For a win: the drafted card the player kept (null until chosen). */
  keptSlug: string | null;
  completed: boolean;
}

export interface MatchRecord {
  id: string;
  mode: "randoms" | "quick_race";
  at: string;
  conditions: Condition;
  position: number;
  retired: boolean;
  won: boolean;
  coins: number;
  keptSlug: string | null;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  /** Increments on every saved change; used to detect changes from another tab. */
  revision: number;
  createdAt: string;
  coins: number;
  cards: CardInstance[];
  team: Team;
  transactions: Transaction[];
  packOpenings: PackOpening[];
  /** requestId -> id of the record it produced. Makes repeated submissions harmless. */
  processedRequests: Record<string, string>;
  randoms: { freeRunDay: string | null; freeRunsUsed: number; active: RandomsRun | null };
  quickRace: { day: string | null; rewardedRaces: number };
  matches: MatchRecord[];
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createInitialState(ctx: Ctx): GameState {
  const at = ctx.now.toISOString();
  const starters = (["driver", "car", "pit_crew"] as CardCategory[]).map((category) => {
    const options = cardsInCategory(category).filter((t) => t.rarity === ECONOMY.starterRarity && t.serialLimit === null);
    const template = pickOne(ctx.rng, options.length ? options : cardsInCategory(category));
    return { id: ctx.newId(), slug: template.slug, acquiredAt: at, method: "starter" as const };
  });
  return {
    version: SAVE_VERSION,
    revision: 0,
    createdAt: at,
    coins: ECONOMY.startingCoins,
    cards: starters,
    team: { driver: starters[0].id, car: starters[1].id, pit_crew: starters[2].id },
    transactions: [
      { id: ctx.newId(), at, kind: "starting_balance", amount: ECONOMY.startingCoins, balanceAfter: ECONOMY.startingCoins, note: "Welcome coins" },
    ],
    packOpenings: [],
    processedRequests: {},
    randoms: { freeRunDay: null, freeRunsUsed: 0, active: null },
    quickRace: { day: null, rewardedRaces: 0 },
    matches: [],
  };
}

const slugSet = new Set(CATALOGUE.map((t) => t.slug));

/** Validates untrusted saved data. Returns null when it cannot be used safely. */
export function parseSavedState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<GameState>;
  if (s.version !== SAVE_VERSION) return null;
  if (!Number.isInteger(s.coins) || (s.coins as number) < 0) return null;
  if (!Number.isInteger(s.revision)) return null;
  if (!Array.isArray(s.cards) || !s.cards.every((c) => c && typeof c.id === "string" && slugSet.has(c.slug))) return null;
  if (new Set(s.cards.map((c) => c.id)).size !== s.cards.length) return null;
  if (!s.team || typeof s.team !== "object") return null;
  for (const t of [s.transactions, s.packOpenings, s.matches]) if (!Array.isArray(t)) return null;
  if (!s.processedRequests || typeof s.processedRequests !== "object") return null;
  if (!s.randoms || !s.quickRace) return null;
  // Drop team slots pointing at cards the player no longer owns or of the wrong category.
  const owned = new Map(s.cards.map((c) => [c.id, c]));
  const team = { ...s.team } as Team;
  for (const cat of ["driver", "car", "pit_crew"] as CardCategory[]) {
    const inst = team[cat] ? owned.get(team[cat]!) : undefined;
    if (!inst || CATALOGUE.find((t) => t.slug === inst.slug)?.category !== cat) team[cat] = null;
  }
  return { ...(s as GameState), team };
}
