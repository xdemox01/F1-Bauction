// LOCAL PROTOTYPE PERSISTENCE (localStorage).
//
// Limitations, deliberately visible in the UI:
// * The save lives in one browser on one device. Clearing site data deletes it.
// * Anyone can edit it with developer tools, so coins and cards here are not
//   secure. This is fine for a single-player prototype and NOT acceptable for
//   auctions, trading or multiplayer, which need the server/database.

import { applyAction } from "./actions.ts";
import type { Action, ActionResult } from "./actions.ts";
import { createInitialState, parseSavedState } from "./state.ts";
import type { Ctx, GameState } from "./state.ts";

export const SAVE_KEY = "parc-ferme.save.v1";
export const BACKUP_KEY = "parc-ferme.save.unreadable";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult = { state: GameState; notice: string | null };

export function loadGame(store: KeyValueStore, ctx: Ctx): LoadResult {
  let raw: string | null = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { state: createInitialState(ctx), notice: "This browser blocks local storage, so progress won’t be saved." };
  }
  if (raw === null) {
    const state = createInitialState(ctx);
    saveGame(store, state);
    return { state, notice: null };
  }
  let parsed: GameState | null = null;
  try {
    parsed = parseSavedState(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (parsed) return { state: parsed, notice: null };
  try {
    store.setItem(BACKUP_KEY, raw);
  } catch {
    /* ignore */
  }
  const state = createInitialState(ctx);
  saveGame(store, state);
  return { state, notice: "Your saved game couldn’t be read, so a new game was started. The old data was kept as a backup." };
}

export function saveGame(store: KeyValueStore, state: GameState): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies an action to the LATEST saved state (not a possibly stale copy in
 * memory), then saves. This stops two open tabs from spending the same coins.
 */
export function dispatchAndSave(store: KeyValueStore, inMemory: GameState, action: Action, ctx: Ctx): ActionResult & { saved: boolean } {
  let current = inMemory;
  try {
    const raw = store.getItem(SAVE_KEY);
    const latest = raw ? parseSavedState(JSON.parse(raw)) : null;
    if (latest && latest.revision >= inMemory.revision) current = latest;
  } catch {
    /* fall back to in-memory state */
  }
  const result = applyAction(current, action, ctx);
  if (!result.ok || result.state === current) return { ...result, saved: true };
  const saved = saveGame(store, result.state);
  return { ...result, saved };
}

export function resetGame(store: KeyValueStore, ctx: Ctx): GameState {
  const state = createInitialState(ctx);
  saveGame(store, state);
  return state;
}
