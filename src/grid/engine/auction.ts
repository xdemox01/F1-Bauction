// Live auction: one lot at a time, every team starts with 100 credits.
// Pure state + functions; the UI calls tick() on a timer and the tests drive
// time directly. Times are in milliseconds of auction clock.

import type { CardCategory, RatedCardTemplate } from "../../lib/cards/types.ts";
import { CATALOGUE, requireTemplate } from "../../lib/game/catalogue.ts";
import { pickOne, sampleWeighted, uniform } from "../../lib/game/rng.ts";
import type { Rng } from "../../lib/game/rng.ts";

export const CATEGORIES: CardCategory[] = ["driver", "car", "pit_crew"];

export const AUCTION_RULES = {
  startingCredits: 100,
  lotsPerCategory: 7,
  /** A team may own at most this many items of one category (the extra is a reserve). */
  maxPerCategory: 2,
  openingMs: 9000,
  /** After a bid the clock is topped back up to at least this. */
  afterBidMs: 5000,
  soldPauseMs: 1600,
  minIncrement: 1,
};

export const AI_NAMES = ["Halcyon Racing", "Ridgeback GP", "Corsa Nova", "Vantor Motorsport"];

export interface Bidder {
  id: string;
  name: string;
  isPlayer: boolean;
  credits: number;
  items: { slug: string; price: number; freeAgent?: boolean }[];
  /** AI only: how much above or below fair value this team tends to pay. */
  appetite: number;
}

export interface Bid {
  bidderId: string;
  amount: number;
  at: number;
}

export interface LotState {
  slug: string;
  highBid: number;
  highBidderId: string | null;
  passed: string[];
  endsAt: number;
  bids: Bid[];
  /** Set when the hammer falls. */
  soldTo: string | null | undefined;
  soldAt?: number;
}

export interface AuctionState {
  lots: string[];
  lotIndex: number;
  now: number;
  speed: number;
  bidders: Bidder[];
  lot: LotState | null;
  nextThink: Record<string, number>;
  history: { slug: string; winnerId: string | null; price: number }[];
  done: boolean;
}

export type AuctionResult = { ok: true; state: AuctionState } | { ok: false; state: AuctionState; error: string };

const template = (slug: string) => requireTemplate(slug);
export const categoryOf = (slug: string) => template(slug).category;

/** Fair value guide in credits, shown to the player too. */
export function fairValue(card: RatedCardTemplate): number {
  return Math.max(2, Math.round(2 + (card.overall - 70) * 1.55));
}

export function countByCategory(b: Bidder): Record<CardCategory, number> {
  const out: Record<CardCategory, number> = { driver: 0, car: 0, pit_crew: 0 };
  for (const it of b.items) out[categoryOf(it.slug)]++;
  return out;
}

export function missingCategories(b: Bidder): CardCategory[] {
  const c = countByCategory(b);
  return CATEGORIES.filter((k) => c[k] === 0);
}

export function hasFullTeam(b: Bidder): boolean {
  return missingCategories(b).length === 0;
}

/** Highest total a bidder may bid on the current lot (hard limit: credits on hand). */
export function maxBidFor(state: AuctionState, bidderId: string): number {
  const b = state.bidders.find((x) => x.id === bidderId);
  if (!b || !state.lot) return 0;
  if (countByCategory(b)[categoryOf(state.lot.slug)] >= AUCTION_RULES.maxPerCategory) return 0;
  return b.credits;
}

export function canBid(state: AuctionState, bidderId: string, amount: number): string | null {
  const lot = state.lot;
  if (!lot || lot.soldTo !== undefined) return "No lot is open for bidding.";
  if (lot.passed.includes(bidderId)) return "You passed on this lot.";
  if (lot.highBidderId === bidderId) return "You already have the highest bid.";
  const b = state.bidders.find((x) => x.id === bidderId);
  if (!b) return "Unknown bidder.";
  if (countByCategory(b)[categoryOf(lot.slug)] >= AUCTION_RULES.maxPerCategory) {
    return `You already own ${AUCTION_RULES.maxPerCategory} of this kind of item.`;
  }
  if (!Number.isInteger(amount)) return "Bids must be whole credits.";
  if (amount < lot.highBid + AUCTION_RULES.minIncrement) return `Bid at least ${lot.highBid + AUCTION_RULES.minIncrement}.`;
  if (amount > b.credits) return `You only have ${b.credits} credits.`;
  return null;
}

