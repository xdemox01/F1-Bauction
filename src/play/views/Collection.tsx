import { useMemo, useState } from "react";

import { RatingBreakdown } from "../../components/cards/RatingBreakdown.tsx";
import { filterCatalogue, SORT_OPTIONS } from "../../lib/cards/catalogue.ts";
import type { CatalogueQuery, SortOption } from "../../lib/cards/catalogue.ts";
import { CATEGORY_LABELS, EDITION_LABELS, RARITY_LABELS } from "../../lib/cards/config.ts";
import { CARD_CATEGORIES, RARITIES } from "../../lib/cards/types.ts";
import type { CardCategory, Rarity } from "../../lib/cards/types.ts";
import type { Action, ActionResult } from "../../lib/game/actions.ts";
import { CATALOGUE, requireTemplate } from "../../lib/game/catalogue.ts";
import type { GameState } from "../../lib/game/state.ts";
import { ErrorLine, GameCard, teamById } from "../shared.tsx";

const SORT_LABELS: Record<SortOption, string> = {
  overall_desc: "Highest rated",
  overall_asc: "Lowest rated",
  rarity_desc: "Rarest first",
  name_asc: "Name A–Z",
};

const METHOD_LABELS: Record<string, string> = {
  starter: "Starter card",
  pack: "From a pack",
  randoms_reward: "Randoms win",
  auction: "Auction",
  trade: "Trade",
  reward: "Reward",
  admin_grant: "Granted",
};

export function Collection({ state, dispatch }: { state: GameState; dispatch: (a: Action) => ActionResult }) {
  const [scope, setScope] = useState<"owned" | "all">("owned");
  const [category, setCategory] = useState<CardCategory | "">("");
  const [rarity, setRarity] = useState<Rarity | "">("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("overall_desc");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copiesBySlug = useMemo(() => {
    const m = new Map<string, typeof state.cards>();
    for (const c of state.cards) m.set(c.slug, [...(m.get(c.slug) ?? []), c]);
    return m;
  }, [state.cards]);

  const teamIds = new Set(Object.values(state.team).filter(Boolean));
  const query: CatalogueQuery = { category: category || undefined, rarity: rarity || undefined, search: search || undefined, sort };
  const source = scope === "owned" ? CATALOGUE.filter((t) => copiesBySlug.has(t.slug)) : CATALOGUE;
  const cards = filterCatalogue(source, query);
  const ownedTemplates = new Set(copiesBySlug.keys()).size;

  const detail = selected ? requireTemplate(selected) : null;
  const detailCopies = selected ? (copiesBySlug.get(selected) ?? []) : [];

  const useInTeam = (instanceId: string, cat: CardCategory) => {
    const r = dispatch({ type: "team/set", category: cat, instanceId });
    setError(r.ok ? null : r.error);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Collection</h1>
        <p className="muted">
          {state.cards.length} cards owned, {ownedTemplates} of {CATALOGUE.length} different cards collected
        </p>
      </div>

      <div className="toolbar" role="group" aria-label="Filter cards">
        <div className="segmented" role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={scope === "owned"} onClick={() => setScope("owned")}>My cards</button>
          <button type="button" role="radio" aria-checked={scope === "all"} onClick={() => setScope("all")}>All cards</button>
        </div>
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as CardCategory | "")}>
            <option value="">All categories</option>
            {CARD_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Rarity</span>
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "")}>
            <option value="">Any rarity</option>
            {[...RARITIES].reverse().map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            {SORT_OPTIONS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="field field--grow">
          <span>Search</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" maxLength={60} />
        </label>
      </div>

      <p className="results-count" aria-live="polite">{cards.length === 1 ? "1 card" : `${cards.length} cards`}</p>
      {cards.length === 0 ? (
        <div className="empty">
          <h2>No cards here yet</h2>
          <p>{scope === "owned" ? "Open a pack or win a Randoms match to add cards." : "Nothing matches these filters."}</p>
          <a className="button" href="#/packs">Open a pack</a>
        </div>
      ) : (
        <ul className="card-grid">
          {cards.map((card) => {
            const copies = copiesBySlug.get(card.slug)?.length ?? 0;
            const inTeam = (copiesBySlug.get(card.slug) ?? []).some((c) => teamIds.has(c.id));
            return (
              <li key={card.slug} className={copies === 0 ? "is-unowned" : undefined}>
                <button type="button" className="card-button" onClick={() => setSelected(card.slug)} aria-label={`Inspect ${card.name}`}>
                  <GameCard card={card} />
                </button>
                <div className="card-tags">
                  {copies > 1 && <span className="tag">×{copies}</span>}
                  {copies === 0 && <span className="tag tag--muted">Not owned</span>}
                  {inTeam && <span className="tag tag--team">In team</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {detail && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label={`${detail.name} details`}>
          <div className="drawer__backdrop" onClick={() => setSelected(null)} />
          <div className="drawer__panel">
            <button type="button" className="button drawer__close" onClick={() => setSelected(null)}>Close</button>
            <div className="drawer__grid">
              <GameCard card={detail} size="lg" />
              <div>
                <h2>{detail.name}</h2>
                <p className="muted">
                  {CATEGORY_LABELS[detail.category]} · {RARITY_LABELS[detail.rarity]} · {EDITION_LABELS[detail.edition]} ·{" "}
                  {teamById.get(detail.teamId)?.name} {detail.season}
                </p>
                <h3>Your copies</h3>
                <ErrorLine error={error} />
                {detailCopies.length === 0 ? (
                  <p className="muted">You don’t own this card yet.</p>
                ) : (
                  <ul className="history">
                    {detailCopies.map((c, i) => {
                      const inTeam = state.team[detail.category] === c.id;
                      return (
                        <li key={c.id}>
                          <span>Copy {i + 1}</span>
                          <span className="muted">
                            {METHOD_LABELS[c.method]}, {new Date(c.acquiredAt).toLocaleDateString("en-GB")}
                          </span>
                          {inTeam ? (
                            <span className="tag tag--team">In team</span>
                          ) : (
                            <button type="button" className="button button--small" onClick={() => useInTeam(c.id, detail.category)}>
                              Use in team
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <RatingBreakdown card={detail} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
