import { useRef, useState } from "react";

import { RARITY_LABELS } from "../../lib/cards/config.ts";
import { RARITIES } from "../../lib/cards/types.ts";
import type { Action, ActionResult } from "../../lib/game/actions.ts";
import { packPoolByRarity, requireTemplate } from "../../lib/game/catalogue.ts";
import { PACKS } from "../../lib/game/config.ts";
import type { GameState, PackOpening } from "../../lib/game/state.ts";
import { coinsLabel, ErrorLine, GameCard } from "../shared.tsx";

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;

export function Packs({ state, dispatch }: { state: GameState; dispatch: (a: Action) => ActionResult }) {
  const [opening, setOpening] = useState<PackOpening | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // One purchase intent per pack until it succeeds, so double clicks reuse the same id.
  const intents = useRef(new Map<string, string>());

  const open = (packId: string) => {
    if (busy.current || opening) return;
    busy.current = true;
    let requestId = intents.current.get(packId);
    if (!requestId) {
      requestId = crypto.randomUUID();
      intents.current.set(packId, requestId);
    }
    const r = dispatch({ type: "pack/open", packId, requestId });
    if (r.ok) {
      // Stay locked until the player leaves the reveal screen, so extra clicks
      // queued before the re-render can't buy another pack.
      intents.current.delete(packId);
      if (r.opening) setOpening(r.opening);
      setError(null);
    } else {
      setError(r.error);
      busy.current = false;
    }
  };

  const backToPacks = () => {
    setOpening(null);
    busy.current = false;
  };

  if (opening) {
    const pack = PACKS.find((p) => p.id === opening.packId)!;
    return (
      <div className="stack">
        <div className="page-head">
          <h1>{pack.name} opened</h1>
          <p className="muted">
            Spent {coinsLabel(opening.cost)}. Balance now {coinsLabel(state.coins)}. These cards are in your collection.
          </p>
        </div>
        <ul className="card-grid reveal" data-testid="pack-reveal">
          {opening.slugs.map((slug, i) => (
            <li key={opening.cardIds[i]} style={{ animationDelay: `${i * 140}ms` }}>
              <GameCard card={requireTemplate(slug)} />
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="button button--primary" onClick={backToPacks}>Back to packs</button>
          <a className="button" href="#/collection">View collection</a>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Packs</h1>
        <p className="muted">Balance: {coinsLabel(state.coins)}. Packs add cards to your collection; duplicates are kept as separate copies.</p>
      </div>
      <ErrorLine error={error} />
      <div className="pack-grid">
        {PACKS.map((pack) => {
          const short = state.coins < pack.cost;
          return (
            <section key={pack.id} className="panel pack" aria-labelledby={`pack-${pack.id}`}>
              <h2 id={`pack-${pack.id}`}>{pack.name}</h2>
              <p>{pack.description}</p>
              <p className="pack__cost">
                <strong>{coinsLabel(pack.cost)}</strong> for {pack.cardCount} cards
              </p>
              <table className="odds">
                <caption>Chance for each card</caption>
                <tbody>
                  {[...RARITIES].reverse().filter((r) => pack.odds[r]).map((r) => (
                    <tr key={r}>
                      <th scope="row" data-rarity={r}>{RARITY_LABELS[r]}</th>
                      <td className="num">{pct(pack.odds[r]!)}</td>
                      <td className="muted small">{packPoolByRarity(r).length} possible cards</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="button button--primary"
                disabled={short}
                aria-describedby={short ? `short-${pack.id}` : undefined}
                onClick={() => open(pack.id)}
              >
                Open for {pack.cost} coins
              </button>
              {short && (
                <p id={`short-${pack.id}`} className="muted small">
                  You need {pack.cost - state.coins} more coins. Earn them in Randoms or quick races.
                </p>
              )}
            </section>
          );
        })}
      </div>

      <section className="panel">
        <h2>Pack history</h2>
        {state.packOpenings.length === 0 ? (
          <p className="muted">No packs opened yet.</p>
        ) : (
          <ul className="history">
            {[...state.packOpenings].reverse().slice(0, 10).map((p) => (
              <li key={p.id}>
                <span>{PACKS.find((x) => x.id === p.packId)?.name}</span>
                <span className="muted small">{p.slugs.map((s) => requireTemplate(s).name).join(", ")}</span>
                <span className="debit">−{p.cost}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Limited editions never appear in packs in this prototype; they need a server to issue serial numbers.</p>
      </section>
    </div>
  );
}
