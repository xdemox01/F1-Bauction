import { Card } from "../../components/cards/Card.tsx";
import { SourceNotice } from "../../components/SourceNotice.tsx";
import { filterCatalogue, parseCatalogueQuery } from "../../lib/cards/catalogue.ts";
import type { SortOption } from "../../lib/cards/catalogue.ts";
import { CATEGORY_LABELS, EDITION_LABELS, RARITY_LABELS } from "../../lib/cards/config.ts";
import { CARD_CATEGORIES, EDITIONS, RARITIES } from "../../lib/cards/types.ts";
import { getCatalogueRepository } from "../../lib/data/catalogue-repository.ts";

export const metadata = { title: "Cards" };

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_LABELS: Record<SortOption, string> = {
  overall_desc: "Highest rated",
  overall_asc: "Lowest rated",
  rarity_desc: "Rarest first",
  name_asc: "Name A–Z",
};

export default async function CardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseCatalogueQuery(await searchParams);
  const repo = getCatalogueRepository();
  const [all, teams] = await Promise.all([repo.listTemplates(), repo.listTeams()]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const cards = filterCatalogue(all, query);
  const seasons = [...new Set(all.map((c) => c.season))].sort((a, b) => b - a);
  const filtered = Boolean(query.rarity || query.edition || query.season || query.teamId || query.search);

  const tabHref = (category?: string) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    return p.size ? `/cards?${p}` : "/cards";
  };

  return (
    <div className="catalogue">
      <div className="catalogue__head">
        <h1>Cards</h1>
        <SourceNotice source={repo.source} />
      </div>

      <nav className="tabs" aria-label="Card category">
        <a href={tabHref()} aria-current={!query.category ? "page" : undefined}>All</a>
        {CARD_CATEGORIES.map((c) => (
          <a key={c} href={tabHref(c)} aria-current={query.category === c ? "page" : undefined}>
            {CATEGORY_LABELS[c]}s
          </a>
        ))}
      </nav>

      <div className="catalogue__body">
        <form className="filters" method="get" action="/cards" aria-label="Filter cards">
          {query.category && <input type="hidden" name="category" value={query.category} />}
          <label className="field">
            <span>Search by name</span>
            <input type="search" name="q" defaultValue={query.search ?? ""} placeholder="e.g. Alonso" maxLength={60} />
          </label>
          <label className="field">
            <span>Rarity</span>
            <select name="rarity" defaultValue={query.rarity ?? ""}>
              <option value="">Any rarity</option>
              {[...RARITIES].reverse().map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Edition</span>
            <select name="edition" defaultValue={query.edition ?? ""}>
              <option value="">Any edition</option>
              {EDITIONS.map((e) => <option key={e} value={e}>{EDITION_LABELS[e]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Team</span>
            <select name="team" defaultValue={query.teamId ?? ""}>
              <option value="">Any team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Season</span>
            <select name="season" defaultValue={query.season ? String(query.season) : ""}>
              <option value="">Any season</option>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select name="sort" defaultValue={query.sort}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
            </select>
          </label>
          <div className="filters__actions">
            <button type="submit" className="button button--primary">Apply filters</button>
            {filtered && <a className="button" href={tabHref(query.category)}>Clear</a>}
          </div>
        </form>

        <section aria-live="polite" aria-label="Results">
          <p className="results-count">{cards.length === 1 ? "1 card" : `${cards.length} cards`}</p>
          {cards.length === 0 ? (
            <div className="empty">
              <h2>No cards match these filters</h2>
              <p>Try a different rarity or team, or clear the filters to see the whole catalogue.</p>
              <a className="button" href="/cards">Show all cards</a>
            </div>
          ) : (
            <ul className="card-grid">
              {cards.map((card) => (
                <li key={card.slug}>
                  <a className="card-link" href={`/cards/${card.slug}`}>
                    <Card card={card} team={teamById.get(card.teamId)} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
