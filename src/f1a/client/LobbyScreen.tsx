import { useState } from "react";

import { ALL_TEAMS, POOL_LABEL } from "../shared/pool.ts";
import type { PoolId } from "../shared/pool.ts";
import { LAP_OPTIONS, RACE_OPTIONS, RULES, TEAM_COLORS } from "../shared/rules.ts";
import type { Settings } from "../shared/rules.ts";
import type { Action, LobbyView } from "../shared/types.ts";
import { LOCAL_MODE } from "./api.ts";
import { ChatPanel } from "./Chat.tsx";
import { copyText, ManagerName, Panel, Segmented } from "./ui.tsx";

export function LobbyScreen({ view, act }: { view: LobbyView; act: (a: Action) => Promise<string | null> }) {
  const me = view.managers.find((m) => m.isYou)!;
  const isHost = me.isHost;
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = view.settings;
  const set = async (patch: Partial<Settings>) => setError(await act({ type: "settings", settings: patch }));
  const eraLocked = s.pool === "current" || s.pool === "legends";
  const link = `${location.origin}/?join=${view.code}`;
  const empty = Math.max(0, RULES.maxManagers - view.managers.length);
  const waiting = view.managers.filter((m) => !m.isBot && !m.isHost && !m.ready);

  const copy = async (what: "code" | "link") => {
    const ok = await copyText(what === "code" ? view.code : link);
    setCopied(ok ? (what === "code" ? "Code copied" : "Link copied") : `Copy failed. ${what === "code" ? "Code" : "Link"}: ${what === "code" ? view.code : link}`);
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="screen">
      <h1 className="headline headline--sm">Lobby ready.</h1>
      <p className="lede">Invite your friends and choose the player pool.</p>
      <div className="lobby-grid">
        <Panel title="Managers" badge={`${view.managers.length} joined`} className="managers-panel">
          <ul className="mlist" data-testid="managers">
            {view.managers.map((m) => (
              <li key={m.id} className={m.isYou ? "is-you" : undefined}>
                <span className="avatar" style={{ background: m.color }} aria-hidden="true">{m.name[0]?.toUpperCase()}</span>
                <ManagerName m={m} />
                <span className={`status ${!m.connected ? "off" : m.isHost || m.isBot || m.ready ? "on" : "wait"}`} data-testid={`ready-${m.name}`}>
                  {!m.connected ? "Reconnecting" : m.isHost ? "Host" : m.isBot || m.ready ? "Ready" : "Not ready"}
                </span>
                {isHost && m.isBot && (
                  <button type="button" className="linkbtn" onClick={async () => setError(await act({ type: "removeBot", managerId: m.id }))} aria-label={`Remove ${m.name}`}>
                    Remove
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <li key={`e${i}`} className="empty">
                <span className="avatar avatar--empty" aria-hidden="true" />
                <span className="muted">Waiting for manager</span>
              </li>
            ))}
          </ul>
          <div className="colors">
            <div>
              <strong>Your team colour</strong>
              <p className="small muted">Every team must use a different colour.</p>
            </div>
            <div className="colors__row" role="radiogroup" aria-label="Team colour">
              {TEAM_COLORS.map((c) => {
                const taken = view.managers.some((m) => m.color === c && !m.isYou);
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={me.color === c}
                    aria-label={`Colour ${c}${taken ? " (taken)" : ""}`}
                    disabled={taken}
                    className="colordot"
                    style={{ background: c }}
                    onClick={async () => setError(await act({ type: "color", color: c }))}
                  />
                );
              })}
            </div>
          </div>
          <p className="small muted">
            At least {RULES.minManagers} managers are required.{" "}
            {waiting.length > 0 ? `Waiting for ${waiting.map((m) => m.name).join(", ")} to be ready.` : isHost ? "Everyone is ready." : me.ready ? "Waiting for the host to start the auction…" : "Press “I’m ready” when you’re set."}
          </p>
          {error && <p className="ferr" role="alert">{error}</p>}
          <div className="btn-row">
            {isHost ? (
              <button type="button" className="btn btn--primary" disabled={view.managers.length < RULES.minManagers || waiting.length > 0} onClick={async () => setError(await act({ type: "start" }))}>
                Start auction
              </button>
            ) : (
              <button type="button" className={`btn ${me.ready ? "btn--ghost" : "btn--primary"}`} onClick={async () => setError(await act({ type: "lobbyReady", ready: !me.ready }))} data-testid="ready-toggle">
                {me.ready ? "Not ready" : "I’m ready"}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => act({ type: "leave" })}>
              Leave lobby
            </button>
          </div>
          {isHost && view.managers.length < RULES.maxManagers && (
            <button type="button" className="linkbtn add-ai" onClick={async () => setError(await act({ type: "addBot" }))}>
              + Add an AI manager
            </button>
          )}
          {isHost && LOCAL_MODE && view.managers.length < 2 && (
            <p className="small">Add at least one AI manager, then start the auction.</p>
          )}
        </Panel>

        <div className="stack-col">
          <Panel title="Invite managers" sub="Share this code with your friends." className="invite">
            <div className="codebox">
              <span className="codebox__code" data-testid="lobby-code">{hidden ? "•••••" : view.code.split("").join(" ")}</span>
              <button type="button" className="linkbtn" onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show code" : "Hide code"}>
                {hidden ? "Show" : "Hide"}
              </button>
            </div>
            {LOCAL_MODE ? (
              <p className="small muted center">Test version: friends can’t join this lobby. Add AI managers to play, or run the online server to invite friends.</p>
            ) : (
              <>
                <button type="button" className="btn btn--light btn--block" onClick={() => copy("code")}>Copy code</button>
                <button type="button" className="btn btn--light btn--block" onClick={() => copy("link")}>Copy link</button>
                <p className="small muted center" role="status">{copied ?? "Anyone with the code or link can join."}</p>
              </>
            )}
          </Panel>

          <Panel title="Lobby settings" sub="Changes apply to everyone in the lobby." badge="Host only" className="settings">
            <div className="ff">
              <span className="ff__label">Player pool</span>
              <Segmented<PoolId> label="Player pool" columns={2} disabled={!isHost} value={s.pool} onChange={(pool) => set({ pool })} options={(["global", "current", "legends", "custom"] as PoolId[]).map((p) => ({ value: p, label: POOL_LABEL[p] }))} />
              {s.pool === "custom" && (
                <div className="chips">
                  {ALL_TEAMS.map((t) => {
                    const on = s.customTeams.includes(t);
                    return (
                      <button key={t} type="button" className="chip" aria-pressed={on} disabled={!isHost} onClick={() => set({ customTeams: on ? s.customTeams.filter((x) => x !== t) : [...s.customTeams, t] })}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="ff-row">
              <div className="ff">
                <span className="ff__label">Era</span>
                <Segmented label="Era" disabled={!isHost || eraLocked} value={eraLocked ? (s.pool === "legends" ? "alltime" : "current") : s.era} onChange={(era) => set({ era })} options={[{ value: "current", label: "Current" }, { value: "alltime", label: "All-time" }]} />
              </div>
              <div className="ff">
                <span className="ff__label">Auction mode</span>
                <Segmented label="Auction mode" disabled={!isHost} value={s.auctionMode} onChange={(auctionMode) => set({ auctionMode })} options={[{ value: "classic", label: "Classic" }, { value: "blind", label: "Blind" }]} />
              </div>
            </div>
            <div className="ff">
              <span className="ff__label">AI drivers</span>
              <Segmented label="AI difficulty" disabled={!isHost} value={s.aiLevel ?? "normal"} onChange={(aiLevel) => set({ aiLevel })} options={[{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }]} />
            </div>
            <div className="ff">
              <span className="ff__label">Race mode</span>
              <Segmented label="Race mode" disabled={!isHost} value={s.raceMode} onChange={(raceMode) => set({ raceMode })} options={[{ value: "manager", label: "Race Manager" }, { value: "arcade", label: "Arcade Driving" }]} />
            </div>
            <div className="ff-row">
              <div className="ff">
                <span className="ff__label">Laps</span>
                <Segmented label="Laps" disabled={!isHost} value={s.laps} onChange={(laps) => set({ laps })} options={LAP_OPTIONS.map((n) => ({ value: n, label: String(n) }))} />
              </div>
              <div className="ff">
                <span className="ff__label">Races</span>
                <Segmented label="Races" disabled={!isHost} value={s.races} onChange={(races) => set({ races })} options={RACE_OPTIONS.map((n) => ({ value: n, label: String(n) }))} />
              </div>
            </div>
            {s.auctionMode === "blind" && (
              <label className="check">
                <input type="checkbox" checked={s.showTeamOverall} disabled={!isHost} onChange={(e) => set({ showTeamOverall: e.target.checked })} />
                <span>
                  <strong>Show team overall before the races</strong>
                  <span className="small muted"> Individual ratings stay hidden.</span>
                </span>
              </label>
            )}
          </Panel>
          <ChatPanel chat={view.chat} act={act} />
        </div>
      </div>
    </div>
  );
}
