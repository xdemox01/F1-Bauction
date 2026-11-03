import { STRATEGY_INFO } from "../shared/rules.ts";
import type { Action, LobbyView } from "../shared/types.ts";
import { SquadSlots } from "./AuctionScreen.tsx";
import { ManagerName, Swatch } from "./ui.tsx";

export function FinalScreen({ view, act }: { view: LobbyView; act: (a: Action) => Promise<string | null> }) {
  const me = view.managers.find((m) => m.isYou)!;
  const top = view.standings[0];
  const champ = view.managers.find((m) => m.id === top?.managerId);
  const history = view.race?.history ?? [];
  return (
    <div className="screen final">
      <p className="trophy" aria-hidden="true">🏆</p>
      <h1 className="headline headline--sm" data-testid="champion">{champ ? `${champ.isYou ? "You win" : `${champ.name} wins`} the championship.` : "Championship complete."}</h1>
      <div className="final-grid">
        <section className="fp" aria-label="Final table">
          <h2 className="fp__title">Final table</h2>
          <table className="rtable" data-testid="final-table">
            <thead>
              <tr><th>Pos</th><th>Team</th><th className="num">Wins</th><th className="num">Best</th><th className="num">Points</th></tr>
            </thead>
            <tbody>
              {view.standings.map((s, i) => {
                const m = view.managers.find((x) => x.id === s.managerId)!;
                return (
                  <tr key={s.managerId} className={m.isYou ? "is-you" : undefined}>
                    <td>{i + 1}</td>
                    <td><ManagerName m={m} /></td>
                    <td className="num">{s.wins}</td>
                    <td className="num">P{s.best}</td>
                    <td className="num strong">{s.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3 className="mini-title">Race winners</h3>
          <ol className="salelog">
            {history.map((h) => {
              const m = view.managers.find((x) => x.id === h.winnerManagerId);
              return (
                <li key={h.index}>
                  <span>Race {h.index + 1}</span>
                  <span><Swatch color={m?.color ?? "#999"} /> {h.winnerDriver} ({m?.name})</span>
                </li>
              );
            })}
          </ol>
        </section>
        {champ && (
          <section className="fp" aria-label="Winning team">
            <h2 className="fp__title">Winning team</h2>
            <p><ManagerName m={champ} /> · {STRATEGY_INFO[champ.strategy].label} strategy{champ.teamOverall !== null ? ` · team overall ${champ.teamOverall}` : ""}</p>
            <SquadSlots m={champ} />
          </section>
        )}
      </div>
      <div className="btn-row">
        {me.isHost ? (
          <button type="button" className="btn btn--primary btn--big" onClick={() => act({ type: "playAgain" })}>New auction with this lobby</button>
        ) : (
          <p className="waiting">The host can start a new auction with this lobby.</p>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => act({ type: "leave" })}>Leave lobby</button>
      </div>
    </div>
  );
}
