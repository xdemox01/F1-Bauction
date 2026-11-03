import type { CSSProperties } from "react";

import { ATTRIBUTE_LABELS, CATEGORY_LABELS, EDITION_LABELS, RARITY_LABELS } from "../../lib/cards/config.ts";
import { attributeKeys } from "../../lib/cards/rating.ts";
import type { RatedCardTemplate, Team } from "../../lib/cards/types.ts";
import { CardArt } from "./CardArt.tsx";

export interface CardProps {
  card: RatedCardTemplate;
  team?: Team;
  size?: "md" | "lg";
  /** Serial of an owned copy (collection view). */
  serialNumber?: number | null;
}

export function Card({ card, team, size = "md", serialNumber }: CardProps) {
  const keys = attributeKeys(card.category);
  const attrs = card.attributes as unknown as Record<string, number>;
  const label = `${card.name}, ${CATEGORY_LABELS[card.category]} card, ${RARITY_LABELS[card.rarity]}, overall ${card.overall}`;

  return (
    <article
      className={`card card--${size}`}
      data-rarity={card.rarity}
      data-category={card.category}
      style={{ "--team-accent": team?.accent ?? "#8b919a" } as CSSProperties}
      aria-label={label}
    >
      <div className="card__frame">
        <header className="card__head">
          <div className="card__plate">
            <span className="card__overall">{card.overall}</span>
            <span className="card__category">{CATEGORY_LABELS[card.category]}</span>
          </div>
          <div className="card__tier">
            <span className="card__rarity">{RARITY_LABELS[card.rarity]}</span>
            {card.edition !== "standard" && <span className="card__edition">{EDITION_LABELS[card.edition]}</span>}
          </div>
        </header>

        <CardArt category={card.category} name={card.name} />

        <div className="card__id">
          <h3 className="card__name">{card.name}</h3>
          <p className="card__meta">
            <span>{team?.name ?? card.teamId}</span>
            <span>{card.season}</span>
          </p>
        </div>

        <dl className="card__stats" data-count={keys.length}>
          {keys.map((k) => (
            <div key={k} className="card__stat">
              <dt title={ATTRIBUTE_LABELS[k]?.label}>{ATTRIBUTE_LABELS[k]?.short ?? k}</dt>
              <dd>{attrs[k]}</dd>
            </div>
          ))}
        </dl>

        {(card.serialLimit !== null || card.estimated) && (
          <footer className="card__foot">
            {card.estimated && <span title={card.ratingNote}>Game estimate</span>}
            {card.serialLimit !== null && (
              <span className="card__serial">
                {serialNumber ? `#${serialNumber}` : "Limited"} of {card.serialLimit.toLocaleString("en-GB")}
              </span>
            )}
          </footer>
        )}
      </div>
    </article>
  );
}