function chooseLots(rng: Rng): string[] {
  const lots: string[] = [];
  for (const cat of CATEGORIES) {
    let pool = CATALOGUE.filter((t) => t.category === cat);
    if (cat === "driver") {
      // One card per real driver per auction.
      const seen = new Set<string>();
      pool = sampleWeighted(rng, pool, () => 1, pool.length).filter((t) => {
        const id = (t as { driverId: string }).driverId;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    lots.push(...sampleWeighted(rng, pool, () => 1, AUCTION_RULES.lotsPerCategory).map((t) => t.slug));
  }
  return sampleWeighted(rng, lots, () => 1, lots.length); // shuffle
}

export function createAuction(rng: Rng, opts: { playerName?: string; speed?: number } = {}): AuctionState {
  const bidders: Bidder[] = [
    { id: "player", name: opts.playerName ?? "You", isPlayer: true, credits: AUCTION_RULES.startingCredits, items: [], appetite: 1 },
    ...AI_NAMES.map((name, i) => ({
      id: `ai${i + 1}`,
      name,
      isPlayer: false,
      credits: AUCTION_RULES.startingCredits,
      items: [],
      appetite: Math.round(uniform(rng, 1.0, 1.35) * 100) / 100,
    })),
  ];
  const state: AuctionState = {
    lots: chooseLots(rng),
    lotIndex: 0,
    now: 0,
    speed: opts.speed ?? 1,
    bidders,
    lot: null,
    nextThink: {},
    history: [],
    done: false,
  };
  return openLot(state, rng);
}

function openLot(state: AuctionState, rng: Rng): AuctionState {
  if (state.lotIndex >= state.lots.length) return { ...state, lot: null, done: true };
  const lot: LotState = {
    slug: state.lots[state.lotIndex],
    highBid: 0,
    highBidderId: null,
    passed: [],
    endsAt: state.now + AUCTION_RULES.openingMs / state.speed,
    bids: [],
    soldTo: undefined,
  };
  const nextThink: Record<string, number> = {};
  for (const b of state.bidders) if (!b.isPlayer) nextThink[b.id] = state.now + uniform(rng, 900, 2600) / state.speed;
  return { ...state, lot, nextThink };
}

export function placeBid(state: AuctionState, bidderId: string, amount: number): AuctionResult {
  const err = canBid(state, bidderId, amount);
  if (err) return { ok: false, state, error: err };
  const lot = state.lot!;
  const endsAt = Math.max(lot.endsAt, state.now + AUCTION_RULES.afterBidMs / state.speed);
  return {
    ok: true,
    state: {
      ...state,
      lot: { ...lot, highBid: amount, highBidderId: bidderId, endsAt, bids: [...lot.bids, { bidderId, amount, at: state.now }] },
    },
  };
}

export function pass(state: AuctionState, bidderId: string): AuctionResult {
  const lot = state.lot;
  if (!lot || lot.soldTo !== undefined) return { ok: false, state, error: "No lot is open." };
  if (lot.highBidderId === bidderId) return { ok: false, state, error: "You can’t pass while you hold the highest bid." };
  if (lot.passed.includes(bidderId)) return { ok: true, state };
  return { ok: true, state: { ...state, lot: { ...lot, passed: [...lot.passed, bidderId] } } };
}

/** Bidders still able to take part in the current lot. */
export function activeBidders(state: AuctionState): Bidder[] {
  const lot = state.lot;
  if (!lot) return [];
  return state.bidders.filter(
    (b) =>
      !lot.passed.includes(b.id) &&
      countByCategory(b)[categoryOf(lot.slug)] < AUCTION_RULES.maxPerCategory &&
      b.credits >= Math.max(1, lot.highBid + (lot.highBidderId === b.id ? 0 : 1)),
  );
}

/** How much an AI team is willing to pay for the current lot. */
export function aiLimit(state: AuctionState, b: Bidder): number {
  const lot = state.lot!;
  const card = template(lot.slug);
  const cat = card.category;
  const owned = countByCategory(b);
  if (owned[cat] >= AUCTION_RULES.maxPerCategory) return 0;
  const missing = missingCategories(b);
  const need = owned[cat] === 0 ? 1 : 0.3; // a reserve is worth much less
  // Scarcity: few lots of this category left compared with teams still needing one.
  const remainingSame = state.lots.slice(state.lotIndex + 1).filter((s) => categoryOf(s) === cat).length;
  const teamsNeeding = state.bidders.filter((x) => countByCategory(x)[cat] === 0).length;
  const scarcity = owned[cat] === 0 && remainingSame < teamsNeeding ? 1.35 : 1;
  // Keep enough to buy something for every other missing slot.
  const otherMissing = missing.filter((m) => m !== cat).length;
  const reserve = otherMissing * 6;
  const value = fairValue(card) * need * scarcity * b.appetite;
  return Math.max(0, Math.min(Math.floor(value), b.credits - reserve));
}

function aiThink(state: AuctionState, b: Bidder, rng: Rng): AuctionState {
  const lot = state.lot!;
  if (lot.passed.includes(b.id) || lot.highBidderId === b.id) return state;
  const limit = aiLimit(state, b);
  const step = lot.highBid < 10 ? pickOne(rng, [1, 2, 3, 5]) : pickOne(rng, [1, 1, 2, 3]);
  const amount = Math.min(limit, lot.highBid + step);
  if (amount >= lot.highBid + 1) {
    const r = placeBid(state, b.id, amount);
    if (r.ok) return r.state;
  }
  return pass(state, b.id).state;
}

function closeLot(state: AuctionState): AuctionState {
  const lot = state.lot!;
  const winnerId = lot.highBidderId;
  const bidders = state.bidders.map((b) =>
    b.id === winnerId ? { ...b, credits: b.credits - lot.highBid, items: [...b.items, { slug: lot.slug, price: lot.highBid }] } : b,
  );
  return {
    ...state,
    bidders,
    lot: { ...lot, soldTo: winnerId, soldAt: state.now },
    history: [...state.history, { slug: lot.slug, winnerId, price: winnerId ? lot.highBid : 0 }],
  };
}

/** Advances the auction clock to `now`, letting AI teams act and closing lots. */
export function tick(state: AuctionState, now: number, rng: Rng): AuctionState {
  let s: AuctionState = { ...state, now };
  for (let guard = 0; guard < 200 && !s.done && s.lot; guard++) {
    const lot = s.lot;
    if (lot.soldTo !== undefined) {
      if (s.now - (lot.soldAt ?? s.now) < AUCTION_RULES.soldPauseMs / s.speed) break;
      s = openLot({ ...s, lotIndex: s.lotIndex + 1 }, rng);
      continue;
    }
    // AI teams whose think time has come.
    const due = s.bidders.filter((b) => !b.isPlayer && (s.nextThink[b.id] ?? Infinity) <= s.now);
    if (due.length) {
      for (const b of due) {
        s = aiThink(s, s.bidders.find((x) => x.id === b.id)!, rng);
        s = { ...s, nextThink: { ...s.nextThink, [b.id]: s.now + uniform(rng, 600, 1700) / s.speed } };
      }
      continue;
    }
    // Hammer falls when time runs out, or when nobody else can or will bid.
    const active = activeBidders(s);
    const onlyLeader = lot.highBidderId !== null && active.every((b) => b.id === lot.highBidderId);
    const nobody = active.length === 0;
    if (s.now >= lot.endsAt || onlyLeader || nobody) {
      s = closeLot(s);
      continue;
    }
    break;
  }
  return s;
}

/** Player has a full team and wants to skip ahead: the AI teams settle the remaining lots. */
export function finishWithoutPlayer(state: AuctionState, rng: Rng): AuctionState {
  let s = state;
  let t = s.now;
  for (let i = 0; i < 20000 && !s.done; i++) {
    if (s.lot && s.lot.soldTo === undefined && !s.lot.passed.includes("player") && s.lot.highBidderId !== "player") {
      s = pass(s, "player").state;
    }
    t += 250;
    s = tick(s, t, rng);
  }
  return s;
}

/** After the auction, any team missing a category gets the lowest-rated unsold item free. */
export function assignFreeAgents(state: AuctionState): AuctionState {
  const taken = new Set(state.bidders.flatMap((b) => b.items.map((i) => i.slug)));
  const driverIdOf = (slug: string) => (template(slug) as { driverId?: string }).driverId;
  const takenDrivers = new Set([...taken].map(driverIdOf).filter(Boolean));
  const bidders = state.bidders.map((b) => ({ ...b, items: [...b.items] }));
  for (const b of bidders) {
    for (const cat of missingCategories(b)) {
      const pool = CATALOGUE.filter(
        (t) => t.category === cat && !taken.has(t.slug) && t.serialLimit === null && !takenDrivers.has(driverIdOf(t.slug)),
      ).sort(
        (x, y) => x.overall - y.overall,
      );
      const pick = pool[0];
      if (pick) {
        taken.add(pick.slug);
        if (driverIdOf(pick.slug)) takenDrivers.add(driverIdOf(pick.slug));
        b.items.push({ slug: pick.slug, price: 0, freeAgent: true });
      }
    }
  }
  return { ...state, bidders };
}
