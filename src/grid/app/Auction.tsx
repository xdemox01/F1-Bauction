import { useEffect, useRef, useState } from "react";

import { CATEGORY_LABELS } from "../../lib/cards/config.ts";
import { requireTemplate } from "../../lib/game/catalogue.ts";
import { cryptoRng } from "../../lib/game/rng.ts";
import { GameCard } from "../../play/shared.tsx";
import {
  AUCTION_RULES,
  CATEGORIES,
  canBid,
  categoryOf,
  countByCategory,
  fairValue,
  finishWithoutPlayer,
  hasFullTeam,
  missingCategories,
  pass,
  placeBid,
  tick,
} from "../engine/auction.ts";
import type { AuctionState } from "../engine/auction.ts";
import { TEAM_COLORS } from "./session.ts";

const IMPACT: Record<string, string> = {
  driver: "Pace sets cornering grip and how close to the limit they drive. Racecraft helps overtaking. Consistency and experience mean fewer mistakes and better braking. Tyre management slows tyre wear.",
  car: "Straight-line speed and pace set top speed and acceleration. Aero sets cornering grip and steering response. Tyre management slows wear. Reliability improves boost recovery.",
  pit_crew: "Pit-stop speed sets how long your stop takes. Consistency narrows the spread. Coordination and reliability lower the chance of a slow stop.",
};

