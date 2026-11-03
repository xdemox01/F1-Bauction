// Test version transport: runs the real server-side game code (Lobby, auction
// rules, race runner) inside the page, so the full game can be played in one
// tab against AI managers without a server. Online play uses api.ts over HTTP.

import { cryptoRng } from "../../lib/game/rng.ts";
import { Lobby } from "../server/lobby.ts";
import type { Settings } from "../shared/rules.ts";
import type { Action, LobbyView, RaceFrame } from "../shared/types.ts";

type FrameMsg = RaceFrame & { events: { t: number; carId: string; text: string }[]; serverNow: number };

interface Sub {
  managerId: string;
  onState: (v: LobbyView) => void;
  onFrame: (f: FrameMsg) => void;
  sent: number;
}

const rand = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join("");
};

class LocalHub {
  lobbies = new Map<string, Lobby>();
  subs = new Map<string, Set<Sub>>();
  private tickN = 0;

  constructor() {
    setInterval(() => this.tick(), 50);
  }

  private deps() {
    return { rng: cryptoRng(), newId: () => rand(8), newToken: () => rand(24) };
  }

  create(name: string, settings: Partial<Settings>) {
    let code = "";
    do code = rand(5).toUpperCase(); while (this.lobbies.has(code));
    const lobby = new Lobby(code, settings, Date.now(), this.deps());
    const r = lobby.addManager(name, Date.now());
    if (!r.ok) throw new Error(r.error);
    this.lobbies.set(code, lobby);
    return { code, token: r.value!.token, managerId: r.value!.id };
  }

  find(code: string) {
    return this.lobbies.get(code.toUpperCase());
  }

  act(code: string, token: string, action: Action) {
    const lobby = this.find(code);
    if (!lobby) throw new Error("No lobby with that code.");
    const m = lobby.byToken(token);
    if (!m) throw new Error("You’re not in this lobby.");
    const r = lobby.act(m.id, action, Date.now());
    this.push(lobby);
    if (!r.ok) throw new Error(r.error);
  }

  subscribe(code: string, token: string, onState: Sub["onState"], onFrame: Sub["onFrame"]): (() => void) | null {
    const lobby = this.find(code);
    const m = lobby?.byToken(token);
    if (!lobby || !m) return null;
    const sub: Sub = { managerId: m.id, onState, onFrame, sent: -1 };
    if (!this.subs.has(lobby.code)) this.subs.set(lobby.code, new Set());
    this.subs.get(lobby.code)!.add(sub);
    m.connected++;
    lobby.version++;
    this.push(lobby);
    return () => {
      this.subs.get(lobby.code)?.delete(sub);
      m.connected = Math.max(0, m.connected - 1);
    };
  }

  private push(lobby: Lobby) {
    const now = Date.now();
    for (const s of this.subs.get(lobby.code) ?? []) {
      if (s.sent === lobby.version) continue;
      s.sent = lobby.version;
      s.onState(lobby.view(s.managerId, now));
    }
  }

  private tick() {
    const now = Date.now();
    this.tickN++;
    for (const lobby of this.lobbies.values()) {
      try {
        lobby.tick(now);
        this.push(lobby);
        if (lobby.phase === "race" && lobby.race && this.tickN % 2 === 0) {
          const frame = lobby.race.frame();
          if (!frame) continue;
          const msg = { ...frame, events: lobby.race.events(), serverNow: now };
          for (const s of this.subs.get(lobby.code) ?? []) s.onFrame(msg);
        }
      } catch (e) {
        console.warn("lobby tick error", e);
      }
    }
  }
}

let hub: LocalHub | null = null;
export function localHub(): LocalHub {
  hub ??= new LocalHub();
  return hub;
}
