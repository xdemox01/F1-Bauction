// All state changes go through applyAction. Each action validates against the
// current state and either returns a new state or an error with the state
// unchanged, so a failed action can never half-apply.
//
// In this local prototype the rules run in the browser. The same functions are
// written to be moved behind server routes / database functions, where the
// client could no longer bypass them.

import { CARD_CATEGORIES, RARITIES } from "../cards/types.ts";
import type { CardCategory, Rarity } from "../cards/types.ts";
import { AI_TEAM_NAMES, CONDITIONS, HISTORY_LIMITS, PACKS, QUICK_RACE, RANDOMS, STRATEGIES } from "./config.ts";
import type { Strategy } from "./config.ts";
import { cardsInCategory, CATALOGUE, getTemplate, packPoolByRarity, requireTemplate } from "./catalogue.ts";
import { simulateRace } from "./race.ts";
import type { Entrant, EntrantResult, TeamCards } from "./race.ts";
import { pickOne, pickWeighted, sampleWeighted } from "./rng.ts";
import { dayKey } from "./state.ts";
import type { CardInstance, Ctx, GameState, MatchRecord, PackOpening, RandomsOpponent, RandomsRun, Transaction, TransactionKind } from "./state.ts";

export type Action =
  | { type: "pack/open"; packId: string; requestId: string }
  | { type: "team/set"; category: CardCategory; instanceId: string | null }
  | { type: "randoms/start"; requestId: string }
  | { type: "randoms/pick"; slug: string; round?: number }
  | { type: "randoms/autoPick" }
  | { type: "randoms/race"; strategy: Strategy }
  | { type: "randoms/keep"; slug: string }
  | { type: "randoms/close" }
  | { type: "randoms/abandon" }
  | { type: "quickRace/run"; strategy: Strategy; requestId: string };

export type ActionResult =
  | { ok: true; state: GameState; duplicate?: boolean; opening?: PackOpening; race?: EntrantResult[]; match?: MatchRecord }
  | { ok: false; state: GameState; error: string };

const fail = (state: GameState, error: string): ActionResult => ({ ok: false, state, error });

const keepLast = <T>(items: T[], n: number) => (items.length > n ? items.slice(items.length - n) : items);

function trimRequests(map: Record<string, string>): Record<string, string> {
  const entries = Object.entries(map);
  return entries.length > HISTORY_LIMITS.processedRequests
    ? Object.fromEntries(entries.slice(entries.length - HISTORY_LIMITS.processedRequests))
    : map;
}

function withMoney(state: GameState, amount: number, kind: TransactionKind, note: string, ctx: Ctx): GameState {
  const coins = state.coins + amount;
  if (coins < 0) throw new Error("Balance would go negative");
  const tx: Transaction = { id: ctx.newId(), at: ctx.now.toISOString(), kind, amount, balanceAfter: coins, note };
  return { ...state, coins, transactions: keepLast([...state.transactions, tx], HISTORY_LIMITS.transactions) };
}

const bump = (s: GameState): GameState => ({ ...s, revision: s.revision + 1 });

export function ownedTemplate(state: GameState, instanceId: string | null) {
  if (!instanceId) return undefined;
  const inst = state.cards.find((c) => c.id === instanceId);
  return inst ? getTemplate(inst.slug) : undefined;
}