export function Auction({ auction, onChange, onDone }: { auction: AuctionState; onChange: (a: AuctionState) => void; onDone: () => void }) {
  const ref = useRef(auction);
  ref.current = auction;
  const rng = useRef(cryptoRng()).current;
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  // Auction clock: advances with real time, AI teams act inside tick().
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const a = ref.current;
      if (a.done) return;
      const next = tick(a, a.now + Math.min(500, now - last), rng);
      last = now;
      if (next !== a) onChange(next);
    }, 100);
    return () => clearInterval(id);
  }, [onChange, rng]);

  const me = auction.bidders.find((b) => b.isPlayer)!;
  const lot = auction.lot;
  const card = lot ? requireTemplate(lot.slug) : null;
  const open = lot && lot.soldTo === undefined;
  const remainingMs = lot && open ? Math.max(0, lot.endsAt - auction.now) : 0;
  const timerShare = open ? Math.min(1, remainingMs / (AUCTION_RULES.openingMs / auction.speed)) : 0;
  const leader = lot?.highBidderId ? auction.bidders.find((b) => b.id === lot.highBidderId) : null;
  const iLead = lot?.highBidderId === "player";
  const iPassed = lot?.passed.includes("player") ?? false;
  const next = (lot?.highBid ?? 0) + 1;

  const bid = (amount: number) => {
    const r = placeBid(ref.current, "player", amount);
    if (r.ok) {
      setError(null);
      onChange(r.state);
    } else setError(r.error);
  };
  const doPass = () => {
    const r = pass(ref.current, "player");
    if (r.ok) {
      setError(null);
      onChange(r.state);
    } else setError(r.error);
  };

  const quick = [1, 5, 10].map((inc) => ({ inc, amount: (lot?.highBid ?? 0) + inc }));
  const myCounts = countByCategory(me);
  const missing = missingCategories(me);
  const upcoming = auction.lots.slice(auction.lotIndex + 1, auction.lotIndex + 5);
  const left = auction.lots.slice(auction.lotIndex + 1);
  const leftByCat = CATEGORIES.map((c) => ({ c, n: left.filter((s) => categoryOf(s) === c).length }));

  if (auction.done) {
    return (
      <div className="auction-done panel">
        <h2>The auction is over</h2>
        <p>
          You have {me.credits} credits left and {me.items.length} item{me.items.length === 1 ? "" : "s"}.{" "}
          {missing.length
            ? `You didn’t buy a ${missing.map((m) => CATEGORY_LABELS[m].toLowerCase()).join(" or ")}, so you’ll get the lowest-rated free agent for that slot.`
            : "Your team is complete."}
        </p>
        <button type="button" className="button button--primary button--big" onClick={onDone}>
          Continue to team selection
        </button>
      </div>
    );
  }

  return (
    <div className="auction" data-testid="auction">
      <div className="auction__head">
        <p className="muted">
          Lot {auction.lotIndex + 1} of {auction.lots.length}
        </p>
        <div className="lot-progress" aria-hidden="true">
          <span style={{ width: `${(auction.lotIndex / auction.lots.length) * 100}%` }} />
        </div>
        <p className="credits" data-testid="credits">
          <span className="coin" aria-hidden="true" /> {me.credits} credits
        </p>
      </div>

      <div className="auction__grid">
        <section className="panel lot" aria-labelledby="lot-title">
          {card && (
            <>
              <div className="lot__card">
                <GameCard card={card} />
              </div>
              <div className="lot__info">
                <h2 id="lot-title">{card.name}</h2>
                <p className="muted">
                  {CATEGORY_LABELS[card.category]} · overall {card.overall} · fair value about {fairValue(card)} credits
                </p>
                <p className="small">{IMPACT[card.category]}</p>
              </div>
            </>
          )}
        </section>

        <section className="panel bid-panel" aria-label="Bidding">
          <p className="bid-panel__label">Current bid</p>
          <p className="bid-panel__amount" data-testid="current-bid">
            {lot?.highBid ? lot.highBid : "No bids"}
          </p>
          <p className="bid-panel__leader" aria-live="polite">
            {lot?.soldTo !== undefined
              ? lot?.soldTo
                ? `Sold to ${auction.bidders.find((b) => b.id === lot.soldTo)!.name} for ${lot.highBid}`
                : "Unsold"
              : leader
                ? iLead
                  ? "You’re winning this lot"
                  : `${leader.name} leads`
                : "Waiting for an opening bid"}
          </p>
          <div className={`timer-bar${remainingMs < 2500 ? " timer-bar--low" : ""}`} role="timer" aria-label={`${Math.ceil(remainingMs / 1000)} seconds left`}>
            <span style={{ width: `${timerShare * 100}%` }} />
          </div>
          <p className="small muted">{open ? `${Math.ceil(remainingMs / 1000)} s left. Each bid tops the clock back up.` : "Next lot coming up…"}</p>

          <div className="bid-buttons">
            {quick.map(({ inc, amount }) => {
              const why = open ? canBid(auction, "player", amount) : "Lot closed";
              return (
                <button key={inc} type="button" className="button button--primary" disabled={!!why} title={why ?? undefined} onClick={() => bid(amount)}>
                  Bid {amount} <span className="small">(+{inc})</span>
                </button>
              );
            })}
          </div>
          <form
            className="custom-bid"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(custom);
              if (!custom) return;
              bid(n);
              setCustom("");
            }}
          >
            <label className="field">
              <span>Your own bid</span>
              <input inputMode="numeric" pattern="[0-9]*" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} placeholder={`${next}–${me.credits}`} disabled={!open || iPassed} />
            </label>
            <button type="submit" className="button" disabled={!open || iPassed || !custom}>Bid</button>
          </form>
          <button type="button" className="button button--quiet pass-button" disabled={!open || iLead || iPassed} onClick={doPass}>
            {iPassed ? "You passed on this lot" : "Pass on this lot"}
          </button>
          {error && <p className="error-line" role="alert">{error}</p>}
          {open && myCounts[categoryOf(lot!.slug)] >= AUCTION_RULES.maxPerCategory && (
            <p className="small muted">You already own {AUCTION_RULES.maxPerCategory} of these, so you can’t bid.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="rivals-title">
          <h2 id="rivals-title">Teams</h2>
          <table className="bidders">
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col" className="num">Credits</th>
                <th scope="col">Driver / car / crew</th>
                <th scope="col">This lot</th>
              </tr>
            </thead>
            <tbody>
              {auction.bidders.map((b) => {
                const c = countByCategory(b);
                const status = !lot ? "" : lot.highBidderId === b.id ? `Leading at ${lot.highBid}` : lot.passed.includes(b.id) ? "Passed" : "Watching";
                return (
                  <tr key={b.id} className={b.isPlayer ? "is-player" : undefined}>
                    <th scope="row">
                      <span className="swatch" style={{ background: TEAM_COLORS[b.id] }} /> {b.name}
                    </th>
                    <td className="num">{b.credits}</td>
                    <td>{CATEGORIES.map((k) => (c[k] ? "●" : "○")).join(" ")}</td>
                    <td className={lot?.highBidderId === b.id ? "strong" : "muted"}>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ol className="bid-log" aria-label="Bids on this lot">
            {[...(lot?.bids ?? [])].reverse().slice(0, 5).map((b, i) => (
              <li key={i}>
                {auction.bidders.find((x) => x.id === b.bidderId)!.name} bid {b.amount}
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="mine-title">
          <h2 id="mine-title">Your team</h2>
          <ul className="my-items">
            {CATEGORIES.map((cat) => {
              const items = me.items.filter((i) => categoryOf(i.slug) === cat);
              return (
                <li key={cat}>
                  <span className="muted">{CATEGORY_LABELS[cat]}</span>
                  {items.length ? (
                    <span>{items.map((i) => `${requireTemplate(i.slug).name} (${requireTemplate(i.slug).overall}) for ${i.price}`).join(", ")}</span>
                  ) : (
                    <span className="need">Still needed</span>
                  )}
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && me.credits < missing.length * 6 && (
            <p className="warning small">Careful: {me.credits} credits for {missing.length} more slot{missing.length > 1 ? "s" : ""}. You may end up with free agents.</p>
          )}
          {hasFullTeam(me) && (
            <button type="button" className="button" onClick={() => onChange(finishWithoutPlayer(ref.current, rng))}>
              My team is complete: skip the remaining lots
            </button>
          )}
          <h3 className="small-heading">Coming up</h3>
          <ul className="upcoming">
            {upcoming.map((slug) => {
              const t = requireTemplate(slug);
              return (
                <li key={slug}>
                  <span>{t.name}</span>
                  <span className="muted">{CATEGORY_LABELS[t.category]}, {t.overall}</span>
                </li>
              );
            })}
          </ul>
          <p className="small muted">Left after this lot: {leftByCat.map((x) => `${x.n} ${CATEGORY_LABELS[x.c].toLowerCase()}${x.n === 1 ? "" : "s"}`).join(", ")}.</p>
        </section>
      </div>
    </div>
  );
}
