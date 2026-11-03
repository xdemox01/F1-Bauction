import { Card } from "../components/cards/Card.tsx";
import { SourceNotice } from "../components/SourceNotice.tsx";
import { CATEGORY_LABELS } from "../lib/cards/config.ts";
import { CARD_CATEGORIES } from "../lib/cards/types.ts";
import { getCatalogueRepository } from "../lib/data/catalogue-repository.ts";

export default async function HomePage() {
  const repo = getCatalogueRepository();
  const [cards, teams] = await Promise.all([repo.listTemplates(), repo.listTeams()]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // One headline card per category: the highest-rated standard edition.
  const featured = CARD_CATEGORIES.map((category) =>
    cards.filter((c) => c.category === category && c.edition === "standard").sort((a, b) => b.overall - a.overall)[0],
  ).filter(Boolean);

  const counts = CARD_CATEGORIES.map((c) => ({ category: c, count: cards.filter((x) => x.category === c).length }));

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">
            Driver, car, crew.
            <br />
            Three cards make a team.
          </h1>
          <p className="hero__lede">
            Collect cards for every driver, car and pit crew on the grid, then pick one of each to race. Every rating is
            shown in full, so you can see exactly why a card is worth what it is.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="/play/index.html">Play the game</a>
            <a className="button" href="/cards">Browse all cards</a>
          </div>
          <SourceNotice source={repo.source} />
        </div>
        <ol className="hero__fan" aria-label="Featured cards">
          {featured.map((card) => (
            <li key={card.slug}>
              <a href={`/cards/${card.slug}`} className="card-link">
                <Card card={card} team={teamById.get(card.teamId)} />
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className="category-strip" aria-label="Card categories">
        {counts.map(({ category, count }) => (
          <a key={category} className="category-strip__item" href={`/cards?category=${category}`}>
            <span className="category-strip__name">{CATEGORY_LABELS[category]} cards</span>
            <span className="category-strip__count">{count} in the catalogue</span>
          </a>
        ))}
      </section>
    </div>
  );
}
