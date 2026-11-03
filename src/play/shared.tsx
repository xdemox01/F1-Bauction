import { Card } from "../components/cards/Card.tsx";
import { TEAMS } from "../lib/cards/seed.ts";
import type { RatedCardTemplate } from "../lib/cards/types.ts";
import { STRATEGY_RULES } from "../lib/game/config.ts";
import { CONDITION_LABELS } from "../lib/game/config.ts";
import type { Condition } from "../lib/game/config.ts";
import { requireTemplate } from "../lib/game/catalogue.ts";
import type { EntrantResult } from "../lib/game/race.ts";

export const teamById = new Map(TEAMS.map((t) => [t.id, t]));

export const coinsLabel = (n: number) => `${n.toLocaleString("en-GB")} coins`;

export function GameCard({ card, size }: { card: RatedCardTemplate; size?: "md" | "lg" }) {
  return <Card card={card} team={teamById.get(card.teamId)} size={size} />;
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error-line" role="alert">
      {error}
    </p>
  );
}

const ordinal = (n: number) => `P${n}`;

export function RaceTable({ result, conditions }: { result: EntrantResult[]; conditions: Condition }) {
  return (
    <div className="table-wrap">
      <table className="race-table">
        <caption>
          {CONDITION_LABELS[conditions].label} conditions. Race score = team score + strategy pace + random variation.
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Team</th>
            <th scope="col">Driver / car / crew</th>
            <th scope="col">Strategy</th>
            <th scope="col" className="num">Team score</th>
            <th scope="col" className="num">Pace</th>
            <th scope="col" className="num">Variation</th>
            <th scope="col" className="num">Race score</th>
          </tr>
        </thead>
        <tbody>
          {result.map((r) => (
            <tr key={r.id} className={r.isPlayer ? "is-player" : undefined}>
              <td>{r.retired ? "DNF" : ordinal(r.position)}</td>
              <th scope="row">{r.name}</th>
              <td className="small">
                {requireTemplate(r.slugs.driver).name} / {requireTemplate(r.slugs.car).name} / {requireTemplate(r.slugs.pit_crew).name}
              </td>
              <td>{STRATEGY_RULES[r.strategy].label}</td>
              <td className="num">{r.teamScore.total.toFixed(2)}</td>
              <td className="num">{r.paceDelta > 0 ? `+${r.paceDelta}` : r.paceDelta}</td>
              <td className="num">{r.variance > 0 ? `+${r.variance.toFixed(2)}` : r.variance.toFixed(2)}</td>
              <td className="num strong">{r.retired ? "Retired" : r.raceScore!.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
