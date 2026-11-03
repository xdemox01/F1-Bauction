// Team scoring and race simulation. Deterministic for a given Rng, and every
// number is returned so the UI can explain the result.

import { RATING_WEIGHTS } from "../cards/config.ts";
import type { CardCategory, RatedCardTemplate } from "../cards/types.ts";
import { CONDITION_WEIGHT_DELTAS, STRATEGY_RULES, TEAM_WEIGHTS } from "./config.ts";
import type { Condition, Strategy } from "./config.ts";
import { uniform } from "./rng.ts";
import type { Rng } from "./rng.ts";

export interface TeamCards {
  driver: RatedCardTemplate;
  car: RatedCardTemplate;
  pit_crew: RatedCardTemplate;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function conditionWeights(category: CardCategory, condition: Condition): Record<string, number> {
  const base = RATING_WEIGHTS[category] as Record<string, number>;
  const deltas = CONDITION_WEIGHT_DELTAS[condition][category];
  const out: Record<string, number> = {};
  for (const key of Object.keys(base)) out[key] = base[key] + (deltas[key] ?? 0);
  return out;
}

/** A card's rating under race conditions (equals its overall rating, unrounded, in the dry). */
export function cardScore(card: RatedCardTemplate, condition: Condition): number {
  const weights = conditionWeights(card.category, condition);
  const attrs = card.attributes as unknown as Record<string, number>;
  let total = 0;
  for (const key of Object.keys(weights)) total += attrs[key] * weights[key];
  return round2(total / 10_000);
}

export interface TeamScore {
  driver: number;
  car: number;
  pit_crew: number;
  total: number;
}

export function teamScore(team: TeamCards, condition: Condition = "dry"): TeamScore {
  const driver = cardScore(team.driver, condition);
  const car = cardScore(team.car, condition);
  const pit_crew = cardScore(team.pit_crew, condition);
  const total = round2((driver * TEAM_WEIGHTS.driver + car * TEAM_WEIGHTS.car + pit_crew * TEAM_WEIGHTS.pit_crew) / 10_000);
  return { driver, car, pit_crew, total };
}

export function retirementChance(team: TeamCards, strategy: Strategy): number {
  const rel = (team.car.attributes as { reliability: number }).reliability;
  const crewRel = (team.pit_crew.attributes as { reliability: number }).reliability;
  const avg = (rel + crewRel) / 2;
  return round2(((100 - avg) / 100) * STRATEGY_RULES[strategy].dnfFactor * 100) / 100;
}

export interface Entrant {
  id: string;
  name: string;
  isPlayer: boolean;
  team: TeamCards;
  strategy: Strategy;
}

export interface EntrantResult {
  id: string;
  name: string;
  isPlayer: boolean;
  strategy: Strategy;
  slugs: { driver: string; car: string; pit_crew: string };
  teamScore: TeamScore;
  paceDelta: number;
  variance: number;
  retirementChance: number;
  retired: boolean;
  raceScore: number | null;
  position: number;
}

export function simulateRace(entrants: Entrant[], condition: Condition, rng: Rng): EntrantResult[] {
  const results: EntrantResult[] = entrants.map((e) => {
    const rules = STRATEGY_RULES[e.strategy];
    const ts = teamScore(e.team, condition);
    const variance = round2(uniform(rng, -rules.variance, rules.variance));
    const chance = retirementChance(e.team, e.strategy);
    const retired = rng.next() < chance;
    return {
      id: e.id,
      name: e.name,
      isPlayer: e.isPlayer,
      strategy: e.strategy,
      slugs: { driver: e.team.driver.slug, car: e.team.car.slug, pit_crew: e.team.pit_crew.slug },
      teamScore: ts,
      paceDelta: rules.paceDelta,
      variance,
      retirementChance: chance,
      retired,
      raceScore: retired ? null : round2(ts.total + rules.paceDelta + variance),
      position: 0,
    };
  });
  // Finishers by race score; ties go to the higher team score, then entry order.
  // Retirements are classified last, in entry order.
  results.sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (a.retired) return 0;
    return b.raceScore! - a.raceScore! || b.teamScore.total - a.teamScore.total;
  });
  results.forEach((r, i) => (r.position = i + 1));
  return results;
}
