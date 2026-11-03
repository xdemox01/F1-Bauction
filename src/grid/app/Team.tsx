import { CATEGORY_LABELS } from "../../lib/cards/config.ts";
import type { CardCategory } from "../../lib/cards/types.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import { GameCard } from "../../play/shared.tsx";
import { CATEGORIES, categoryOf } from "../engine/auction.ts";
import type { AuctionState } from "../engine/auction.ts";
import { describePerformance, performance, teamIndex } from "../engine/performance.ts";
import type { ControlMode } from "../engine/race.ts";
import { bestLineup, TEAM_COLORS, toTeamItems } from "./session.ts";
import type { Session } from "./session.ts";

export function Team({
  session,
  auction,
  onSelect,
  onSettings,
  onRace,
}: {
  session: Session;
  auction: AuctionState;
  onSelect: (cat: CardCategory, slug: string) => void;
  onSettings: (s: Partial<Session["settings"]>) => void;
  onRace: () => void;
}) {
  const me = auction.bidders.find((b) => b.isPlayer)!;
  const team = toTeamItems(session.selection);
  const perf = team ? performance(team) : null;

  const grid = auction.bidders
    .map((b) => {
      const items = b.isPlayer ? team : toTeamItems(bestLineup(b.items));
      return { b, items, index: items ? teamIndex(items) : 0 };
    })
    .sort((x, y) => y.index - x.index);
  const myGrid = grid.findIndex((g) => g.b.isPlayer) + 1;

  return (
    <div className="stack team-screen">
      <div className="page-head">
        <h1>Build your team</h1>
        <p className="muted">Pick one driver, one car and one pit crew from what you won. Credits left: {me.credits}.</p>
      </div>

      <div className="team-picks">
        {CATEGORIES.map((cat) => {
          const owned = me.items.filter((i) => categoryOf(i.slug) === cat);
          return (
            <section key={cat} className="panel" aria-labelledby={`pick-${cat}`}>
              <h2 id={`pick-${cat}`}>{CATEGORY_LABELS[cat]}</h2>
              <div className="pick-row" role="radiogroup" aria-label={CATEGORY_LABELS[cat]}>
                {owned.map((it) => {
                  const t = requireTemplate(it.slug);
                  const selected = session.selection[cat] === it.slug;
                  return (
                    <button
                      key={it.slug}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`card-button pick${selected ? " is-selected" : ""}`}
                      onClick={() => onSelect(cat, it.slug)}
                      aria-label={`${t.name}, overall ${t.overall}`}
                    >
                      <GameCard card={t} />
                      <span className="pick__price">{it.freeAgent ? "Free agent" : `Bought for ${it.price}`}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="two-col">
        <section className="panel" aria-labelledby="perf-title">
          <h2 id="perf-title">What your team will do on track</h2>
          {perf ? (
            <table className="perf-table" data-testid="perf-table">
              <tbody>
                {describePerformance(perf).map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td className="num strong">{row.value}</td>
                    <td className="muted small">{row.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Choose all three to see your car’s performance.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="grid-title">
          <h2 id="grid-title">Starting grid</h2>
          <p className="small muted">The grid is set by team rating (40% driver, 40% car, 20% crew).</p>
          <ol className="grid-list">
            {grid.map((g) => (
              <li key={g.b.id} className={g.b.isPlayer ? "is-player" : undefined}>
                <span className="swatch" style={{ background: TEAM_COLORS[g.b.id] }} />
                <span className="grid-list__name">{g.b.name}</span>
                <span className="muted small">{g.items ? `${g.items.driver.name} · ${g.items.car.name}` : "Incomplete"}</span>
                <span className="num">{g.index.toFixed(1)}</span>
              </li>
            ))}
          </ol>
          <p>
            You start <strong>P{myGrid}</strong>.
          </p>
        </section>
      </div>

      <section className="panel" aria-labelledby="race-setup">
        <h2 id="race-setup">Race settings</h2>
        <fieldset className="strategy">
          <legend>How do you want to race?</legend>
          {(
            [
              ["drive", "Drive", "You drive the car: steer, accelerate, brake, boost and call your pit stop."],
              ["principal", "Team principal", "Your driver races using their stats. You watch from any camera and call the pace, the boost and the pit stop."],
            ] as [ControlMode, string, string][]
          ).map(([value, label, help]) => (
            <label key={value} className="strategy__option">
              <input type="radio" name="mode" value={value} checked={session.settings.mode === value} onChange={() => onSettings({ mode: value })} />
              <span>
                <strong>{label}</strong> <span className="muted">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field laps">
          <span>Laps</span>
          <select value={session.settings.laps} onChange={(e) => onSettings({ laps: Number(e.target.value) })}>
            {[2, 3, 5].map((n) => <option key={n} value={n}>{n} laps</option>)}
          </select>
        </label>
        <p className="small muted">
          Rules: one pit stop is mandatory (missing it costs 10 s). Running into the back of a car costs a 2 s penalty. Points: 25, 18, 15, 12, 10.
        </p>
        <button type="button" className="button button--primary button--big" disabled={!team} onClick={onRace}>
          Go to the grid
        </button>
      </section>
    </div>
  );
}