export function teamCards(state: GameState): TeamCards | null {
  const driver = ownedTemplate(state, state.team.driver);
  const car = ownedTemplate(state, state.team.car);
  const pit_crew = ownedTemplate(state, state.team.pit_crew);
  return driver && car && pit_crew ? { driver, car, pit_crew } : null;
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/** Draws one card for a pack slot. If a rarity has no eligible cards, the next lower (then higher) rarity is used. */
export function drawPackCard(odds: Partial<Record<Rarity, number>>, rng: Ctx["rng"]) {
  const rarity = pickWeighted(rng, odds);
  const idx = RARITIES.indexOf(rarity);
  const order = [...RARITIES.slice(0, idx + 1).reverse(), ...RARITIES.slice(idx + 1)];
  for (const r of order) {
    const pool = packPoolByRarity(r);
    if (pool.length) return pickOne(rng, pool);
  }
  throw new Error("Pack pool is empty");
}

function openPack(state: GameState, a: Extract<Action, { type: "pack/open" }>, ctx: Ctx): ActionResult {
  const done = state.processedRequests[a.requestId];
  if (done) {
    return { ok: true, state, duplicate: true, opening: state.packOpenings.find((p) => p.id === done) };
  }
  const pack = PACKS.find((p) => p.id === a.packId);
  if (!pack) return fail(state, "That pack doesn’t exist.");
  if (state.coins < pack.cost) return fail(state, `You need ${pack.cost - state.coins} more coins to open a ${pack.name.toLowerCase()}.`);

  const at = ctx.now.toISOString();
  const newCards: CardInstance[] = Array.from({ length: pack.cardCount }, () => ({
    id: ctx.newId(),
    slug: drawPackCard(pack.odds, ctx.rng).slug,
    acquiredAt: at,
    method: "pack" as const,
  }));
  const opening: PackOpening = {
    id: ctx.newId(),
    requestId: a.requestId,
    packId: pack.id,
    at,
    cost: pack.cost,
    cardIds: newCards.map((c) => c.id),
    slugs: newCards.map((c) => c.slug),
  };
  let next = withMoney(state, -pack.cost, "pack_purchase", `Opened ${pack.name.toLowerCase()}`, ctx);
  next = {
    ...next,
    cards: [...next.cards, ...newCards],
    packOpenings: keepLast([...next.packOpenings, opening], HISTORY_LIMITS.packOpenings),
    processedRequests: trimRequests({ ...next.processedRequests, [a.requestId]: opening.id }),
  };
  return { ok: true, state: bump(next), opening };
}

// ---------------------------------------------------------------------------
// Team builder
// ---------------------------------------------------------------------------

function setTeam(state: GameState, a: Extract<Action, { type: "team/set" }>): ActionResult {
  if (!CARD_CATEGORIES.includes(a.category)) return fail(state, "Unknown team slot.");
  if (a.instanceId !== null) {
    const inst = state.cards.find((c) => c.id === a.instanceId);
    if (!inst) return fail(state, "You don’t own that card.");
    if (requireTemplate(inst.slug).category !== a.category) return fail(state, "That card doesn’t fit this slot.");
  }
  return { ok: true, state: bump({ ...state, team: { ...state.team, [a.category]: a.instanceId } }) };
}

// ---------------------------------------------------------------------------
// Randoms
// ---------------------------------------------------------------------------

export function randomsEntryCost(state: GameState, now: Date): number {
  const usedToday = state.randoms.freeRunDay === dayKey(now) ? state.randoms.freeRunsUsed : 0;
  return usedToday < RANDOMS.freeRunsPerDay ? 0 : RANDOMS.entryFee;
}

function draftOffers(ctx: Ctx) {
  return RANDOMS.rounds.map((category) => ({
    category,
    options: sampleWeighted(ctx.rng, cardsInCategory(category), (t) => RANDOMS.rarityWeights[t.rarity], RANDOMS.optionsPerRound).map((t) => t.slug),
  }));
}

function aiPick(options: string[], ctx: Ctx): string {
  if (ctx.rng.next() < RANDOMS.aiPickBestChance) {
    return [...options].sort((x, y) => requireTemplate(y).overall - requireTemplate(x).overall)[0];
  }
  return pickOne(ctx.rng, options);
}

const aiStrategy = (ctx: Ctx): Strategy => pickWeighted(ctx.rng, { push: 1, balanced: 2, conservative: 1 });

function startRandoms(state: GameState, a: Extract<Action, { type: "randoms/start" }>, ctx: Ctx): ActionResult {
  if (state.processedRequests[a.requestId]) return { ok: true, state, duplicate: true };
  if (state.randoms.active && !state.randoms.active.completed) return fail(state, "Finish or abandon your current Randoms run first.");
  const cost = randomsEntryCost(state, ctx.now);
  if (state.coins < cost) return fail(state, `Entry costs ${cost} coins; you have ${state.coins}.`);

  const opponents: RandomsOpponent[] = AI_TEAM_NAMES.map((name) => {
    const offers = draftOffers(ctx);
    const picks = Object.fromEntries(offers.map((o) => [o.category, aiPick(o.options, ctx)])) as Record<CardCategory, string>;
    return { id: ctx.newId(), name, picks, strategy: aiStrategy(ctx) };
  });
  const run: RandomsRun = {
    id: ctx.newId(),
    startedAt: ctx.now.toISOString(),
    entryCost: cost,
    offers: draftOffers(ctx),
    picks: [],
    roundStartedAt: ctx.now.toISOString(),
    opponents,
    conditions: pickOne(ctx.rng, CONDITIONS),
    phase: "draft",
    strategy: null,
    result: null,
    coinsAwarded: 0,
    keptSlug: null,
    completed: false,
  };
  const today = dayKey(ctx.now);
  const usedToday = state.randoms.freeRunDay === today ? state.randoms.freeRunsUsed : 0;
  let next: GameState = cost > 0 ? withMoney(state, -cost, "randoms_entry", "Randoms entry fee", ctx) : state;
  next = {
    ...next,
    randoms: { freeRunDay: today, freeRunsUsed: cost === 0 ? usedToday + 1 : usedToday, active: run },
    processedRequests: trimRequests({ ...next.processedRequests, [a.requestId]: run.id }),
  };
  return { ok: true, state: bump(next) };
}

function withRun(state: GameState, run: RandomsRun): GameState {
  return bump({ ...state, randoms: { ...state.randoms, active: run } });
}

function pickRandoms(state: GameState, slug: string, ctx: Ctx, round?: number): ActionResult {
  const run = state.randoms.active;
  // A repeated click for a round that's already been picked is ignored, not an error.
  if (run && round !== undefined && round < run.picks.length) return { ok: true, state, duplicate: true };
  if (!run || run.phase !== "draft") return fail(state, "There is no draft in progress.");
  const offer = run.offers[run.picks.length];
  if (!offer.options.includes(slug)) return fail(state, "That card isn’t one of this round’s options.");
  const picks = [...run.picks, slug];
  const phase = picks.length === run.offers.length ? "strategy" : "draft";
  return { ok: true, state: withRun(state, { ...run, picks, phase, roundStartedAt: ctx.now.toISOString() }) };
}

export function secondsLeftInPick(run: RandomsRun, now: Date): number {
  const elapsed = (now.getTime() - new Date(run.roundStartedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(RANDOMS.secondsPerPick - elapsed));
}

function autoPickRandoms(state: GameState, ctx: Ctx): ActionResult {
  const run = state.randoms.active;
  if (!run || run.phase !== "draft") return fail(state, "There is no draft in progress.");
  if (secondsLeftInPick(run, ctx.now) > 0) return fail(state, "There is still time left to pick.");
  const offer = run.offers[run.picks.length];
  const best = [...offer.options].sort((x, y) => requireTemplate(y).overall - requireTemplate(x).overall)[0];
  return pickRandoms(state, best, ctx);
}

function raceRandoms(state: GameState, strategy: Strategy, ctx: Ctx): ActionResult {
  const run = state.randoms.active;
  if (!run || run.phase !== "strategy") return fail(state, "Finish the draft before racing.");
  if (!STRATEGIES.includes(strategy)) return fail(state, "Unknown strategy.");
  const pickOf = (cat: CardCategory) => requireTemplate(run.picks[run.offers.findIndex((o) => o.category === cat)]);
  const entrants: Entrant[] = [
    { id: "player", name: "Your team", isPlayer: true, strategy, team: { driver: pickOf("driver"), car: pickOf("car"), pit_crew: pickOf("pit_crew") } },
    ...run.opponents.map((o) => ({
      id: o.id,
      name: o.name,
      isPlayer: false,
      strategy: o.strategy,
      team: { driver: requireTemplate(o.picks.driver), car: requireTemplate(o.picks.car), pit_crew: requireTemplate(o.picks.pit_crew) },
    })),
  ];
  const result = simulateRace(entrants, run.conditions, ctx.rng);
  const me = result.find((r) => r.isPlayer)!;
  const coins = me.retired ? 0 : (RANDOMS.coinRewards[me.position - 1] ?? 0);
  const won = me.position === 1 && !me.retired;
  const match: MatchRecord = {
    id: run.id,
    mode: "randoms",
    at: ctx.now.toISOString(),
    conditions: run.conditions,
    position: me.position,
    retired: me.retired,
    won,
    coins,
    keptSlug: null,
  };
  let next = coins > 0 ? withMoney(state, coins, "randoms_reward", `Randoms P${me.position}`, ctx) : state;
  next = { ...next, matches: keepLast([...next.matches, match], HISTORY_LIMITS.matches) };
  const finished: RandomsRun = {
    ...run,
    phase: "finished",
    strategy,
    result,
    coinsAwarded: coins,
    completed: !(won && RANDOMS.winnerKeepsCard),
  };
  return { ok: true, state: withRun(next, finished), race: result, match };
}

function keepRandomsCard(state: GameState, slug: string, ctx: Ctx): ActionResult {
  const run = state.randoms.active;
  // Repeated clicks after a card was kept are ignored; only one card is ever granted.
  if (run?.keptSlug) return { ok: true, state, duplicate: true };
  if (!run || run.phase !== "finished" || run.completed) return fail(state, "There is no card to claim.");
  const me = run.result?.find((r) => r.isPlayer);
  if (!me || me.position !== 1 || me.retired) return fail(state, "Only a win earns a drafted card.");
  if (!run.picks.includes(slug)) return fail(state, "You can only keep one of the cards you drafted.");
  const card: CardInstance = { id: ctx.newId(), slug, acquiredAt: ctx.now.toISOString(), method: "randoms_reward" };
  const matches = state.matches.map((m) => (m.id === run.id ? { ...m, keptSlug: slug } : m));
  return { ok: true, state: withRun({ ...state, cards: [...state.cards, card], matches }, { ...run, keptSlug: slug, completed: true }) };
}

function closeRandoms(state: GameState): ActionResult {
  const run = state.randoms.active;
  if (!run) return { ok: true, state };
  if (!run.completed) return fail(state, run.phase === "finished" ? "Choose the card you want to keep first." : "This run isn’t finished.");
  return { ok: true, state: bump({ ...state, randoms: { ...state.randoms, active: null } }) };
}

function abandonRandoms(state: GameState): ActionResult {
  const run = state.randoms.active;
  if (!run || run.phase === "finished") return fail(state, "There is no unfinished run to abandon.");
  return { ok: true, state: bump({ ...state, randoms: { ...state.randoms, active: null } }) };
}

// ---------------------------------------------------------------------------
// Quick race (single player, uses your saved team)
// ---------------------------------------------------------------------------

export function quickRaceRewardsLeft(state: GameState, now: Date): number {
  const used = state.quickRace.day === dayKey(now) ? state.quickRace.rewardedRaces : 0;
  return Math.max(0, QUICK_RACE.rewardedRacesPerDay - used);
}

function runQuickRace(state: GameState, a: Extract<Action, { type: "quickRace/run" }>, ctx: Ctx): ActionResult {
  if (state.processedRequests[a.requestId]) return { ok: true, state, duplicate: true };
  const team = teamCards(state);
  if (!team) return fail(state, "Pick a driver, car and pit crew in the team builder first.");
  if (!STRATEGIES.includes(a.strategy)) return fail(state, "Unknown strategy.");
  const aiCard = (cat: CardCategory) =>
    sampleWeighted(ctx.rng, cardsInCategory(cat, CATALOGUE), (t) => QUICK_RACE.aiTeamRarityWeights[t.rarity], 1)[0];
  const conditions = pickOne(ctx.rng, CONDITIONS);
  const entrants: Entrant[] = [
    { id: "player", name: "Your team", isPlayer: true, strategy: a.strategy, team },
    ...AI_TEAM_NAMES.map((name) => ({
      id: ctx.newId(),
      name,
      isPlayer: false,
      strategy: aiStrategy(ctx),
      team: { driver: aiCard("driver"), car: aiCard("car"), pit_crew: aiCard("pit_crew") },
    })),
  ];
  const race = simulateRace(entrants, conditions, ctx.rng);
  const me = race.find((r) => r.isPlayer)!;
  const left = quickRaceRewardsLeft(state, ctx.now);
  const coins = left > 0 && !me.retired ? (QUICK_RACE.coinRewards[me.position - 1] ?? 0) : 0;
  const match: MatchRecord = {
    id: ctx.newId(),
    mode: "quick_race",
    at: ctx.now.toISOString(),
    conditions,
    position: me.position,
    retired: me.retired,
    won: me.position === 1 && !me.retired,
    coins,
    keptSlug: null,
  };
  const today = dayKey(ctx.now);
  const used = state.quickRace.day === today ? state.quickRace.rewardedRaces : 0;
  let next = coins > 0 ? withMoney(state, coins, "race_reward", `Quick race P${me.position}`, ctx) : state;
  next = {
    ...next,
    quickRace: { day: today, rewardedRaces: left > 0 ? used + 1 : used },
    matches: keepLast([...next.matches, match], HISTORY_LIMITS.matches),
    processedRequests: trimRequests({ ...next.processedRequests, [a.requestId]: match.id }),
  };
  return { ok: true, state: bump(next), race, match };
}

// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "pack/open":
      return openPack(state, action, ctx);
    case "team/set":
      return setTeam(state, action);
    case "randoms/start":
      return startRandoms(state, action, ctx);
    case "randoms/pick":
      return pickRandoms(state, action.slug, ctx, action.round);
    case "randoms/autoPick":
      return autoPickRandoms(state, ctx);
    case "randoms/race":
      return raceRandoms(state, action.strategy, ctx);
    case "randoms/keep":
      return keepRandomsCard(state, action.slug, ctx);
    case "randoms/close":
      return closeRandoms(state);
    case "randoms/abandon":
      return abandonRandoms(state);
    case "quickRace/run":
      return runQuickRace(state, action, ctx);
    default:
      return fail(state, "Unknown action.");
  }
}
