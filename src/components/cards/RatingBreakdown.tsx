import { ATTRIBUTE_LABELS, RARITY_BANDS, RARITY_LABELS } from "../../lib/cards/config.ts";
import { ratingBreakdown } from "../../lib/cards/rating.ts";
import type { RatedCardTemplate } from "../../lib/cards/types.ts";

const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RatingBreakdown({ card }: { card: RatedCardTemplate }) {
  const rows = ratingBreakdown(card.category, card.attributes as never);
  const exact = rows.reduce((s, r) => s + r.contribution, 0);
  const band = RARITY_BANDS[card.rarity];

  return (
    <section className="breakdown" aria-labelledby="breakdown-title">
      <h2 id="breakdown-title">How the overall rating is calculated</h2>
      <table className="breakdown__table">
        <thead>
          <tr>
            <th scope="col">Attribute</th>
            <th scope="col" className="num">Value</th>
            <th scope="col" className="num">Weight</th>
            <th scope="col" className="num">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">
                <span className="breakdown__label">{ATTRIBUTE_LABELS[r.key]?.label ?? r.key}</span>
                <span className="breakdown__bar" aria-hidden="true">
                  <span style={{ width: `${r.value}%` }} />
                </span>
              </th>
              <td className="num">{r.value}</td>
              <td className="num">{(r.weightBp / 100).toFixed(0)}%</td>
              <td className="num">{fmt(r.contribution)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Weighted total, rounded half up</th>
            <td />
            <td className="num">100%</td>
            <td className="num">
              {fmt(exact)} = <strong>{card.overall}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="breakdown__note">
        {RARITY_LABELS[card.rarity]} cards are rated {band.min}–{band.max}. Weights are set in one game configuration and the
        database recalculates every card when attributes change, so the rating shown here always matches the stored one.
      </p>
    </section>
  );
}
