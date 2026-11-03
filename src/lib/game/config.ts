// Every economy and gameplay number in one place. The UI reads these values
// to show costs, odds and rewards, so what is displayed is what is applied.

import type { CardCategory, Rarity } from "../cards/types.ts";

export const SAVE_VERSION = 1;

export const ECONOMY = {
  startingCoins: 1000,
  /** Starter cards: one of each category, drawn from this rarity. */
  starterRarity: "rare" as Rarity,
};

export interface PackDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  cardCount: number;
  /** Probability of each rarity for every card in the pack. Must sum to 1. */
  odds: Partial<Record<Rarity, number>>;
}

export const PACKS: PackDefinition[] = [
  {
    id: "standard",
    name: "Standard pack",
    description: "Three cards from any category.",
    cost: 400,
    cardCount: 3,
    odds: { rare: 0.7, epic: 0.22, mythic: 0.065, apex: 0.015 },
  },
  {
    id: "premium",
    name: "Premium pack",
    description: "Five cards with much better odds of Mythic and Apex.",
    cost: 1200,
    cardCount: 5,
    odds: { rare: 0.4, epic: 0.38, mythic: 0.17, apex: 0.05 },
  },
];

/** Team score = weighted mix of the three cards' condition-adjusted ratings (basis points). */
export const TEAM_WEIGHTS: Record<CardCategory, number> = { driver: 4000, car: 4000, pit_crew: 2000 };

export const CONDITIONS = ["dry", "wet", "high_deg"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, { label: string; effect: string }> = {
  dry: { label: "Dry", effect: "Standard weights." },
  wet: { label: "Wet", effect: "Wet-weather skill and reliability count for more; raw pace counts for less." },
  high_deg: { label: "High tyre wear", effect: "Tyre management counts for much more; pace and aero count for less." },
};

/**
 * Attribute weight changes per condition, in basis points, added to the normal
 * rating weights. Each category's changes sum to zero so totals stay 10 000.
 */
export const CONDITION_WEIGHT_DELTAS: Record<Condition, Record<CardCategory, Record<string, number>>> = {
  dry: { driver: {}, car: {}, pit_crew: {} },
  wet: {
    driver: { wet_weather: 1000, pace: -500, racecraft: -500 },
    car: { reliability: 500, straight_line_speed: -500 },
    pit_crew: { coordination: 500, pit_stop_speed: -500 },
  },
  high_deg: {
    driver: { tyre_management: 1000, pace: -1000 },
    car: { tyre_management: 1000, aero: -500, straight_line_speed: -500 },
    pit_crew: { pit_stop_speed: 500, consistency: -500 },
  },
};

export const STRATEGIES = ["push", "balanced", "conservative"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_RULES: Record<Strategy, { label: string; paceDelta: number; variance: number; dnfFactor: number; summary: string }> = {
  push: {
    label: "Push",
    paceDelta: 1.5,
    variance: 3,
    dnfFactor: 0.3,
    summary: "+1.5 pace, more unpredictable, highest risk of a retirement.",
  },
  balanced: {
    label: "Balanced",
    paceDelta: 0,
    variance: 2,
    dnfFactor: 0.08,
    summary: "No pace change, moderate spread, small risk of a retirement.",
  },
  conservative: {
    label: "Conservative",
    paceDelta: -1,
    variance: 1.2,
    dnfFactor: 0,
    summary: "−1 pace, most predictable, no risk of a retirement.",
  },
};

export const RANDOMS = {
  entryFee: 100,
  freeRunsPerDay: 1,
  /** Draft order. */
  rounds: ["car", "driver", "pit_crew"] as CardCategory[],
  optionsPerRound: 3,
  secondsPerPick: 30,
  /** Relative chance of a card of each rarity appearing as a draft option. */
  rarityWeights: { common: 0, rare: 50, epic: 30, mythic: 15, apex: 5 } as Record<Rarity, number>,
  /** Coins by finishing position (index 0 = P1). A retirement earns nothing. */
  coinRewards: [300, 150, 75, 25],
  /** P1 keeps one drafted card permanently. */
  winnerKeepsCard: true,
  aiPickBestChance: 0.55,
};

export const QUICK_RACE = {
  coinRewards: [100, 50, 25, 10],
  rewardedRacesPerDay: 5,
  aiTeamRarityWeights: { common: 0, rare: 35, epic: 40, mythic: 20, apex: 5 } as Record<Rarity, number>,
};

export const AI_TEAM_NAMES = ["Halcyon Racing", "Ridgeback GP", "Corsa Nova"];

export const HISTORY_LIMITS = { transactions: 100, packOpenings: 50, matches: 50, processedRequests: 50 };
