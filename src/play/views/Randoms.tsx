import { useEffect, useRef, useState } from "react";

import { CATEGORY_LABELS } from "../../lib/cards/config.ts";
import { randomsEntryCost, secondsLeftInPick } from "../../lib/game/actions.ts";
import type { Action, ActionResult } from "../../lib/game/actions.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import { CONDITION_LABELS, RANDOMS, STRATEGIES, STRATEGY_RULES } from "../../lib/game/config.ts";
import type { Strategy } from "../../lib/game/config.ts";
import { retirementChance, teamScore } from "../../lib/game/race.ts";
import type { GameState, RandomsRun } from "../../lib/game/state.ts";
import { coinsLabel, ErrorLine, GameCard, RaceTable } from "../shared.tsx";

type Dispatch = (a: Action) => ActionResult;

export function Randoms({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const [error, setError] = useState<string | null>(null);
  const run = state.randoms.active;
  const act = (a: Action) => {
    const r = dispatch(a);
    setError(r.ok ? null : r.error);
    return r;
  };

  return (
    <div className="stack randoms">
      <div className="page-head">
        <h1>Randoms</h1>
        <p className="muted">Balance: {coinsLabel(state.coins)}</p>
      </div>
      <ErrorLine error={error} />
      {!run && <Lobby state={state} act={act} />}
      {run?.phase === "draft" && <Draft run={run} act={act} />}
      {run?.phase === "strategy" && <StrategyStep run={run} act={act} />}
      {run?.phase === "finished" && <Finished run={run} act={act} />}
    </div>
  );
}

function Lobby({ state, act }: { state: GameState; act: Dispatch }) {
  const cost = randomsEntryCost(state, new Date());
  const intent = useRef<string | null>(null);
  const short = state.coins < cost;
  const recent = state.matches.filter((m) => m.mode === "randoms").reverse().slice(0, 5);

  const start = () => {
    intent.current ??= crypto.randomUUID(); // reused if the click is repeated before the screen changes
    act({ type: "randoms/start", requestId: intent.current });
  };

  return (
    <>
      <section className="panel">
        <h2>How a run works</h2>
        <ol className="rules">
          <li>Three draft rounds: car, then driver, then pit crew. Each round shows {RANDOMS.optionsPerRound} random cards. Pick one within {RANDOMS.secondsPerPick} seconds, or the highest-rated card is picked for you.</li>
          <li>After the draft you see the race conditions and choose a strategy.</li>
          <li>Your team races three AI teams. Race score = team score + strategy pace + random variation. Retiring puts you last.</li>
          <li>Rewards: {RANDOMS.coinRewards.map((c, i) => `P${i + 1} ${c}`).join(", ")} coins. A win also lets you keep one of your drafted cards. Otherwise drafted cards are returned.</li>
        </ol>
        <p>
          Entry: <strong>{cost === 0 ? "free (your first run today)" : coinsLabel(cost)}</strong>
        </p>
        <button type="button" className="button button--primary button--big" disabled={short} onClick={start}>
          {cost === 0 ? "Start a free run" : `Start run for ${cost} coins`}
        </button>
        {short && <p className="muted small">You need {cost - state.coins} more coins. Quick races in the team builder pay coins.</p>}
      </section>
      {recent.length > 0 && (
        <section className="panel">
          <h2>Your recent runs</h2>
          <ul className="history">
            {recent.map((m) => (
              <li key={m.id}>
                <span>{m.retired ? "Retired" : `P${m.position}`}</span>
                <span className="muted">{CONDITION_LABELS[m.conditions].label}</span>
                <span>{m.coins > 0 ? `+${m.coins} coins` : "no coins"}{m.keptSlug ? `, kept ${requireTemplate(m.keptSlug).name}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Draft({ run, act }: { run: RandomsRun; act: Dispatch }) {
  const now = useNow(250);
  const round = run.picks.length;
  const offer = run.offers[round];
  const left = secondsLeftInPick(run, now);
  const autoPicked = useRef(-1);

  useEffect(() => {
    if (left === 0 && autoPicked.current !== round) {
      autoPicked.current = round;
      act({ type: "randoms/autoPick" });
    }
  }, [left, round, act]);

  return (
    <>
      <section className="panel draft">
        <div className="draft__head">
          <h2>
            Round {round + 1} of {run.offers.length}: choose your {CATEGORY_LABELS[offer.category].toLowerCase()}
          </h2>
          <p className={`timer${left <= 5 ? " timer--low" : ""}`} aria-live={left <= 5 ? "assertive" : "off"}>
            <span className="visually-hidden">Time left: </span>
            {left}s
          </p>
        </div>
        <ul className="card-grid card-grid--draft">
          {offer.options.map((slug) => {
            const t = requireTemplate(slug);
            return (
              <li key={slug}>
                <button type="button" className="card-button" onClick={() => act({ type: "randoms/pick", slug, round })} aria-label={`Pick ${t.name}, overall ${t.overall}`}>
                  <GameCard card={t} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <DraftedSoFar run={run} />
      <AbandonButton act={act} entryCost={run.entryCost} />
    </>
  );
}

function DraftedSoFar({ run }: { run: RandomsRun }) {
  return (
    <section className="panel">
      <h2>Your draft</h2>
      <ul className="drafted">
        {run.offers.map((o, i) => (
          <li key={o.category}>
            <span className="muted">{CATEGORY_LABELS[o.category]}</span>
            <span>{run.picks[i] ? `${requireTemplate(run.picks[i]).name} (${requireTemplate(run.picks[i]).overall})` : "Not picked yet"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AbandonButton({ act, entryCost }: { act: Dispatch; entryCost: number }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="button button--quiet" onClick={() => setConfirming(true)}>
        Abandon run
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label="Confirm abandon">
      <p>Abandon this run? {entryCost > 0 ? `Your ${entryCost}-coin entry fee isn’t refunded.` : "It still counts as today’s free run."}</p>
      <button type="button" className="button" onClick={() => act({ type: "randoms/abandon" })}>Yes, abandon</button>
      <button type="button" className="button button--quiet" onClick={() => setConfirming(false)}>Keep playing</button>
    </div>
  );
}

function draftedTeam(run: RandomsRun) {
  const of = (cat: "driver" | "car" | "pit_crew") => requireTemplate(run.picks[run.offers.findIndex((o) => o.category === cat)]);
  return { driver: of("driver"), car: of("car"), pit_crew: of("pit_crew") };
}

function StrategyStep({ run, act }: { run: RandomsRun; act: Dispatch }) {
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const team = draftedTeam(run);
  const score = teamScore(team, run.conditions);
  const busy = useRef(false);

  const go = () => {
    if (busy.current) return;
    busy.current = true;
    const r = act({ type: "randoms/race", strategy });
    if (!r.ok) busy.current = false; // on success this screen is replaced by the result
  };

  return (
    <>
      <section className="panel">
        <h2>Race conditions: {CONDITION_LABELS[run.conditions].label}</h2>
        <p>{CONDITION_LABELS[run.conditions].effect}</p>
        <div className="drafted-cards">
          {(["car", "driver", "pit_crew"] as const).map((c) => (
            <div key={c}>
              <GameCard card={team[c]} />
              <p className="small muted">In these conditions: {score[c].toFixed(2)}</p>
            </div>
          ))}
        </div>
        <p>
          Team score in these conditions: <strong className="big-num" data-testid="randoms-team-score">{score.total.toFixed(2)}</strong>
        </p>
      </section>
      <section className="panel">
        <fieldset className="strategy">
          <legend>Choose a strategy</legend>
          {STRATEGIES.map((s) => (
            <label key={s} className="strategy__option">
              <input type="radio" name="randoms-strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} />
              <span>
                <strong>{STRATEGY_RULES[s].label}</strong> <span className="muted">{STRATEGY_RULES[s].summary}</span>{" "}
                <span className="small muted">Retirement chance for your team: {(retirementChance(team, s) * 100).toFixed(1)}%</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="button button--primary button--big" onClick={go}>
          Start the race
        </button>
      </section>
      <AbandonButton act={act} entryCost={run.entryCost} />
    </>
  );
}

function Finished({ run, act }: { run: RandomsRun; act: Dispatch }) {
  const me = run.result!.find((r) => r.isPlayer)!;
  const won = me.position === 1 && !me.retired;
  const mustChoose = won && !run.completed;

  return (
    <>
      <section className={`panel outcome ${won ? "outcome--win" : "outcome--loss"}`} data-testid="randoms-outcome">
        <h2>{won ? "You won!" : me.retired ? "You retired" : `You finished P${me.position}`}</h2>
        <p>
          {run.coinsAwarded > 0 ? `+${run.coinsAwarded} coins added to your balance.` : "No coins this time."}
          {run.keptSlug && ` ${requireTemplate(run.keptSlug).name} has been added to your collection.`}
        </p>
        <RaceTable result={run.result!} conditions={run.conditions} />
      </section>

      {mustChoose && (
        <section className="panel" aria-labelledby="keep-title">
          <h2 id="keep-title">Choose one drafted card to keep</h2>
          <ul className="card-grid card-grid--draft">
            {run.picks.map((slug) => {
              const t = requireTemplate(slug);
              return (
                <li key={slug}>
                  <button type="button" className="card-button" onClick={() => !run.keptSlug && act({ type: "randoms/keep", slug })} aria-label={`Keep ${t.name}`}>
                    <GameCard card={t} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!mustChoose && (
        <div className="row">
          <button type="button" className="button button--primary" onClick={() => act({ type: "randoms/close" })}>
            Back to Randoms
          </button>
          <a className="button" href="#/collection">View collection</a>
        </div>
      )}
    </>
  );
}
