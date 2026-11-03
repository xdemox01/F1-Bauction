import { useEffect, useState } from "react";

import { STRATEGY_INFO } from "../shared/rules.ts";
import type { Strategy } from "../shared/rules.ts";
import type { Action, LobbyView } from "../shared/types.ts";
import { SquadSlots } from "./AuctionScreen.tsx";
import { ItemCard, ManagerName, Segmented, useCountdown } from "./ui.tsx";

export function LineupScreen({ view, act, serverNow }: { view: LobbyView; act: (a: Action) => Promise<string | null>; serverNow: () => number }) {
  const me = view.managers.find((m) => m.isYou)!;
  const left = useCountdown(view.phaseEndsAt, serverNow, 250);
  const drivers = me.squad.filter((s) => s.item.category === "driver");
  const [picked, setPicked] = useState<string[]>(me.raceDrivers);
  const [strategy, setStrategy] = useState<Strategy>(me.strategy);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPicked(me.raceDrivers), [me.raceDrivers.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: string[], strat: Strategy) => {
    if (next.length !== 2) return;
    setError(await act({ type: "lineup", raceDrivers: next, strategy: strat }));
  };
  const toggle = (id: string) => {
    if (me.lineupConfirmed) return;
    let next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    if (next.length > 2) next = next.slice(1);
    setPicked(next);
    void save(next, strategy);
  };
  const others = view.managers.filter((m) => !m.isYou);

  return (
    <div className="screen">
      <div className="phase-head">
        <div>
          <h1 className="headline headline--sm">Shape your team.</h1>
          <p className="lede">Pick your two race drivers and a race strategy. Your third driver is the reserve.</p>
        </div>
        <p className="phase-timer" data-testid="phase-timer">{left !== null ? `${Math.ceil(left / 1000)} s` : ""}</p>
      </div>
      <div className="lineup-grid">
        <section className="fp" aria-label="Race drivers">
          <h2 className="fp__title">Race drivers ({picked.length}/2)</h2>
          {picked.length < 2 && !me.lineupConfirmed && <p className="small muted">Pick one more driver. Until then your last complete pair is kept.</p>}
          <div className="driver-pick" role="group" aria-label="Choose two race drivers">
            {drivers.map((d) => {
              const on = picked.includes(d.item.id);
              return (
                <button key={d.item.id} type="button" className={`pick-btn${on ? " is-on" : ""}`} aria-pressed={on} disabled={me.lineupConfirmed} onClick={() => toggle(d.item.id)}>
                  <ItemCard item={d.item} size="md" />
                  <span className="pick-btn__label">{on ? `Race driver ${picked.indexOf(d.item.id) + 1}` : "Reserve"}</span>
                </button>
              );
            })}
          </div>
          <h2 className="fp__title">Race strategy</h2>
          <Segmented<Strategy>
            label="Race strategy"
            disabled={me.lineupConfirmed}
            value={strategy}
            onChange={(s) => {
              setStrategy(s);
              // Save the strategy even while the driver choice is incomplete (keep the last valid pair).
              void save(picked.length === 2 ? picked : me.raceDrivers, s);
            }}
            options={(Object.keys(STRATEGY_INFO) as Strategy[]).map((s) => ({ value: s, label: STRATEGY_INFO[s].label }))}
          />
          <p className="small muted">{STRATEGY_INFO[strategy].help}</p>
          {error && <p className="ferr" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--big" disabled={me.lineupConfirmed || picked.length !== 2} onClick={async () => setError(await act({ type: "confirmLineup" }))}>
            {me.lineupConfirmed ? "Lineup locked" : "Confirm lineup"}
          </button>
        </section>
        <section className="fp" aria-label="Your squad">
          <h2 className="fp__title">Your squad</h2>
          <SquadSlots m={me} />
          {me.teamOverall !== null && <p className="team-ovr">Team overall <strong>{me.teamOverall}</strong></p>}
          <h2 className="fp__title">Other managers</h2>
          <ul className="mrows">
            {others.map((m) => (
              <li key={m.id}>
                <ManagerName m={m} />
                <span className={m.lineupConfirmed ? "st-in" : "muted"}>{m.lineupConfirmed ? "Locked" : "Choosing…"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function ReviewScreen({ view, act, serverNow }: { view: LobbyView; act: (a: Action) => Promise<string | null>; serverNow: () => number }) {
  const me = view.managers.find((m) => m.isYou)!;
  const left = useCountdown(view.phaseEndsAt, serverNow, 250);
  return (
    <div className="screen">
      <div className="phase-head">
        <div>
          <h1 className="headline headline--sm">Check the lineups.</h1>
          <p className="lede">The championship starts when everyone is ready, or when the countdown reaches zero.</p>
        </div>
        <div className="ready-box">
          <p className="phase-timer" data-testid="phase-timer">Starting in {left !== null ? Math.ceil(left / 1000) : "–"} s</p>
          <button type="button" className="btn btn--primary btn--big" disabled={me.ready} onClick={() => act({ type: "ready" })}>
            {me.ready ? "Ready ✓" : "I’m ready"}
          </button>
        </div>
      </div>
      <div className="review-grid">
        {view.managers.map((m) => {
          const drivers = m.squad.filter((s) => s.item.category === "driver");
          const one = (c: string) => m.squad.find((s) => s.item.category === c)?.item.name ?? "—";
          return (
            <section key={m.id} className={`fp team-card${m.isYou ? " is-you" : ""}`} style={{ borderTopColor: m.color }} aria-label={`${m.name}'s team`}>
              <header className="team-card__head">
                <ManagerName m={m} />
                {m.teamOverall !== null && <span className="team-card__ovr">{m.teamOverall}</span>}
              </header>
              <dl className="team-card__list">
                {drivers.map((d) => (
                  <div key={d.item.id}>
                    <dt>{m.raceDrivers.includes(d.item.id) ? "Race driver" : "Reserve"}</dt>
                    <dd>{d.item.name}</dd>
                  </div>
                ))}
                <div><dt>Car</dt><dd>{one("car")}</dd></div>
                <div><dt>Pit crew</dt><dd>{one("crew")}</dd></div>
                <div><dt>Team principal</dt><dd>{one("principal")}</dd></div>
                <div><dt>Strategy</dt><dd>{STRATEGY_INFO[m.strategy].label}</dd></div>
              </dl>
              <p className={m.ready ? "st-in" : "muted"}>{m.ready ? "Ready" : "Not ready"}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
