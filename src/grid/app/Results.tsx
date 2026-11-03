import type { ResultRow, Session } from "./session.ts";

const fmt = (t: number | null) => (t === null ? "DNF" : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`);

export function Results({ rows, record, onAgain, onNew }: { rows: ResultRow[]; record: Session["record"]; onAgain: () => void; onNew: () => void }) {
  const me = rows.find((r) => r.isPlayer)!;
  const won = me.position === 1;
  return (
    <div className="stack results">
      <section className={`panel outcome ${won ? "outcome--win" : ""}`} data-testid="results">
        <h1>{won ? "You won the race!" : `You finished P${me.position}`}</h1>
        <p>
          +{me.points} points.
          {me.missedStop && " You missed the mandatory pit stop (+10 s)."}
          {me.penalties > 0 && ` Contact penalties: +${me.penalties} s.`}
        </p>
        <div className="table-wrap">
          <table className="race-table">
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">Team</th>
                <th scope="col">Driver / car / crew</th>
                <th scope="col" className="num">Time</th>
                <th scope="col" className="num">Pit stops</th>
                <th scope="col" className="num">Penalties</th>
                <th scope="col" className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.isPlayer ? "is-player" : undefined}>
                  <td>P{r.position}</td>
                  <th scope="row">{r.isPlayer ? "You" : r.name}</th>
                  <td className="small">
                    {r.driver} / {r.car} / {r.crew}
                  </td>
                  <td className="num">{fmt(r.time)}</td>
                  <td className="num">{r.pitStops.length ? r.pitStops.map((p) => `${p.toFixed(1)} s`).join(", ") : "None"}</td>
                  <td className="num">
                    {r.penalties + (r.missedStop ? 10 : 0) > 0 ? `+${r.penalties + (r.missedStop ? 10 : 0)} s` : "—"}
                  </td>
                  <td className="num strong">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Times include penalties. Contacts: you {me.contacts}.</p>
      </section>
      <section className="panel">
        <h2>Your record</h2>
        <p>
          {record.races} races · {record.wins} wins · {record.podiums} podiums · {record.points} points · {record.auctions} auctions
        </p>
        <div className="row">
          <button type="button" className="button button--primary" onClick={onAgain}>Race again with this team</button>
          <button type="button" className="button" onClick={onNew}>New auction</button>
        </div>
      </section>
    </div>
  );
}
