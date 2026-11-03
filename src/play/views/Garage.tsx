import { CATEGORY_LABELS } from "../../lib/cards/config.ts";
import { teamCards } from "../../lib/game/actions.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import { teamScore } from "../../lib/game/race.ts";
import type { GameState } from "../../lib/game/state.ts";
import { coinsLabel } from "../shared.tsx";

export function Garage({ state }: { state: GameState }) {
  const team = teamCards(state);
  const score = team ? teamScore(team) : null;
  const run = state.randoms.active;
  const recent = [...state.transactions].reverse().slice(0, 6);
  const matches = [...state.matches].reverse().slice(0, 5);

  return (
    <div className="stack">
      <section className="panel garage-hero">
        <div>
          <h1>Your garage</h1>
          <p className="muted">
            {state.cards.length} cards owned · {coinsLabel(state.coins)}
          </p>
        </div>
        <div className="garage-hero__actions">
          {run && !run.completed ? (
            <a className="button button--primary" href="#/randoms">Continue your Randoms run</a>
          ) : (
            <a className="button button--primary" href="#/randoms">Play Randoms</a>
          )}
          <a className="button" href="#/packs">Open a pack</a>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Team</h2>
          {team && score ? (
            <>
              <ul className="team-lines">
                {(["driver", "car", "pit_crew"] as const).map((c) => (
                  <li key={c}>
                    <span className="muted">{CATEGORY_LABELS[c]}</span>
                    <span>{team[c].name}</span>
                    <span className="num">{team[c].overall}</span>
                  </li>
                ))}
              </ul>
              <p>
                Team score <strong className="big-num">{score.total.toFixed(2)}</strong>
              </p>
            </>
          ) : (
            <p className="muted">Your team is incomplete. Pick one driver, one car and one pit crew.</p>
          )}
          <a className="button" href="#/team">Edit team</a>
        </section>

        <section className="panel">
          <h2>Recent results</h2>
          {matches.length === 0 ? (
            <p className="muted">No races yet. Play Randoms or a quick race to get started.</p>
          ) : (
            <ul className="history">
              {matches.map((m) => (
                <li key={m.id}>
                  <span>{m.mode === "randoms" ? "Randoms" : "Quick race"}</span>
                  <span>{m.retired ? "Retired" : `P${m.position}`}</span>
                  <span className="muted">
                    {m.coins > 0 ? `+${m.coins} coins` : "no coins"}
                    {m.keptSlug ? `, kept ${requireTemplate(m.keptSlug).name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Coin history</h2>
        <ul className="history">
          {recent.map((t) => (
            <li key={t.id}>
              <span>{t.note}</span>
              <span className={t.amount < 0 ? "debit" : "credit"}>{t.amount > 0 ? `+${t.amount}` : t.amount}</span>
              <span className="muted">balance {t.balanceAfter}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
