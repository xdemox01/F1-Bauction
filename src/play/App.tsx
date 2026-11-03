import { useEffect, useState } from "react";

import { BRAND } from "../lib/brand.ts";
import { coinsLabel } from "./shared.tsx";
import { useGame } from "./useGame.ts";
import { Collection } from "./views/Collection.tsx";
import { Garage } from "./views/Garage.tsx";
import { Modes } from "./views/Modes.tsx";
import { Packs } from "./views/Packs.tsx";
import { Randoms } from "./views/Randoms.tsx";
import { Settings } from "./views/Settings.tsx";
import { Team } from "./views/Team.tsx";

const ROUTES = [
  { path: "garage", label: "Garage" },
  { path: "modes", label: "Play" },
  { path: "randoms", label: "Randoms" },
  { path: "collection", label: "Collection" },
  { path: "packs", label: "Packs" },
  { path: "team", label: "Team" },
  { path: "settings", label: "Settings" },
] as const;
type Route = (typeof ROUTES)[number]["path"];

const readRoute = (): Route => {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES.find((r) => r.path === hash)?.path ?? "garage") as Route;
};

export function App() {
  const game = useGame();
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { state, dispatch } = game;
  const runActive = state.randoms.active && !state.randoms.active.completed;

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="brand" href="#/garage">
            <span className="brand__mark" aria-hidden="true" />
            {BRAND.name}
          </a>
          <nav aria-label="Main">
            <ul className="nav">
              {ROUTES.map((r) => (
                <li key={r.path}>
                  <a href={`#/${r.path}`} aria-current={route === r.path ? "page" : undefined}>
                    {r.label}
                    {r.path === "randoms" && runActive && <span className="dot" aria-label="(run in progress)" />}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="balance" data-testid="balance" aria-label={`Balance ${coinsLabel(state.coins)}`}>
            <span className="coin" aria-hidden="true" />
            {state.coins.toLocaleString("en-GB")}
          </p>
        </div>
      </header>
      {game.notice && (
        <div className="notice" role="status">
          <p>{game.notice}</p>
          <button type="button" className="button button--small" onClick={game.dismissNotice}>Dismiss</button>
        </div>
      )}
      <main id="main" className="site-main">
        {route === "garage" && <Garage state={state} />}
        {route === "modes" && <Modes state={state} />}
        {route === "randoms" && <Randoms state={state} dispatch={dispatch} />}
        {route === "collection" && <Collection state={state} dispatch={dispatch} />}
        {route === "packs" && <Packs state={state} dispatch={dispatch} />}
        {route === "team" && <Team state={state} dispatch={dispatch} />}
        {route === "settings" && <Settings onReset={game.reset} />}
      </main>
      <footer className="site-footer">
        <p>Local prototype: progress is saved in this browser only. {BRAND.disclaimer}</p>
      </footer>
    </>
  );
}
