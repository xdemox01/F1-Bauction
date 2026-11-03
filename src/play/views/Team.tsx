import { useRef, useState } from "react";

import { CATEGORY_LABELS } from "../../lib/cards/config.ts";
import { CARD_CATEGORIES } from "../../lib/cards/types.ts";
import type { CardCategory } from "../../lib/cards/types.ts";
import { quickRaceRewardsLeft, teamCards } from "../../lib/game/actions.ts";
import type { Action, ActionResult } from "../../lib/game/actions.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import { QUICK_RACE, STRATEGIES, STRATEGY_RULES, TEAM_WEIGHTS } from "../../lib/game/config.ts";
import type { Strategy } from "../../lib/game/config.ts";
import { teamScore } from "../../lib/game/race.ts";
import type { EntrantResult } from "../../lib/game/race.ts";
import type { GameState, MatchRecord } from "../../lib/game/state.ts";
import { ErrorLine, GameCard, RaceTable } from "../shared.tsx";

export function Team({ state, dispatch }: { state: GameState; dispatch: (a: Action) => ActionResult }) {
  const [slot, setSlot] = useState<CardCategory>("driver");
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [last, setLast] = useState<{ race: EntrantResult[]; match: MatchRecord } | null>(null);
  const [cooling, setCooling] = useState(false);
  const busy = useRef(false);

  const team = teamCards(state);
  const score = team ? teamScore(team) : null;
  const options = state.cards
    .filter((c) => requireTemplate(c.slug).category === slot)
    .sort((a, b) => requireTemplate(b.slug).overall - requireTemplate(a.slug).overall);
  const rewardsLeft = quickRaceRewardsLeft(state, new Date());

  const choose = (instanceId: string | null) => {
    const r = dispatch({ type: "team/set", category: slot, instanceId });
    setError(r.ok ? null : r.error);
  };

  // A short cooldown stops a double click from starting two races.
  const race = () => {
    if (busy.current) return;
    busy.current = true;
    setCooling(true);
    setTimeout(() => {
      busy.current = false;
      setCooling(false);
    }, 800);
    const r = dispatch({ type: "quickRace/run", strategy, requestId: crypto.randomUUID() });
    if (!r.ok) return setError(r.error);
    setError(null);
    if (r.race && r.match) setLast({ race: r.race, match: r.match });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Team builder</h1>
        <p className="muted">Pick one driver, one car and one pit crew from cards you own.</p>
      </div>
      <ErrorLine error={error} />

      <div className="team-slots">
        {CARD_CATEGORIES.map((cat) => {
          const card = team?.[cat] ?? (state.team[cat] ? requireTemplate(state.cards.find((c) => c.id === state.team[cat])!.slug) : null);
          return (
            <button
              key={cat}
              type="button"
              className="team-slot"
              aria-pressed={slot === cat}
              onClick={() => setSlot(cat)}
            >
              <span className="team-slot__label">{CATEGORY_LABELS[cat]}</span>
              {card ? <GameCard card={card} /> : <span className="team-slot__empty">Empty, choose a card</span>}
            </button>
          );
        })}
      </div>

      <section className="panel">
        <h2>Team score</h2>
        {score ? (
          <p className="formula">
            {CATEGORY_LABELS.driver} {score.driver.toFixed(2)} × {TEAM_WEIGHTS.driver / 100}% + {CATEGORY_LABELS.car} {score.car.toFixed(2)} ×{" "}
            {TEAM_WEIGHTS.car / 100}% + {CATEGORY_LABELS.pit_crew} {score.pit_crew.toFixed(2)} × {TEAM_WEIGHTS.pit_crew / 100}% ={" "}
            <strong className="big-num" data-testid="team-score">{score.total.toFixed(2)}</strong>
          </p>
        ) : (
          <p className="muted">Fill all three slots to get a team score.</p>
        )}
        <p className="muted small">Card scores here are for dry conditions. In a race, wet or high-tyre-wear conditions change the attribute weights.</p>
      </section>

      <section className="panel" aria-labelledby="choose-title">
        <h2 id="choose-title">Choose your {CATEGORY_LABELS[slot].toLowerCase()}</h2>
        {options.length === 0 ? (
          <p className="muted">You don’t own any {CATEGORY_LABELS[slot].toLowerCase()} cards. Open a pack to get some.</p>
        ) : (
          <ul className="card-grid card-grid--compact" role="radiogroup" aria-label={`Owned ${CATEGORY_LABELS[slot]} cards`}>
            {options.map((c) => {
              const t = requireTemplate(c.slug);
              const selected = state.team[slot] === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`card-button${selected ? " is-selected" : ""}`}
                    onClick={() => choose(c.id)}
                    aria-label={`${t.name}, overall ${t.overall}${selected ? ", selected" : ""}`}
                  >
                    <GameCard card={t} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {state.team[slot] && (
          <button type="button" className="button" onClick={() => choose(null)}>
            Remove {CATEGORY_LABELS[slot].toLowerCase()} from team
          </button>
        )}
      </section>

      <section className="panel" aria-labelledby="quick-title">
        <h2 id="quick-title">Quick race</h2>
        <p>
          Race this team against three AI teams in random conditions. Free to enter. Prize coins ({QUICK_RACE.coinRewards.join(" / ")} for P1–P4) are
          paid for your first {QUICK_RACE.rewardedRacesPerDay} races each day; {rewardsLeft} left today.
        </p>
        <fieldset className="strategy">
          <legend>Strategy</legend>
          {STRATEGIES.map((s) => (
            <label key={s} className="strategy__option">
              <input type="radio" name="qr-strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} />
              <span>
                <strong>{STRATEGY_RULES[s].label}</strong> <span className="muted">{STRATEGY_RULES[s].summary}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="button button--primary" disabled={!team || cooling} onClick={race}>
          {last ? "Race again" : "Start quick race"}
        </button>
        {!team && <p className="muted small">Fill all three slots first.</p>}
        {last && (
          <div className="result" data-testid="quick-result">
            <h3>
              {last.match.retired ? "You retired" : `You finished P${last.match.position}`}
              {last.match.coins > 0 ? `, +${last.match.coins} coins` : ""}
            </h3>
            <RaceTable result={last.race} conditions={last.match.conditions} />
          </div>
        )}
      </section>
    </div>
  );
}
