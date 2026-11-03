// Single configurable location for card ratings.
// The same values are written into the database (game_config table) by the
// seed generator, and the database recomputes overall ratings with them, so
// the UI, tests and database always agree. Changing a weight here requires
// regenerating supabase/seed.sql (npm run seed:generate).

import type { AttributesByCategory, CardCategory, Edition, Rarity } from "./types.ts";

export const RATING_CONFIG_VERSION = 1;

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 99;

/**
 * Weights in basis points (1/100 of a percent). Each category must sum to 10 000.
 * Integer weights keep TypeScript and SQL results identical (no float drift).
 */
export const RATING_WEIGHTS: {
  [C in CardCategory]: Record<keyof AttributesByCategory[C], number>;
} = {
  driver: {
    pace: 2800,
    racecraft: 2200,
    consistency: 1800,
    tyre_management: 1200,
    wet_weather: 1000,
    experience: 1000,
  },
  car: {
    pace: 2500,
    aero: 2500,
    straight_line_speed: 2000,
    tyre_management: 1500,
    reliability: 1500,
  },
  pit_crew: {
    pit_stop_speed: 4000,
    consistency: 2500,
    coordination: 2000,
    reliability: 1500,
  },
};

/** Inclusive overall-rating band each rarity must fall in. Bands do not overlap. */
export const RARITY_BANDS: Record<Rarity, { min: number; max: number }> = {
  common: { min: 1, max: 69 },
  rare: { min: 70, max: 77 },
  epic: { min: 78, max: 84 },
  mythic: { min: 85, max: 90 },
  apex: { min: 91, max: 99 },
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  mythic: "Mythic",
  apex: "Apex",
};

export const EDITION_LABELS: Record<Edition, string> = {
  standard: "Standard",
  rookie: "Rookie",
  elite: "Elite",
  championship: "Championship",
  legendary: "Legendary",
  special_event: "Special Event",
};

export const CATEGORY_LABELS: Record<CardCategory, string> = {
  driver: "Driver",
  car: "Car",
  pit_crew: "Pit Crew",
};

export const ATTRIBUTE_LABELS: Record<string, { label: string; short: string }> = {
  pace: { label: "Pace", short: "PAC" },
  racecraft: { label: "Racecraft", short: "RCR" },
  consistency: { label: "Consistency", short: "CON" },
  tyre_management: { label: "Tyre management", short: "TYR" },
  wet_weather: { label: "Wet weather", short: "WET" },
  experience: { label: "Experience", short: "EXP" },
  aero: { label: "Aerodynamics", short: "AER" },
  straight_line_speed: { label: "Straight-line speed", short: "SPD" },
  reliability: { label: "Reliability", short: "REL" },
  pit_stop_speed: { label: "Pit-stop speed", short: "PIT" },
  coordination: { label: "Coordination", short: "CRD" },
};
