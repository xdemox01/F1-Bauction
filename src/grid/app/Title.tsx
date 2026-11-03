import type { Session } from "./session.ts";

export function Title({ session, onStart, onContinue }: { session: Session; onStart: (speed: number) => void; onContinue: (() => void) | null }) {
  const r = session.record;
  return (
    <div className="title-screen">
      <div className="title-screen__copy">
        <h1 className="title-screen__name">Grid Auction</h1>
        <p className="title-screen__lede">Bid for a driver, a car and a pit crew with 100 credits. Then race them.</p>
        <ol className="loop">
          <li>
            <strong>Auction.</strong> One item at a time against four AI teams. Overspend on a star and you’ll be short for the rest.
          </li>
          <li>
            <strong>Build your team.</strong> Pick your driver, car and pit crew. Their stats set your top speed, grip, tyre wear and pit stops.
          </li>
          <li>
            <strong>Race.</strong> Drive it yourself in 3D, or run the team from the pit wall: call the pace, the boost and the pit stop.
          </li>
        </ol>
        <div className="row">
          {onContinue && (
            <button type="button" className="button button--primary button--big" onClick={onContinue}>
              Continue {session.phase === "auction" ? "the auction" : session.phase === "results" ? "to results" : "to your team"}
            </button>
          )}
          <button type="button" className={`button button--big${onContinue ? "" : " button--primary"}`} onClick={() => onStart(1)}>
            Start a new auction
          </button>
          <button type="button" className="button button--big" onClick={() => onStart(2)}>
            Quick auction (2× speed)
          </button>
        </div>
        {r.races > 0 && (
          <p className="muted">
            Your record: {r.races} races, {r.wins} wins, {r.podiums} podiums, {r.points} points.
          </p>
        )}
      </div>
    </div>
  );
}
