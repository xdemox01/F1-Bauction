import { useState } from "react";
import type { FormEvent } from "react";

import { ALL_TEAMS, POOL_LABEL } from "../shared/pool.ts";
import type { PoolId } from "../shared/pool.ts";
import { DEFAULT_SETTINGS, LAP_OPTIONS, RACE_OPTIONS, RULES } from "../shared/rules.ts";
import type { Settings } from "../shared/rules.ts";
import { createLobby, joinLobby, LOCAL_MODE, sendAction } from "./api.ts";
import type { SessionInfo } from "./api.ts";
import { Segmented } from "./ui.tsx";

const IconCreate = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="9" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5" />
  </svg>
);
const IconJoin = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 4h5v16h-5M10 8l4 4-4 4M14 12H3" />
  </svg>
);

function NameField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className="ff" htmlFor={id}>
      <span className="ff__label">
        Manager name <span className="ff__count">{value.length}/{RULES.nameMax}</span>
      </span>
      <input id={id} value={value} maxLength={RULES.nameMax} placeholder="Enter your name here" autoComplete="nickname" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Landing({ onSession, inviteCode, onClearInvite }: { onSession: (s: SessionInfo) => void; inviteCode: string | null; onClearInvite: () => void }) {
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [code, setCode] = useState(inviteCode ?? "");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const eraLocked = settings.pool === "current" || settings.pool === "legends";

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return setCreateError("Enter a manager name.");
    if (settings.pool === "custom" && settings.customTeams.length === 0) return setCreateError("Pick at least one team for a custom pool.");
    setBusy("create");
    setCreateError(null);
    try {
      onSession(await createLobby(createName, settings));
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // Singleplayer: a lobby with 3 AI managers that starts straight away.
  const onSolo = async () => {
    if (!createName.trim()) return setCreateError("Enter a manager name.");
    if (settings.pool === "custom" && settings.customTeams.length === 0) return setCreateError("Pick at least one team for a custom pool.");
    setBusy("create");
    setCreateError(null);
    try {
      const s = await createLobby(createName, settings);
      for (let i = 0; i < 3; i++) await sendAction(s, { type: "addBot" });
      await sendAction(s, { type: "start" });
      onSession(s);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinName.trim()) return setJoinError("Enter a manager name.");
    if (!/^[A-Za-z0-9]{5}$/.test(code.trim())) return setJoinError("Lobby codes are 5 characters.");
    setBusy("join");
    setJoinError(null);
    try {
      onSession(await joinLobby(code.trim(), joinName));
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const joinCard = (
    <section className="fp fp--join" aria-labelledby="join-title">
      <header className="fp__head">
        <span className="fp__icon" aria-hidden="true"><IconJoin /></span>
        <div>
          <h2 className="fp__title" id="join-title">Join a lobby</h2>
          <p className="fp__sub">{inviteCode ? `You’ve been invited to lobby ${inviteCode}.` : "Enter the code shared by the host."}</p>
        </div>
      </header>
      <form onSubmit={onJoin} className="fstack">
        <NameField id="join-name" value={joinName} onChange={setJoinName} />
        <label className="ff" htmlFor="join-code">
          <span className="ff__label">Lobby code</span>
          <input
            id="join-code"
            className="code-input"
            value={code}
            maxLength={5}
            placeholder="Type code here"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
        </label>
        {joinError && <p className="ferr" role="alert">{joinError}</p>}
        <button type="submit" className="btn btn--light btn--block" disabled={busy !== null || LOCAL_MODE}>
          {busy === "join" ? "Joining…" : "Join lobby"}
        </button>
        {LOCAL_MODE && <p className="small muted">Not available in the test version: joining needs the online game server.</p>}
      </form>
      {inviteCode && (
        <button type="button" className="linkbtn" onClick={onClearInvite}>
          ← Back to home
        </button>
      )}
    </section>
  );

  if (inviteCode) {
    return (
      <div className="landing landing--invite">
        <h1 className="headline">Join a lobby</h1>
        <p className="lede">Choose your manager name to take your seat.</p>
        <div className="invite-wrap">{joinCard}</div>
      </div>
    );
  }

  return (
    <div className="landing">
      <nav className="subnav" aria-label="Page">
        <a href="#play" aria-current="true">Play</a>
        <a href="#how">How it works</a>
      </nav>
      <h1 className="headline">
        Build your grid.
        <br />
        Beat your rivals.
      </h1>
      <p className="lede">100 credits. A racing team. One auction. Then take it to the track.</p>
      {LOCAL_MODE && (
        <p className="test-note" role="note">
          <strong>Test version.</strong> The whole game runs in this page: create a lobby, add AI managers and play. Joining friends by code needs the online
          game server (run <code>Start Grid Auction</code> from the project folder).
        </p>
      )}

      <div className="landing__grid" id="play">
        <section className="fp fp--create" aria-labelledby="create-title">
          <header className="fp__head">
            <span className="fp__icon" aria-hidden="true"><IconCreate /></span>
            <div>
              <h2 className="fp__title" id="create-title">Create a lobby</h2>
              <p className="fp__sub">Choose your settings and invite your friends.</p>
            </div>
          </header>
          <form onSubmit={onCreate} className="fstack">
            <NameField id="create-name" value={createName} onChange={setCreateName} />
            <div className="ff">
              <span className="ff__label">Player pool</span>
              <Segmented<PoolId>
                label="Player pool"
                columns={4}
                value={settings.pool}
                onChange={(pool) => set({ pool })}
                options={(["global", "current", "legends", "custom"] as PoolId[]).map((p) => ({ value: p, label: POOL_LABEL[p] }))}
              />
              {settings.pool === "custom" && (
                <div className="chips" role="group" aria-label="Teams in the custom pool">
                  {ALL_TEAMS.map((t) => {
                    const on = settings.customTeams.includes(t);
                    return (
                      <button
                        type="button"
                        key={t}
                        className="chip"
                        aria-pressed={on}
                        onClick={() => set({ customTeams: on ? settings.customTeams.filter((x) => x !== t) : [...settings.customTeams, t] })}
                      >
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
                <Segmented
                  label="Era"
                  disabled={eraLocked}
                  value={eraLocked ? (settings.pool === "legends" ? "alltime" : "current") : settings.era}
                  onChange={(era) => set({ era })}
                  options={[
                    { value: "current", label: "Current drivers" },
                    { value: "alltime", label: "All-Time Legends" },
                  ]}
                />
                <span className="ff__help">{eraLocked ? `Set by the ${POOL_LABEL[settings.pool]} pool.` : "All-time adds retired drivers, classic cars, crews and principals."}</span>
              </div>
              <div className="ff">
                <span className="ff__label">Auction mode</span>
                <Segmented label="Auction mode" value={settings.auctionMode} onChange={(auctionMode) => set({ auctionMode })} options={[{ value: "classic", label: "Classic" }, { value: "blind", label: "Blind" }]} />
                <span className="ff__help">Blind hides every rating during the auction.</span>
              </div>
            </div>
            <div className="ff-row">
              <div className="ff">
                <span className="ff__label">Race mode</span>
                <Segmented label="Race mode" value={settings.raceMode} onChange={(raceMode) => set({ raceMode })} options={[{ value: "manager", label: "Race Manager" }, { value: "arcade", label: "Arcade Driving" }]} />
                <span className="ff__help">{settings.raceMode === "manager" ? "Both your drivers race; you call pace, boost and pit stops live." : "You drive your lead driver yourself, against everyone else."}</span>
              </div>
              <div className="ff">
                <span className="ff__label">Number of laps</span>
                <Segmented label="Number of laps" value={settings.laps} onChange={(laps) => set({ laps })} options={LAP_OPTIONS.map((n) => ({ value: n, label: `${n} laps` }))} />
                <span className="ff__label ff__label--sub">Races in the championship</span>
                <Segmented label="Races in the championship" value={settings.races} onChange={(races) => set({ races })} options={RACE_OPTIONS.map((n) => ({ value: n, label: `${n}` }))} />
              </div>
            </div>
            {createError && <p className="ferr" role="alert">{createError}</p>}
            <button type="submit" className="btn btn--primary btn--block btn--big" disabled={busy !== null}>
              {busy === "create" ? "Creating…" : "Create lobby"}
            </button>
            <button type="button" className="btn btn--ghost btn--block btn--big" disabled={busy !== null} onClick={onSolo}>
              Play singleplayer vs 3 AI
            </button>
          </form>
        </section>
        <div className="landing__side">
          {joinCard}
          <ul className="trust" aria-label="About this game">
            <li>Free to play</li>
            <li>No download required</li>
            <li>No sign up required</li>
          </ul>
        </div>
      </div>

      <section className="how" id="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">Build a team. Then race it.</h2>
        <ol className="steps">
          <li>
            <span className="steps__n">01</span>
            <h3>Win your team</h3>
            <p>Bid against your friends as drivers, cars, pit crews and team principals come up one by one. 100 credits for six slots.</p>
          </li>
          <li>
            <span className="steps__n">02</span>
            <h3>Pick your race drivers</h3>
            <p>Choose two of your three drivers to race and set a strategy: Balanced, Aggressive or Conservative.</p>
          </li>
          <li>
            <span className="steps__n">03</span>
            <h3>Take it to the track</h3>
            <p>A championship of 3D races. Manage your cars from the pit wall, or drive yourself in Arcade mode.</p>
          </li>
        </ol>
        <div className="hood">
          <h2 className="section-title">Overall is only the headline</h2>
          <p>
            Races don’t compare overall ratings. Every attribute does a job on track: driver pace and car aero set cornering grip, straight-line speed sets top speed,
            tyre management sets wear, the pit crew sets stop times and the team principal improves strategy, consistency and development. Better teams have the
            edge, never a guarantee.
          </p>
          <p className="small muted">
            Independent fan game with original rules. Not affiliated with Formula 1, the FIA, any team, or FootbAuction. Names are used for identification; all
            ratings are subjective game estimates, and academy and privateer entries are fictional.
          </p>
        </div>
      </section>
    </div>
  );
}
