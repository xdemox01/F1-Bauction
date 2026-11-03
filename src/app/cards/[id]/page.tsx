import { notFound } from "next/navigation";

import { Card } from "../../../components/cards/Card.tsx";
import { RatingBreakdown } from "../../../components/cards/RatingBreakdown.tsx";
import { SourceNotice } from "../../../components/SourceNotice.tsx";
import { CATEGORY_LABELS, EDITION_LABELS, RARITY_LABELS } from "../../../lib/cards/config.ts";
import { getCatalogueRepository } from "../../../lib/data/catalogue-repository.ts";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const card = await getCatalogueRepository().getTemplate((await params).id);
  return { title: card ? `${card.name} (${RARITY_LABELS[card.rarity]})` : "Card not found" };
}

export default async function CardDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const repo = getCatalogueRepository();
  const card = await repo.getTemplate(id);
  if (!card) notFound();

  const teams = await repo.listTeams();
  const team = teams.find((t) => t.id === card.teamId);
  const driver = card.category === "driver" ? await repo.getDriver(card.driverId) : null;
  const others =
    card.category === "driver"
      ? (await repo.listTemplates()).filter((c) => c.category === "driver" && c.driverId === card.driverId && c.slug !== card.slug)
      : [];

  return (
    <div className="detail">
      <p className="crumbs">
        <a href="/cards">Cards</a> / <a href={`/cards?category=${card.category}`}>{CATEGORY_LABELS[card.category]}s</a>
      </p>

      <div className="detail__grid">
        <div className="detail__card">
          <Card card={card} team={team} size="lg" />
        </div>

        <div className="detail__info">
          <h1>{card.name}</h1>
          <dl className="facts">
            <div><dt>Category</dt><dd>{CATEGORY_LABELS[card.category]}</dd></div>
            <div><dt>Rarity</dt><dd>{RARITY_LABELS[card.rarity]}</dd></div>
            <div><dt>Edition</dt><dd>{EDITION_LABELS[card.edition]}</dd></div>
            <div><dt>Season</dt><dd>{card.season}</dd></div>
            <div><dt>Team</dt><dd>{team?.name ?? card.teamId}</dd></div>
            <div>
              <dt>Print run</dt>
              <dd>{card.serialLimit ? `Limited to ${card.serialLimit.toLocaleString("en-GB")} numbered copies` : "Unlimited"}</dd>
            </div>
          </dl>

          <RatingBreakdown card={card} />

          <section className="real-data" aria-labelledby="real-data-title">
            <h2 id="real-data-title">Real-world data</h2>
            {driver ? (
              <>
                <dl className="facts">
                  <div><dt>Nationality</dt><dd>{driver.nationality}</dd></div>
                  <div><dt>Career statistics</dt><dd>Not imported yet</dd></div>
                </dl>
                <p className="muted">
                  Source: {driver.dataSource}. Career wins, podiums and titles will appear here once the F1 data
                  service is connected; they are never estimated.
                </p>
              </>
            ) : (
              <p className="muted">
                Reliable public numbers don’t exist for {card.category === "car" ? "car performance" : "pit-crew performance"}, so
                every attribute on this card is a labelled game estimate.
              </p>
            )}
          </section>

          {others.length > 0 && (
            <section aria-labelledby="editions-title">
              <h2 id="editions-title">Other editions of this driver</h2>
              <ul className="edition-list">
                {others.map((o) => (
                  <li key={o.slug}>
                    <a href={`/cards/${o.slug}`}>
                      {EDITION_LABELS[o.edition]} {o.season}
                    </a>
                    <span>{RARITY_LABELS[o.rarity]}, overall {o.overall}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SourceNotice source={repo.source} />
        </div>
      </div>
    </div>
  );
}
