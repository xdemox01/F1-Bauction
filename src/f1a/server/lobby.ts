// Authoritative game state for one lobby. Every rule is enforced here; browsers
// only send requests ("bid +10", "I'm out", "confirm lineup") and render the
// views this module produces. Time and randomness are injected so the whole
// game can be tested without a network or a real clock.

import { sampleWeighted, uniform } from "../../lib/game/rng.ts";
import type { Rng } from "../../lib/game/rng.ts";
import { buildPool, privateer } from "../shared/pool.ts";
import type { Category, Item } from "../shared/pool.ts";
import { DEFAULT_SETTINGS, fairValue, RULES, SQUAD_SIZE, TEAM_COLORS, validateSettings } from "../shared/rules.ts";
import type { Settings, Strategy } from "../shared/rules.ts";
import type { Action, ChatMessage, ItemView, LobbyView, LotView, ManagerView, Phase, StandingRow } from "../shared/types.ts";
import { RaceRunner } from "./raceRunner.ts";

export interface Manager {
  id: string;
  token: string;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  seq: number;
  credits: number;
  squad: { item: Item; price: number; how: "bought" | "assigned" | "free" }[];
  connected: number; // number of open streams
  lastSeen: number;
  raceDrivers: string[];
  strategy: Strategy;
  lineupConfirmed: boolean;
  ready: boolean;
  appetite: number;
  nextThink: number;
  lastChat: number;
}

interface Lot {
  no: number;
  item: Item;
  category: Category;
  highBid: number;
  leaderId: string | null;
  out: Set<string>;
  endsAt: number;
  bids: { managerId: string; amount: number; at: number }[];
  result: LotView["result"];
  resultAt: number;
}

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

export interface Deps {
  rng: Rng;
  newId: () => string;
  newToken: () => string;
}

export class Lobby {
  code: string;
  phase: Phase = "lobby";
  settings: Settings;
  managers: Manager[] = [];
  private deps: Deps;
  private seq = 0;
  // auction
  private queues = new Map<Category, Item[]>();
  private categoryIndex = 0;
  private lot: Lot | null = null;
  private lotNo = 0;
  private privateers = 0;
  log: LobbyView["auctionLog"] = [];
  chat: ChatMessage[] = [];
  private chatId = 0;
  // phases
  phaseEndsAt: number | null = null;
  standings = new Map<string, StandingRow>();
  race: RaceRunner | null = null;
  version = 0;
  createdAt: number;
  lastActivity: number;

  constructor(code: string, settings: Partial<Settings>, now: number, deps: Deps) {
    this.code = code;
    this.settings = validateSettings(settings, DEFAULT_SETTINGS);
    this.deps = deps;
    this.createdAt = now;
    this.lastActivity = now;
  }

