// Overall rating formula (documented in docs/ratings.md):
//
//   overall = round_half_up( Σ (attribute × weight_bp) / 10 000 )
//
// computed in integer arithmetic. The database function compute_overall()
// in supabase/migrations implements the identical formula.

import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, RARITY_BANDS, RATING_WEIGHTS } from "./config.ts";
import { RARITIES } from "./types.ts";
import type { AttributesByCategory, CardCategory, CardTemplate, Rarity } from "./types.ts";

export interface AttributeContribution {
  key: string;
  value: number;
  weightBp: number;
  /** value × weight, in rating points (may be fractional). */
  contribution: number;
}

export function attributeKeys<C extends CardCategory>(category: C): (keyof AttributesByCategory[C] & string)[] {
  return Object.keys(RATING_WEIGHTS[category]) as (keyof AttributesByCategory[C] & string)[];
}

export function validateAttributes<C extends CardCategory>(
  category: C,
  attributes: AttributesByCategory[C],
): string[] {
  const errors: string[] = [];
  const expected = attributeKeys(category);
  const given = Object.keys(attributes);
  for (const key of expected) {
    const value = (attributes as unknown as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errors.push(`${key} must be an integer`);
    } else if (value < ATTRIBUTE_MIN || value > ATTRIBUTE_MAX) {
      errors.push(`${key} must be between ${ATTRIBUTE_MIN} and ${ATTRIBUTE_MAX}`);
    }
  }
  for (const key of given) {
    if (!expected.includes(key as never)) errors.push(`${key} is not a ${category} attribute`);
  }
  return errors;
}

export function ratingBreakdown<C extends CardCategory>(
  category: C,
  attributes: AttributesByCategory[C],
): AttributeContribution[] {
  const weights = RATING_WEIGHTS[category] as Record<string, number>;
  return attributeKeys(category).map((key) => {
    const value = (attributes as unknown as Record<string, number>)[key];
    const weightBp = weights[key];
    return { key, value, weightBp, contribution: (value * weightBp) / 10_000 };
  });
}

export function computeOverall<C extends CardCategory>(
  category: C,
  attributes: AttributesByCategory[C],
): number {
  const errors = validateAttributes(category, attributes);
  if (errors.length) throw new Error(`Invalid ${category} attributes: ${errors.join("; ")}`);
  const weights = RATING_WEIGHTS[category] as Record<string, number>;
  let total = 0;
  for (const key of attributeKeys(category)) {
    total += (attributes as unknown as Record<string, number>)[key] * weights[key];
  }
  // Integer round-half-up; total is always a non-negative integer.
  return Math.floor((total + 5_000) / 10_000);
}

export function rarityForOverall(overall: number): Rarity {
  for (const rarity of RARITIES) {
    const band = RARITY_BANDS[rarity];
    if (overall >= band.min && overall <= band.max) return rarity;
  }
  throw new Error(`Overall ${overall} is outside every rarity band`);
}

export function isOverallInRarityBand(overall: number, rarity: Rarity): boolean {
  const band = RARITY_BANDS[rarity];
  return overall >= band.min && overall <= band.max;
}

export function templateOverall(template: CardTemplate): number {
  // The discriminated union guarantees attributes match the category.
  return computeOverall(template.category, template.attributes as never);
}

/** Validates everything a template must satisfy before it is stored. */
export function validateTemplate(template: CardTemplate): string[] {
  const errors = validateAttributes(template.category, template.attributes as never);
  if (errors.length) return errors.map((e) => `${template.slug}: ${e}`);
  const overall = templateOverall(template);
  if (!isOverallInRarityBand(overall, template.rarity)) {
    const band = RARITY_BANDS[template.rarity];
    errors.push(
      `${template.slug}: overall ${overall} is outside the ${template.rarity} band ${band.min}-${band.max}`,
    );
  }
  if (template.serialLimit !== null && (!Number.isInteger(template.serialLimit) || template.serialLimit < 1)) {
    errors.push(`${template.slug}: serialLimit must be a positive integer or null`);
  }
  return errors;
}
