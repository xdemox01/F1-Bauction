import { useCallback, useEffect, useState } from "react";

import type { Action } from "../shared/types.ts";
import { savedSession, saveSession, sendAction, useLobbyStream } from "./api.ts";
import type { SessionInfo } from "./api.ts";
import { AuctionScreen } from "./AuctionScreen.tsx";
import { FinalScreen } from "./FinalScreen.tsx";
import { Landing } from "./Landing.tsx";
import { LineupScreen, ReviewScreen } from "./LineupScreens.tsx";
import { LobbyScreen } from "./LobbyScreen.tsx";
import { RaceMP } from "./RaceMP.tsx";

function inviteFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get("join");
  return c && /^[A-Za-z0-9]{5}$/.test(c) ? c.toUpperCase() : null;
}

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(() => {
    const s = savedSession();
    const invite = inviteFromUrl();
    // An invite to a different lobby wins over an old saved seat.
    return s && (!invite || invite === s.code) ? s : null;
  });
  const [invite, setInvite] = useState<string | null>(inviteFromUrl);
  const [notice, setNotice] = useState<string | null>(null);

  const leave = useCallback((msg?: string) => {
    saveSession(null);
    setSession(null);
    setInvite(null);
    history.replaceState(null, "", "/");
    if (msg) setNotice(msg);
  }, []);

  const { view, status, frame, serverNow } = useLobbyStream(session, () => leave("That lobby no longer exists."));

  const onSession = (s: SessionInfo) => {
    saveSession(s);
    setSession(s);
    setNotice(null);
    history.replaceState(null, "", "/");
    setInvite(null);
  };

  const act = useCallback(
    async (a: Action): Promise<string | null> => {
      if (!session) return "Not connected.";
      try {
        await sendAction(session, a);
        if (a.type === "leave") leave();
        return null;
      } catch (e) {
        const msg = (e as Error).message;
        if (/not in this lobby/i.test(msg)) leave("You’re no longer in that lobby.");
        return msg;
      }
    },
    [session, leave],
  );

  useEffect(() => {
    (window as unknown as { __view?: unknown }).__view = view;
  }, [view]);

  const inGame = session && view;
  const racing = inGame && view.phase === "race";

  return (
    <>
      <header className="topbar">
        <a className="logo" href="/" onClick={(e) => { if (session) e.preventDefault(); }}>
          <span className="logo__mark" aria-hidden="true" />
          <span className="logo__word">Grid<b>Auction</b></span>
        </a>
        {inGame && (
          <p className="topbar__info">
            Lobby <strong>{view.code}</strong>
            <span className={`conn conn--${status}`}>{status === "live" ? "Live" : status === "lost" ? "Connection lost" : "Reconnecting…"}</span>
          </p>
        )}
      </header>
      {notice && !session && <p className="notice" role="status">{notice}</p>}
      <main className={racing ? "main main--race" : "main"} id="main">
        {!session && <Landing onSession={onSession} inviteCode={invite} onClearInvite={() => { setInvite(null); history.replaceState(null, "", "/"); }} />}
        {session && !view && <p className="waiting center">Connecting to lobby {session.code}…</p>}
        {inGame && view.phase === "lobby" && <LobbyScreen view={view} act={act} />}
        {inGame && view.phase === "auction" && <AuctionScreen view={view} act={act} serverNow={serverNow} />}
        {inGame && view.phase === "lineup" && <LineupScreen view={view} act={act} serverNow={serverNow} />}
        {inGame && view.phase === "review" && <ReviewScreen view={view} act={act} serverNow={serverNow} />}
        {racing && view.race && <RaceMP key={view.race.index} view={view} act={act} serverNow={serverNow} frameRef={frame} />}
        {inGame && view.phase === "final" && <FinalScreen view={view} act={act} />}
      </main>
      {!racing && (
        <footer className="footer">
          <p>Free to play · No download required · No sign up required</p>
          <p className="small">Independent fan game. Not affiliated with Formula 1, the FIA, any team, or FootbAuction. Game not updating? Refreshing the page reconnects automatically.</p>
        </footer>
      )}
    </>
  );
}