  // ------------------------------------------------------------------ managers
  addManager(name: string, now: number, isBot = false): Result<Manager> {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, RULES.nameMax);
    if (!clean) return { ok: false, error: "Enter a manager name." };
    if (this.phase !== "lobby") return { ok: false, error: "This lobby’s auction has already started." };
    if (this.managers.length >= RULES.maxManagers) return { ok: false, error: `This lobby is full (${RULES.maxManagers} managers).` };
    let finalName = clean;
    for (let n = 2; this.managers.some((m) => m.name.toLowerCase() === finalName.toLowerCase()); n++) finalName = `${clean.slice(0, RULES.nameMax - 3)} ${n}`;
    const used = new Set(this.managers.map((m) => m.color));
    const m: Manager = {
      id: this.deps.newId(),
      token: this.deps.newToken(),
      name: finalName,
      color: TEAM_COLORS.find((c) => !used.has(c)) ?? TEAM_COLORS[0],
      isHost: this.managers.filter((x) => !x.isBot).length === 0 && !isBot,
      isBot,
      seq: this.seq++,
      credits: RULES.budget,
      squad: [],
      connected: 0,
      lastSeen: now,
      raceDrivers: [],
      strategy: "balanced",
      lineupConfirmed: false,
      ready: isBot,
      appetite: isBot ? Math.round(uniform(this.deps.rng, 0.95, 1.3) * 100) / 100 : 1,
      nextThink: 0,
      lastChat: 0,
    };
    this.managers.push(m);
    this.system(`${m.name} joined the lobby.`, now);
    this.touch(now);
    return { ok: true, value: m };
  }

  byToken(token: string): Manager | undefined {
    return this.managers.find((m) => m.token === token);
  }

  private touch(now: number) {
    this.version++;
    this.lastActivity = now;
  }

  humans(): Manager[] {
    return this.managers.filter((m) => !m.isBot);
  }

  /** Only one human against AI managers: skip the waiting stages. */
  solo(): boolean {
    return this.humans().length <= 1;
  }

  // ------------------------------------------------------------------ actions
  act(managerId: string, action: Action, now: number): Result {
    const m = this.managers.find((x) => x.id === managerId);
    if (!m) return { ok: false, error: "You’re not in this lobby." };
    m.lastSeen = now;
    switch (action.type) {
      case "settings":
        if (!m.isHost) return { ok: false, error: "Only the host can change lobby settings." };
        if (this.phase !== "lobby") return { ok: false, error: "Settings are locked once the auction starts." };
        this.settings = validateSettings(action.settings ?? {}, this.settings);
        this.touch(now);
        return { ok: true };
      case "color": {
        if (!TEAM_COLORS.includes(action.color)) return { ok: false, error: "Unknown colour." };
        if (this.managers.some((x) => x.id !== m.id && x.color === action.color)) return { ok: false, error: "Another team already uses that colour." };
        m.color = action.color;
        this.touch(now);
        return { ok: true };
      }
      case "addBot": {
        if (!m.isHost) return { ok: false, error: "Only the host can add AI managers." };
        const names = ["Halcyon AI", "Ridgeback AI", "Corsa AI", "Vantor AI", "Kestrel AI", "Meridian AI", "Apex AI", "Torque AI", "Solent AI"];
        const name = names.find((n) => !this.managers.some((x) => x.name === n)) ?? "AI manager";
        const r = this.addManager(name, now, true);
        return r.ok ? { ok: true } : r;
      }
      case "removeBot": {
        if (!m.isHost) return { ok: false, error: "Only the host can remove AI managers." };
        if (this.phase !== "lobby") return { ok: false, error: "The auction has started." };
        const bot = this.managers.find((x) => x.id === action.managerId && x.isBot);
        if (!bot) return { ok: false, error: "No such AI manager." };
        this.managers = this.managers.filter((x) => x !== bot);
        this.touch(now);
        return { ok: true };
      }
      case "start":
        if (!m.isHost) return { ok: false, error: "Only the host can start the auction." };
        if (this.phase !== "lobby") return { ok: false, error: "The auction has already started." };
        if (this.managers.length < RULES.minManagers) return { ok: false, error: `At least ${RULES.minManagers} managers are required.` };
        {
          const waiting = this.managers.filter((x) => !x.isBot && !x.isHost && !x.ready);
          if (waiting.length) return { ok: false, error: `Waiting for ${waiting.map((x) => x.name).join(", ")} to be ready.` };
        }
        this.startAuction(now);
        return { ok: true };
      case "leave":
        this.leave(m, now);
        return { ok: true };
      case "bid": {
        const lot = this.lot;
        if (this.phase !== "auction" || !lot || lot.result) return { ok: false, error: "No lot is open for bidding." };
        if (action.allIn) return this.bid(m, this.maxBid(m) - lot.highBid, now);
        if (action.total !== undefined) {
          if (!Number.isInteger(action.total)) return { ok: false, error: "Enter a whole number of credits." };
          if (action.total <= lot.highBid) return { ok: false, error: `Your total bid must be more than the current bid (${lot.highBid}).` };
          return this.bid(m, action.total - lot.highBid, now);
        }
        return this.bid(m, action.increment ?? 0, now);
      }
      case "chat": {
        const text = String(action.text ?? "").replace(/\s+/g, " ").trim().slice(0, RULES.chatMax);
        if (!text) return { ok: false, error: "Type a message first." };
        if (now - m.lastChat < 600) return { ok: false, error: "You’re sending messages too quickly." };
        m.lastChat = now;
        this.pushChat({ managerId: m.id, name: m.name, color: m.color, text, at: now, system: false });
        this.touch(now);
        return { ok: true };
      }
      case "lobbyReady":
        if (this.phase !== "lobby") return { ok: false, error: "The auction has already started." };
        m.ready = !!action.ready;
        this.touch(now);
        return { ok: true };
      case "out":
        return this.out(m, now);
      case "lineup":
        return this.setLineup(m, action.raceDrivers, action.strategy, now);
      case "confirmLineup":
        if (this.phase !== "lineup") return { ok: false, error: "Lineups aren’t open." };
        m.lineupConfirmed = true;
        this.touch(now);
        this.maybeEndLineup(now);
        return { ok: true };
      case "ready":
        if (this.phase !== "review") return { ok: false, error: "Not in the review stage." };
        m.ready = true;
        this.touch(now);
        this.maybeEndReview(now);
        return { ok: true };
      case "carCommand":
        if (this.phase !== "race" || !this.race) return { ok: false, error: "No race is running." };
        return this.race.command(m.id, action);
      case "raceSpeed":
        if (!m.isHost) return { ok: false, error: "Only the host can change race speed." };
        if (!this.race) return { ok: false, error: "No race is running." };
        return this.race.setSpeed(action.speed);
      case "arcadeState":
        if (!this.race) return { ok: false, error: "No race is running." };
        return this.race.report(m.id, action, now);
      case "playAgain":
        if (!m.isHost) return { ok: false, error: "Only the host can start a new auction." };
        if (this.phase !== "final") return { ok: false, error: "The championship isn’t over." };
        this.resetForNewGame(now);
        return { ok: true };
      default:
        return { ok: false, error: "Unknown action." };
    }
  }

  private leave(m: Manager, now: number) {
    this.system(`${m.name} left${this.phase === "lobby" || this.phase === "final" ? "" : "; an AI manager takes over the team"}.`, now);
    if (this.phase === "lobby" || this.phase === "final") {
      this.managers = this.managers.filter((x) => x !== m);
    } else {
      // Mid-game: an AI manager takes over the team so the game can finish.
      m.isBot = true;
      m.name = `${m.name.slice(0, RULES.nameMax - 5)} (AI)`;
      m.token = this.deps.newToken();
      this.race?.handOver(m.id);
    }
    if (m.isHost) {
      m.isHost = false;
      const next = this.humans().sort((a, b) => a.seq - b.seq)[0];
      if (next) next.isHost = true;
    }
    this.touch(now);
  }

  private resetForNewGame(now: number) {
    this.phase = "lobby";
    for (const m of this.managers) {
      Object.assign(m, { credits: RULES.budget, squad: [], raceDrivers: [], strategy: "balanced", lineupConfirmed: false, ready: false });
    }
    this.lot = null;
    this.log = [];
    for (const m of this.managers) m.ready = m.isBot;
    this.standings.clear();
    this.race = null;
    this.phaseEndsAt = null;
    this.touch(now);
  }

  // ------------------------------------------------------------------ auction rules
  count(m: Manager, cat: Category): number {
    return m.squad.filter((s) => s.item.category === cat).length;
  }
  needs(m: Manager, cat: Category): number {
    return RULES.squad[cat] - this.count(m, cat);
  }
  emptySlots(m: Manager): number {
    return SQUAD_SIZE - m.squad.length;
  }
  /** 1 credit is reserved for every other empty slot. */
  maxBid(m: Manager): number {
    return Math.max(0, m.credits - (this.emptySlots(m) - 1));
  }

  private startAuction(now: number) {
    this.phase = "auction";
    const pool = buildPool(this.settings);
    for (const cat of RULES.order) {
      const items = pool.filter((i) => i.category === cat && i.era !== "academy");
      const academy = pool.filter((i) => i.category === cat && i.era === "academy");
      // Real names first in random order, academy (fictional) drivers after them.
      this.queues.set(cat, [...sampleWeighted(this.deps.rng, items, () => 1, items.length), ...sampleWeighted(this.deps.rng, academy, () => 1, academy.length)]);
    }
    this.categoryIndex = 0;
    this.lotNo = 0;
    for (const m of this.managers) {
      Object.assign(m, { credits: RULES.budget, squad: [], lineupConfirmed: false, ready: false });
    }
    this.openNextLot(now);
    this.touch(now);
  }

  private needers(cat: Category): Manager[] {
    return this.managers.filter((m) => this.needs(m, cat) > 0).sort((a, b) => a.squad.length - b.squad.length || a.seq - b.seq);
  }

  private openNextLot(now: number) {
    while (this.categoryIndex < RULES.order.length && this.needers(RULES.order[this.categoryIndex]).length === 0) this.categoryIndex++;
    if (this.categoryIndex >= RULES.order.length) {
      this.lot = null;
      this.startLineup(now);
      return;
    }
    const cat = RULES.order[this.categoryIndex];
    const queue = this.queues.get(cat)!;
    const item = queue.shift() ?? privateer(cat, this.privateers++);
    this.lotNo++;
    const lot: Lot = { no: this.lotNo, item, category: cat, highBid: 0, leaderId: null, out: new Set(), endsAt: now + RULES.bidClockMs, bids: [], result: null, resultAt: 0 };
    this.lot = lot;
    const needers = this.needers(cat);
    if (needers.length === 1) {
      const m = needers[0];
      const price = this.maxBid(m) >= 1 ? 1 : 0;
      this.award(m, price, price ? "assigned" : "free", `${m.name} is the only manager still needing a ${labelOf(cat)}.`, now);
      return;
    }
    if (needers.every((m) => this.maxBid(m) < 1)) {
      this.award(needers[0], 0, "free", "No eligible manager has credits left; it goes free to the smallest squad.", now);
      return;
    }
    // A manager who can only afford 1 credit per slot opens the lot at 1 automatically.
    const forced = needers.find((m) => this.maxBid(m) === 1);
    if (forced) {
      lot.highBid = 1;
      lot.leaderId = forced.id;
      lot.bids.push({ managerId: forced.id, amount: 1, at: now });
    }
    for (const m of this.managers) if (m.isBot) m.nextThink = now + uniform(this.deps.rng, 900, 2600);
    this.touch(now);
    this.checkLot(now);
  }

  eligible(lot: Lot): Manager[] {
    return this.managers.filter((m) => this.needs(m, lot.category) > 0 && !lot.out.has(m.id) && (m.id === lot.leaderId || this.maxBid(m) >= lot.highBid + 1));
  }

  bid(m: Manager, increment: number, now: number): Result {
    const lot = this.lot;
    if (this.phase !== "auction" || !lot || lot.result) return { ok: false, error: "No lot is open for bidding." };
    if (!Number.isInteger(increment) || increment > RULES.budget) return { ok: false, error: "Bids must be whole credits." };
    if (this.needs(m, lot.category) <= 0) return { ok: false, error: `Your ${labelOf(lot.category)} slots are full.` };
    if (lot.out.has(m.id)) return { ok: false, error: "You’re out of this lot." };
    if (lot.leaderId === m.id) return { ok: false, error: "You already have the highest bid." };
    const amount = lot.highBid + increment;
    const max = this.maxBid(m);
    if (increment < 1) return { ok: false, error: `Your maximum bid (${max}) doesn’t beat the current bid.` };
    if (amount > max) return { ok: false, error: `Your maximum bid is ${max} (1 credit is kept for each other empty slot).` };
    lot.highBid = amount;
    lot.leaderId = m.id;
    lot.bids.push({ managerId: m.id, amount, at: now });
    lot.endsAt = now + RULES.bidClockMs;
    this.touch(now);
    this.checkLot(now);
    return { ok: true };
  }

  out(m: Manager, now: number): Result {
    const lot = this.lot;
    if (this.phase !== "auction" || !lot || lot.result) return { ok: false, error: "No lot is open." };
    if (lot.leaderId === m.id) return { ok: false, error: "You can’t drop out while you’re leading." };
    lot.out.add(m.id);
    this.touch(now);
    this.checkLot(now);
    return { ok: true };
  }

  private checkLot(now: number) {
    const lot = this.lot;
    if (!lot || lot.result) return;
    const eligible = this.eligible(lot);
    const leader = lot.leaderId ? this.managers.find((m) => m.id === lot.leaderId)! : null;
    const challengers = eligible.filter((m) => m.id !== lot.leaderId);
    if (leader && challengers.length === 0) {
      this.award(leader, lot.highBid, "bought", `Sold to ${leader.name}.`, now);
    } else if (!leader && eligible.length === 0) {
      this.noBids(now);
    } else if (now >= lot.endsAt) {
      if (leader) this.award(leader, lot.highBid, "bought", `Sold to ${leader.name}.`, now);
      else this.noBids(now);
    }
  }

  private award(m: Manager, price: number, how: "bought" | "assigned" | "free", note: string, now: number) {
    const lot = this.lot!;
    m.credits -= price;
    m.squad.push({ item: lot.item, price, how });
    const kind = how === "bought" ? "sold" : how;
    lot.result = { kind, managerId: m.id, price, note };
    lot.resultAt = now;
    this.log.push({ no: lot.no, itemName: lot.item.name, category: lot.category, managerId: m.id, price, kind });
    this.system(how === "bought" ? `${lot.item.name} sold to ${m.name} for $${price}.` : `${lot.item.name} ${how === "free" ? "goes free" : `assigned for $${price}`} to ${m.name}.`, now);
    this.touch(now);
  }

  /** Nobody bid: everyone who still needs this position pays 1 credit if it doesn't touch their reserve. */
  private noBids(now: number) {
    const lot = this.lot!;
    const charged: string[] = [];
    for (const m of this.needers(lot.category)) {
      if (m.credits - 1 >= this.emptySlots(m)) {
        m.credits -= 1;
        charged.push(m.name);
      }
    }
    lot.result = {
      kind: "unsold",
      managerId: null,
      price: 0,
      note: charged.length ? `No bids. 1 credit charged to: ${charged.join(", ")}.` : "No bids.",
    };
    lot.resultAt = now;
    this.log.push({ no: lot.no, itemName: lot.item.name, category: lot.category, managerId: null, price: 0, kind: "unsold" });
    this.touch(now);
  }

  private botThink(m: Manager, now: number) {
    const lot = this.lot!;
    m.nextThink = now + uniform(this.deps.rng, 700, 2000);
    if (lot.out.has(m.id) || lot.leaderId === m.id || this.needs(m, lot.category) <= 0) return;
    const limit = this.botLimit(m, lot);
    if (lot.highBid + 1 > limit) {
      this.out(m, now);
      return;
    }
    const room = limit - lot.highBid;
    const r = this.deps.rng.next();
    const step = lot.highBid === 0 && room >= 12 && r < 0.35 ? 10 : room >= 8 && r < 0.25 ? 5 : 1;
    this.bid(m, Math.min(step, room), now);
  }

  private botLimit(m: Manager, lot: Lot): number {
    const cat = lot.category;
    const owned = this.count(m, cat);
    const base = fairValue(lot.item.overall);
    // Reserve drivers are worth less than race seats.
    const need = cat === "driver" && owned >= 2 ? 0.35 : 1;
    const remaining = (this.queues.get(cat)?.length ?? 0);
    const demand = this.managers.reduce((t, x) => t + Math.max(0, this.needs(x, cat)), 0);
    const scarcity = remaining < demand ? 1.3 : 1;
    // Spread spending across the slots still to fill.
    const share = (m.credits / Math.max(1, this.emptySlots(m))) * 2.2;
    return Math.min(this.maxBid(m), Math.floor(Math.min(base * need * scarcity * m.appetite, share + base * 0.3)));
  }

  // ------------------------------------------------------------------ lineup & review
  private startLineup(now: number) {
    this.phase = "lineup";
    this.phaseEndsAt = now + RULES.lineupMs;
    for (const m of this.managers) {
      const drivers = m.squad.filter((s) => s.item.category === "driver").sort((a, b) => b.item.overall - a.item.overall);
      m.raceDrivers = drivers.slice(0, 2).map((d) => d.item.id);
      m.strategy = "balanced";
      m.lineupConfirmed = m.isBot;
      m.ready = m.isBot;
    }
    // Playing against AI only: go straight to the race with your two best drivers.
    if (this.solo()) {
      this.startChampionship(now);
      return;
    }
    this.touch(now);
  }

  setLineup(m: Manager, raceDrivers: string[], strategy: Strategy, now: number): Result {
    if (this.phase !== "lineup") return { ok: false, error: "Lineups aren’t open." };
    if (m.lineupConfirmed) return { ok: false, error: "Your lineup is locked." };
    const owned = new Set(m.squad.filter((s) => s.item.category === "driver").map((s) => s.item.id));
    if (!Array.isArray(raceDrivers) || raceDrivers.length !== 2 || new Set(raceDrivers).size !== 2 || !raceDrivers.every((d) => owned.has(d))) {
      return { ok: false, error: "Choose two different drivers from your squad." };
    }
    if (!["balanced", "aggressive", "conservative"].includes(strategy)) return { ok: false, error: "Unknown strategy." };
    m.raceDrivers = [...raceDrivers];
    m.strategy = strategy;
    this.touch(now);
    return { ok: true };
  }

  private maybeEndLineup(now: number) {
    if (this.phase === "lineup" && this.managers.every((m) => m.lineupConfirmed)) this.startReview(now);
  }

  private startReview(now: number) {
    this.phase = "review";
    this.phaseEndsAt = now + RULES.reviewMs;
    for (const m of this.managers) {
      m.lineupConfirmed = true;
      m.ready = m.isBot;
    }
    this.touch(now);
  }

  private maybeEndReview(now: number) {
    if (this.phase === "review" && this.managers.every((m) => m.ready)) this.startChampionship(now);
  }

  // ------------------------------------------------------------------ championship
  private startChampionship(now: number) {
    this.phase = "race";
    this.phaseEndsAt = null;
    this.standings.clear();
    for (const m of this.managers) this.standings.set(m.id, { managerId: m.id, points: 0, wins: 0, best: 99 });
    this.race = new RaceRunner(this, now, this.deps.rng);
    this.touch(now);
  }

  /** Called by the race runner when a race is over. */
  recordRace(rows: { managerId: string; points: number; position: number }[]) {
    for (const r of rows) {
      const st = this.standings.get(r.managerId);
      if (!st) continue;
      st.points += r.points;
      if (r.position === 1) st.wins++;
      st.best = Math.min(st.best, r.position);
    }
    this.version++;
  }

  finishChampionship(now: number) {
    this.phase = "final";
    this.phaseEndsAt = null;
    this.touch(now);
  }

  sortedStandings(): StandingRow[] {
    return [...this.standings.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
  }

  // ------------------------------------------------------------------ clock
  tick(now: number) {
    if (this.phase === "auction") {
      const lot = this.lot;
      if (!lot) return;
      if (lot.result) {
        if (now - lot.resultAt >= (this.solo() ? 1200 : RULES.soldPauseMs)) this.openNextLot(now);
        return;
      }
      for (const m of this.managers) {
        if (m.isBot && now >= m.nextThink && !lot.result) this.botThink(m, now);
      }
      this.checkLot(now);
    } else if (this.phase === "lineup") {
      if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) this.startReview(now);
    } else if (this.phase === "review") {
      if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) this.startChampionship(now);
    } else if (this.phase === "race") {
      this.race?.tick(now);
    }
  }

  private pushChat(msg: Omit<ChatMessage, "id">) {
    this.chat.push({ id: ++this.chatId, ...msg });
    if (this.chat.length > RULES.chatKeep) this.chat.splice(0, this.chat.length - RULES.chatKeep);
  }

  private system(text: string, now: number) {
    this.pushChat({ managerId: null, name: "Race control", color: "#8a8f98", text, at: now, system: true });
  }

  topPurchases(): LobbyView["topPurchases"] {
    return this.log
      .filter((l) => l.kind === "sold" && l.managerId)
      .sort((a, b) => b.price - a.price || a.no - b.no)
      .slice(0, 5)
      .map((l) => ({ no: l.no, itemName: l.itemName, category: l.category, managerId: l.managerId!, price: l.price }));
  }

  // ------------------------------------------------------------------ views
  private itemView(item: Item): ItemView {
    const blind = this.settings.auctionMode === "blind";
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      era: item.era,
      team: item.team,
      season: item.season,
      nationality: item.nationality,
      fictional: item.fictional,
      overall: blind ? null : item.overall,
      attrs: blind ? null : item.attrs,
    };
  }

  teamOverall(m: Manager): number | null {
    const d = m.squad.filter((s) => s.item.category === "driver" && m.raceDrivers.includes(s.item.id));
    const one = (c: Category) => m.squad.find((s) => s.item.category === c)?.item.overall;
    const car = one("car"), crew = one("crew"), tp = one("principal");
    if (d.length < 2 || car === undefined || crew === undefined || tp === undefined) return null;
    const drivers = (d[0].item.overall + d[1].item.overall) / 2;
    return Math.round(0.35 * drivers + 0.35 * car + 0.15 * crew + 0.15 * tp);
  }

  private showTeamOverall(): boolean {
    if (this.settings.auctionMode !== "blind") return true;
    if (this.phase === "race" || this.phase === "final") return true;
    return (this.phase === "lineup" || this.phase === "review") && this.settings.showTeamOverall;
  }

  view(viewerId: string, now: number): LobbyView {
    const lot = this.lot;
    const showTeam = this.showTeamOverall();
    const managers: ManagerView[] = this.managers
      .sort((a, b) => a.seq - b.seq)
      .map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        isHost: m.isHost,
        isBot: m.isBot,
        isYou: m.id === viewerId,
        connected: m.isBot || m.connected > 0,
        credits: m.credits,
        maxBid: this.maxBid(m),
        squad: m.squad.map((s) => ({ item: this.itemView(s.item), price: s.price, how: s.how })),
        needs: { driver: this.needs(m, "driver"), car: this.needs(m, "car"), crew: this.needs(m, "crew"), principal: this.needs(m, "principal") },
        lineupConfirmed: m.lineupConfirmed,
        ready: m.ready,
        raceDrivers: m.raceDrivers,
        strategy: m.strategy,
        teamOverall: showTeam ? this.teamOverall(m) : null,
      }));
    return {
      code: this.code,
      you: viewerId,
      phase: this.phase,
      settings: this.settings,
      serverNow: now,
      managers,
      lot:
        lot && this.phase === "auction"
          ? {
              no: lot.no,
              item: this.itemView(lot.item),
              category: lot.category,
              categoryIndex: RULES.order.indexOf(lot.category),
              highBid: lot.highBid,
              leaderId: lot.leaderId,
              out: [...lot.out],
              endsAt: lot.endsAt,
              bids: lot.bids.slice(-8).map((b) => ({ managerId: b.managerId, amount: b.amount })),
              result: lot.result,
              eligible: this.eligible(lot).map((m) => m.id),
            }
          : null,
      auctionLog: this.log.slice(-12),
      topPurchases: this.topPurchases(),
      chat: this.chat.slice(-RULES.chatKeep),
      phaseEndsAt: this.phaseEndsAt,
      standings: this.sortedStandings(),
      race: this.race ? this.race.view(viewerId) : null,
      version: this.version,
    };
  }
}

function labelOf(cat: Category): string {
  return { driver: "driver", car: "car", crew: "pit crew", principal: "team principal" }[cat];
}

