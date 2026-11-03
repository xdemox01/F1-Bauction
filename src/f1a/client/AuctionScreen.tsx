// Live auction screen. Layout follows the reference auction: managers flank the
// item on sale, bid controls and live chat below, "My squad" sidebar on the right.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { ATTR_LABEL, CATEGORY_LABEL, CATEGORY_PLURAL, POOL_LABEL } from "../shared/pool.ts";
import type { Category } from "../shared/pool.ts";
import { RULES, SQUAD_SIZE } from "../shared/rules.ts";
import type { Action, ItemView, LobbyView, ManagerView } from "../shared/types.ts";
import { ChatPanel } from "./Chat.tsx";
import { useCountdown } from "./ui.tsx";

const SLOT_LABELS: { cat: Category; label: string }[] = [
  { cat: "driver", label: "Driver" },
  { cat: "driver", label: "Driver" },
  { cat: "driver", label: "Reserve driver" },
  { cat: "car", label: "Car" },
  { cat: "crew", label: "Pit crew" },
  { cat: "principal", label: "Team principal" },
];
const SHORT: Record<Category, string> = { driver: "DRV", car: "CAR", crew: "CREW", principal: "TP" };

/** Squad list used by the lineup and review screens. */
export function SquadSlots({ m, compact }: { m: ManagerView; compact?: boolean }) {
  const used = new Map<Category, number>();
  return (
    <ul className={`slots${compact ? " slots--compact" : ""}`}>
      {SLOT_LABELS.map((slot, i) => {
        const n = used.get(slot.cat) ?? 0;
        used.set(slot.cat, n + 1);
        const entry = m.squad.filter((s) => s.item.category === slot.cat)[n];
        return (
          <li key={i} className={entry ? "filled" : undefined}>
            <span className="slots__label">{slot.label}</span>
            {entry ? (
              <>
                <span className="slots__name">{entry.item.name}</span>
                <span className="slots__ovr">{entry.item.overall ?? "?"}</span>
                <span className="slots__price">{entry.how === "free" ? "free" : `${entry.price} cr`}</span>
              </>
            ) : (
              <span className="slots__empty">Empty</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rating of what you own so far, weighted like the race model (drivers and car matter most). */
function squadOverall(m: ManagerView): number | null {
  const of = (c: Category) => m.squad.filter((s) => s.item.category === c).map((s) => s.item.overall);
  if (m.squad.some((s) => s.item.overall === null)) return null;
  const drivers = (of("driver") as number[]).sort((a, b) => b - a).slice(0, 2);
  const parts: [number, number][] = [];
  for (const d of drivers) parts.push([d, 0.175]);
  for (const [c, w] of [["car", 0.35], ["crew", 0.15], ["principal", 0.15]] as [Category, number][]) {
    const v = of(c)[0];
    if (v !== undefined && v !== null) parts.push([v, w]);
  }
  if (!parts.length) return null;
  const wsum = parts.reduce((t, [, w]) => t + w, 0);
  return Math.round(parts.reduce((t, [v, w]) => t + v * w, 0) / wsum);
}

function CatGlyph({ cat }: { cat: Category }) {
  // Simple silhouettes, one per category.
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (cat === "driver")
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path {...common} d="M22 78c0-30 18-50 44-50 20 0 34 12 34 30v20H22z" />
        <path {...common} d="M54 52h44v14H60c-4 0-6-3-6-6z" />
        <path {...common} d="M22 78h78v12c0 4-3 7-7 7H29c-4 0-7-3-7-7z" />
      </svg>
    );
  if (cat === "car")
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path {...common} d="M10 70h22l10-12h26l8 8h20l12 6v6H10z" />
        <circle {...common} cx="30" cy="80" r="9" />
        <circle {...common} cx="92" cy="80" r="9" />
        <path {...common} d="M6 64v12M110 60v14" />
      </svg>
    );
  if (cat === "crew")
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path {...common} d="M30 92l40-40M70 52c-6-12 2-26 16-26l-8 12 4 8 8 4 12-8c0 14-14 22-26 16" />
        <circle {...common} cx="28" cy="94" r="6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path {...common} d="M28 66V58c0-18 14-32 32-32s32 14 32 32v8" />
      <rect {...common} x="20" y="62" width="14" height="24" rx="5" />
      <rect {...common} x="86" y="62" width="14" height="24" rx="5" />
      <path {...common} d="M93 86c0 10-10 14-22 14h-6" />
    </svg>
  );
}

function LotCard({ item, bid, leader, seconds, result, pool }: { item: ItemView; bid: number; leader: ManagerView | undefined; seconds: number | null; result: NonNullable<LobbyView["lot"]>["result"]; pool: string }) {
  const pct = seconds === null ? 0 : (seconds / (RULES.bidClockMs / 1000)) * 100;
  return (
    <article className={`fa-card fa-card--${item.category}`} data-testid="lot-card" aria-label={`${item.name}, ${CATEGORY_LABEL[item.category]}`}>
      <div className="fa-card__art">
        <CatGlyph cat={item.category} />
        {item.overall !== null && <span className="fa-card__ovr" data-testid="lot-ovr">{item.overall}</span>}
      </div>
      <div className="fa-card__info">
        <h2 className="fa-card__name">{item.name}</h2>
        <span className="fa-card__badge">{CATEGORY_LABEL[item.category].toUpperCase()}</span>
        <p className="fa-card__meta">{item.nationality ?? (item.season ? `${item.season} season` : "")}</p>
        <p className="fa-card__meta">{item.team}</p>
        <p className="fa-card__bid" data-testid="current-bid">${bid}</p>
        <p className="fa-card__bidlabel">Current bid</p>
        <p className="fa-card__leader" aria-live="polite">
          {leader ? (
            <>
              <span className="fa-sq" style={{ background: leader.color }} aria-hidden="true" />
              {leader.isYou ? "You lead" : `${leader.name} leads`}
            </>
          ) : (
            "No bids yet"
          )}
        </p>
        <p className="fa-card__pool">{pool}</p>
      </div>
      <div className={`fa-card__clock${seconds !== null && seconds < 3 ? " is-low" : ""}`} data-testid="clock" aria-label={seconds !== null ? `${Math.ceil(seconds)} seconds left` : "Lot closed"}>
        {seconds !== null ? seconds.toFixed(1) : "—"}
      </div>
      <span className="fa-card__timer" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      {result && (
        <div className={`fa-card__stamp fa-card__stamp--${result.kind}`} data-testid="lot-result">
          <strong>{result.kind === "unsold" ? "Unsold" : result.kind === "sold" ? "Sold" : result.kind === "assigned" ? "Assigned" : "Free"}</strong>
          <span>{result.note}</span>
        </div>
      )}
    </article>
  );
}

function ManagerSlot({ m, cat, lot }: { m: ManagerView; cat: Category; lot: NonNullable<LobbyView["lot"]> }) {
  const have = m.squad.filter((s) => s.item.category === cat).length;
  const leading = lot.leaderId === m.id;
  const status = !m.connected ? "Offline" : leading ? "Leading" : lot.out.includes(m.id) ? "Out" : m.needs[cat] <= 0 ? "Full" : !lot.eligible.includes(m.id) && !lot.result ? "Can’t afford" : "Active";
  const lastBid = [...lot.bids].reverse().find((b) => b.managerId === m.id);
  return (
    <div className={`fa-mgr${leading ? " is-leading" : ""}${m.isYou ? " is-you" : ""}`} style={{ ["--mc" as string]: m.color }} data-testid={`mgr-${m.name}`}>
      <div className="fa-mgr__top">
        <span className="fa-sq" style={{ background: m.color }} aria-hidden="true" />
        <strong className="fa-mgr__name">{m.name}{m.isYou && <span className="fa-you"> (you)</span>}</strong>
        {m.isHost && <span className="fa-tag">HOST</span>}
        {m.isBot && <span className="fa-tag">AI</span>}
        <span className="fa-mgr__prog" title={`${m.squad.length}/${SQUAD_SIZE} items in total`}>
          {have}/{RULES.squad[cat]} {SHORT[cat]}
        </span>
      </div>
      <p className="fa-mgr__line">
        <span className={`st st--${status.replace(/\W/g, "").toLowerCase()}`}>{status}</span> • <span data-testid="mgr-credits">{m.credits}</span> left
        {lastBid && !lot.result && <span className="fa-mgr__bid"> · bid ${lastBid.amount}</span>}
      </p>
      <p className="fa-mgr__squad">{m.squad.length}/{SQUAD_SIZE} items</p>
    </div>
  );
}

const GARAGE: { cat: Category; n: number; label: string; area: string }[] = [
  { cat: "driver", n: 0, label: "DRIVER 1", area: "d1" },
  { cat: "driver", n: 1, label: "DRIVER 2", area: "d2" },
  { cat: "driver", n: 2, label: "RESERVE", area: "d3" },
  { cat: "car", n: 0, label: "CAR", area: "car" },
  { cat: "crew", n: 0, label: "PIT CREW", area: "crew" },
  { cat: "principal", n: 0, label: "PRINCIPAL", area: "tp" },
];

function MySquad({ me, blind }: { me: ManagerView; blind: boolean }) {
  const ovr = squadOverall(me);
  return (
    <>
      <section className="fa-box fa-squad" aria-label="My squad" data-testid="my-squad">
        <h2>My squad</h2>
        <p className="fa-squad__sum">
          <span>{me.squad.length}/{SQUAD_SIZE} items</span>
          <span>
            <strong className="orange" data-testid="budget">${me.credits}</strong> remaining
          </span>
        </p>
        <p className="fa-squad__form">2 drivers + reserve · car · crew · principal</p>
        <div className="fa-garage">
          <span className="fa-garage__lane" aria-hidden="true" />
          {GARAGE.map((g) => {
            const e = me.squad.filter((s) => s.item.category === g.cat)[g.n];
            return (
              <div key={g.area} className={`fa-spot${e ? " is-filled" : ""}`} style={{ gridArea: g.area }}>
                <span className="fa-spot__label">{g.label}</span>
                <span className="fa-spot__dot" style={e ? { background: me.color, borderColor: me.color } : undefined}>
                  {e ? (e.item.overall ?? "?") : "+"}
                </span>
                {e && (
                  <span className="fa-spot__name">
                    {e.item.name.split(" ").slice(-1)[0]} <em>{e.how === "free" ? "free" : `$${e.price}`}</em>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="small muted">Max bid now: ${me.maxBid}. $1 is kept back for every other empty slot.</p>
      </section>
      <section className="fa-box fa-ovr" aria-label="Team overall">
        <span className="fa-cap">TEAM OVERALL</span>
        <div className="fa-ovr__row">
          <strong data-testid="team-overall">{blind ? "—" : (ovr ?? "—")}</strong>
          <span>{blind ? "Blind mode" : me.squad.length ? "So far" : "No items yet"}</span>
        </div>
      </section>
    </>
  );
}

export function AuctionScreen({ view, act, serverNow }: { view: LobbyView; act: (a: Action) => Promise<string | null>; serverNow: () => number }) {
  const lot = view.lot;
  const me = view.managers.find((m) => m.isYou)!;
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const remaining = useCountdown(lot && !lot.result ? lot.endsAt : null, serverNow);
  useEffect(() => setError(null), [lot?.no]);

  if (!lot) return <div className="screen"><p className="waiting">Preparing the next lot…</p></div>;

  const open = !lot.result;
  const leading = lot.leaderId === me.id;
  const isOut = lot.out.includes(me.id);
  const needs = me.needs[lot.category] > 0;
  const leader = view.managers.find((m) => m.id === lot.leaderId);
  const canBid = open && needs && !isOut && !leading;
  const canRaise = (inc: number) => canBid && lot.highBid + inc <= me.maxBid;
  const why = !open ? "" : !needs ? `Your ${CATEGORY_LABEL[lot.category].toLowerCase()} slots are full.` : isOut ? "You’re out of this lot." : leading ? "You have the highest bid." : me.maxBid <= lot.highBid ? "You can’t afford to outbid." : "";
  const run = async (a: Action) => setError(await act(a));
  const onTotal = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(total);
    if (!Number.isInteger(n) || n < 1) return setError("Enter the total price as a whole number.");
    setTotal("");
    await run({ type: "bid", total: n });
  };
  const seconds = remaining === null ? null : remaining / 1000;
  const blind = view.settings.auctionMode === "blind";

  // Ten seats around the item: odd seats on the left, even on the right, like the reference.
  const seats = Array.from({ length: RULES.maxManagers }, (_, i) => view.managers[i] ?? null);
  const left = seats.filter((_, i) => i % 2 === 0);
  const right = seats.filter((_, i) => i % 2 === 1);
  const seatCol = (list: (ManagerView | null)[], side: string) => (
    <div className={`fa-seats fa-seats--${side}`}>
      {list.map((m, i) => (m ? <ManagerSlot key={m.id} m={m} cat={lot.category} lot={lot} /> : <div key={`e${i}`} className="fa-seat-empty" aria-hidden="true"><span /></div>))}
    </div>
  );
  const name = (id: string) => view.managers.find((m) => m.id === id);

  return (
    <div className="fa" data-testid="auction">
      <header className="fa-head">
        <div>
          <h1 className="fa-title">Live auction</h1>
          <p className="fa-sub">Plan your budget and complete your grid.</p>
          <span className="fa-pill" data-testid="on-sale">{CATEGORY_PLURAL[lot.category].toUpperCase()} ON SALE</span>
          <span className="fa-lotno">Lot {lot.no} · {lot.categoryIndex + 1}/4: drivers → cars → pit crews → principals</span>
        </div>
        <div className="fa-pool">
          <strong>{POOL_LABEL[view.settings.pool].replace(" F1", "")}</strong>
          <span>{view.settings.pool === "legends" || view.settings.era === "alltime" ? "All-time" : "Current"} {blind ? "· Blind" : ""}</span>
        </div>
      </header>

      <div className="fa-layout">
        <section className="fa-box fa-main" aria-label="Auction">
          <div className="fa-stage">
            {seatCol(left, "l")}
            <div className="fa-center">
              <LotCard item={lot.item} bid={lot.highBid} leader={leader} seconds={seconds} result={lot.result} pool={POOL_LABEL[view.settings.pool]} />
              {lot.item.attrs && (
                <dl className="fa-attrs">
                  {Object.entries(lot.item.attrs).map(([k, v]) => (
                    <div key={k}>
                      <dt>{ATTR_LABEL[k] ?? k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {blind && <p className="fa-attrs fa-attrs--blind">Blind auction: ratings are hidden.</p>}
            </div>
            {seatCol(right, "r")}
          </div>

          <p className="fa-rule">If nobody bids, each eligible manager loses up to 1 credit. Squad reserve is protected.</p>

          <section className="fa-box fa-bid" aria-label="Your bid">
            <div className="fa-bid__row">
              <div className="fa-bid__me">
                <h2>Your bid</h2>
                <p data-testid="available">{me.maxBid} available</p>
              </div>
              {RULES.increments.map((inc) => (
                <button key={inc} type="button" className="fa-btn fa-btn--dark fa-btn--xl" disabled={!canRaise(inc)} onClick={() => run({ type: "bid", increment: inc })}>
                  +{inc}
                </button>
              ))}
              <button type="button" className="fa-btn fa-btn--orange fa-btn--xl" disabled={!canRaise(1)} onClick={() => run({ type: "bid", allIn: true })} data-testid="all-in">
                All in
              </button>
              <button type="button" className="fa-btn fa-btn--out fa-btn--xl" disabled={!open || leading || isOut || !needs} onClick={() => run({ type: "out" })}>
                {isOut ? "You’re out" : "I’m out"}
              </button>
            </div>
            <form className="fa-total" onSubmit={onTotal}>
              <label htmlFor="total-bid">Total bid</label>
              <div className="fa-total__row">
                <input id="total-bid" inputMode="numeric" value={total} disabled={!canBid} onChange={(e) => setTotal(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                <button type="submit" className="fa-btn fa-btn--orange-dim" disabled={!canBid || !total}>
                  Bid total
                </button>
              </div>
              <p className="fa-help">
                Enter the total price, not an increase. Minimum: {lot.highBid + 1} credits. Maximum: {me.maxBid} credits.
              </p>
            </form>
            {(error || why) && (
              <p className={error ? "ferr" : "small muted"} role={error ? "alert" : "status"}>
                {error ?? why}
              </p>
            )}
          </section>

          <ChatPanel chat={view.chat} act={act} />
        </section>

        <aside className="fa-box fa-side" aria-label="My team">
          <MySquad me={me} blind={blind} />
          <section className="fa-box fa-top" aria-label="Top purchases" data-testid="top-purchases">
            <header>
              <span className="fa-cap">TOP PURCHASES</span>
              <span className="fa-cap fa-cap--dim">TOP 5</span>
            </header>
            {view.topPurchases.length === 0 ? (
              <p className="fa-empty">No purchases yet</p>
            ) : (
              <ol>
                {view.topPurchases.map((p, i) => {
                  const m = name(p.managerId);
                  return (
                    <li key={p.no}>
                      <span className="fa-top__n">{i + 1}</span>
                      <span className="fa-top__item">
                        {p.itemName}
                        <small>
                          <span className="fa-sq" style={{ background: m?.color }} aria-hidden="true" /> {m?.name} · {CATEGORY_LABEL[p.category]}
                        </small>
                      </span>
                      <strong>${p.price}</strong>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <button
            type="button"
            className="fa-btn fa-btn--leave"
            onClick={() => (confirmLeave ? act({ type: "leave" }) : setConfirmLeave(true))}
            onBlur={() => setConfirmLeave(false)}
          >
            {confirmLeave ? "Click again: an AI takes over your team" : "Leave match"}
          </button>
        </aside>
      </div>
    </div>
  );
}
