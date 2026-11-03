// Data access for the card catalogue.
//
// Milestone 1 serves the local seed (the same data written to supabase/seed.sql).
// Milestone 2 adds a Supabase-backed implementation behind this same interface,
// once auth and a Supabase project are configured. The UI always shows which
// source is in use so seed data is never mistaken for live data.

import { templateOverall } from "../cards/rating.ts";
import { CARD_TEMPLATES, DRIVERS, TEAMS } from "../cards/seed.ts";
import type { Driver, RatedCardTemplate, Team } from "../cards/types.ts";

export interface CatalogueSource {
  kind: "local-seed" | "database";
  label: string;
}

export interface CatalogueRepository {
  source: CatalogueSource;
  listTemplates(): Promise<RatedCardTemplate[]>;
  getTemplate(slug: string): Promise<RatedCardTemplate | null>;
  listTeams(): Promise<Team[]>;
  getDriver(id: string): Promise<Driver | null>;
}

const rated: RatedCardTemplate[] = CARD_TEMPLATES.map((t) => ({ ...t, overall: templateOverall(t) }));

export const localSeedRepository: CatalogueRepository = {
  source: { kind: "local-seed", label: "Local seed data (not connected to a database yet)" },
  async listTemplates() {
    return rated;
  },
  async getTemplate(slug) {
    return rated.find((t) => t.slug === slug) ?? null;
  },
  async listTeams() {
    return TEAMS;
  },
  async getDriver(id) {
    return DRIVERS.find((d) => d.id === id) ?? null;
  },
};

export function getCatalogueRepository(): CatalogueRepository {
  return localSeedRepository;
}
