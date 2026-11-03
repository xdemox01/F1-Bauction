import { useCallback, useEffect, useMemo, useState } from "react";

import { requireTemplate } from "../../lib/game/catalogue.ts";
import { cryptoRng } from "../../lib/game/rng.ts";
import { assignFreeAgents, createAuction } from "../engine/auction.ts";
import type { AuctionState } from "../engine/auction.ts";
import { performance, teamIndex } from "../engine/performance.ts";
import { classification, missedStop, RACE_RULES, totalTime } from "../engine/race.ts";
import type { Entry, Race } from "../engine/race.ts";
import { Auction } from "./Auction.tsx";
import { RaceScreen } from "./RaceScreen.tsx";
import { Results } from "./Results.tsx";
import { bestLineup, loadSession, newSession, saveSession, TEAM_COLORS, toTeamItems } from "./session.ts";
import type { ResultRow, Session } from "./session.ts";
import { Team } from "./Team.tsx";
import { Title } from "./Title.tsx";

export function GridApp() {
  const [session, setSession] = useState<Session>(loadSession);
  const [raceKey, setRaceKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => saveSession(session), [session]);
  useEffect(() => {
    (window as unknown as { __grid?: Session }).__grid = session;
  }, [session]);

  const update = useCallback((fn: (s: Session) => Session) => setSession((s) => fn(s)), []);

  const startAuction = (speed: number) => {
    const auction = createAuction(cryptoRng(), { speed });
    update((s) => ({
      ...s,
      phase: "auction",
      auction,
      selection: { driver: null, car: null, pit_crew: null },
      results: null,
      settings: { ...s.settings, auctionSpeed: speed },
      record: { ...s.record, auctions: s.record.auctions + 1 },
    }));
  };

  const onAuctionChange = useCallback((a: AuctionState) => update((s) => ({ ...s, auction: a })), [update]);

  const finishAuction = () =>
    update((s) => {
      const auction = assignFreeAgents(s.auction!);
      const me = auction.bidders.find((b) => b.isPlayer)!;
      return { ...s, auction, phase: "team", selection: bestLineup(me.items) };
    });

  const entries: Entry[] = useMemo(() => {
    if (!session.auction || session.phase !== "race") return [];
    return session.auction.bidders.map((b) => {
      const items = b.isPlayer ? toTeamItems(session.selection)! : toTeamItems(bestLineup(b.items))!;
      return {
        id: b.id,
        name: b.isPlayer ? "You" : b.name,
        color: TEAM_COLORS[b.id],
        isPlayer: b.isPlayer,
        perf: performance(items),
        gridScore: teamIndex(items),
      };
    });
    // raceKey forces fresh entries for "race again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase, session.auction, session.selection, raceKey]);

  const onFinish = useCallback(
    (race: Race) => {
      update((s) => {
        const order = classification(race);
        const rows: ResultRow[] = order.map((car, i) => {
          const b = s.auction!.bidders.find((x) => x.id === car.id)!;
          const lineup = b.isPlayer ? s.selection : bestLineup(b.items);
          return {
            id: car.id,
            name: b.name,
            isPlayer: car.isPlayer,
            driver: requireTemplate(lineup.driver!).name,
            car: requireTemplate(lineup.car!).name,
            crew: requireTemplate(lineup.pit_crew!).name,
            position: i + 1,
            time: car.finished ? totalTime(car) : null,
            penalties: car.penalties,
            missedStop: missedStop(car),
            pitStops: car.pitStops,
            contacts: car.contacts,
            points: car.finished ? (RACE_RULES.points[i] ?? 0) : 0,
          };
        });
        const me = rows.find((r) => r.isPlayer)!;
        return {
          ...s,
          phase: "results",
          results: rows,
          record: {
            ...s.record,
            races: s.record.races + 1,
            wins: s.record.wins + (me.position === 1 ? 1 : 0),
            podiums: s.record.podiums + (me.position <= 3 ? 1 : 0),
            points: s.record.points + me.points,
          },
        };
      });
    },
    [update],
  );

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <button type="button" className="brand brand--button" onClick={() => update((s) => ({ ...s, phase: "title" }))}>
            <span className="brand__mark" aria-hidden="true" />
            Grid Auction
          </button>
          <ol className="phases" aria-label="Game progress">
            {(["auction", "team", "race", "results"] as const).map((p, i) => (
              <li key={p} aria-current={session.phase === p ? "step" : undefined}>
                {i + 1}. {p === "auction" ? "Auction" : p === "team" ? "Team" : p === "race" ? "Race" : "Results"}
              </li>
            ))}
          </ol>
        </div>
      </header>
      <main id="main" className={session.phase === "race" ? "race-main" : "site-main"}>
        {session.phase === "title" && <TitleWrap session={session} onStart={startAuction} />}
        {session.phase === "auction" && session.auction && <Auction auction={session.auction} onChange={onAuctionChange} onDone={finishAuction} />}
        {session.phase === "team" && session.auction && (
          <Team
            session={session}
            auction={session.auction}
            onSelect={(cat, slug) => update((s) => ({ ...s, selection: { ...s.selection, [cat]: slug } }))}
            onSettings={(st) => update((s) => ({ ...s, settings: { ...s.settings, ...st } }))}
            onRace={() => {
              setRaceKey((k) => k + 1);
              update((s) => ({ ...s, phase: "race" }));
            }}
          />
        )}
        {session.phase === "race" && entries.length > 0 && (
          <RaceScreen
            key={raceKey}
            entries={entries}
            laps={session.settings.laps}
            mode={session.settings.mode}
            onFinish={onFinish}
            onQuit={() => update((s) => ({ ...s, phase: "team" }))}
          />
        )}
        {session.phase === "results" && session.results && (
          <Results
            rows={session.results}
            record={session.record}
            onAgain={() => update((s) => ({ ...s, phase: "team" }))}
            onNew={() => startAuction(session.settings.auctionSpeed)}
          />
        )}
      </main>
      {session.phase !== "race" && (
        <footer className="site-footer">
          <p>
            Unofficial fan game, not affiliated with Formula 1. Progress is saved in this browser only.{" "}
            {confirmReset ? (
              <>
                Delete your record and current game?{" "}
                <button type="button" className="linklike" onClick={() => { setSession(newSession()); setConfirmReset(false); }}>Yes, reset</button>{" "}
                <button type="button" className="linklike" onClick={() => setConfirmReset(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="linklike" onClick={() => setConfirmReset(true)}>Reset everything</button>
            )}
          </p>
        </footer>
      )}
    </>
  );

  function TitleWrap({ session: s, onStart }: { session: Session; onStart: (speed: number) => void }) {
    const hasGame = !!s.auction && (s.auction.lotIndex > 0 || s.auction.done || s.results !== null);
    return (
      <Title
        session={s}
        onStart={onStart}
        onContinue={
          hasGame
            ? () =>
                update((x) => ({
                  ...x,
                  phase: x.results ? "results" : x.auction!.done && x.selection.driver ? "team" : "auction",
                }))
            : null
        }
      />
    );
  }
}
