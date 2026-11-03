import { useCallback, useEffect, useRef, useState } from "react";

import type { Action, ActionResult } from "../lib/game/actions.ts";
import { cryptoRng } from "../lib/game/rng.ts";
import { parseSavedState } from "../lib/game/state.ts";
import type { Ctx, GameState } from "../lib/game/state.ts";
import { dispatchAndSave, loadGame, resetGame, SAVE_KEY } from "../lib/game/storage.ts";

export const makeCtx = (): Ctx => ({ rng: cryptoRng(), now: new Date(), newId: () => crypto.randomUUID() });

function browserStore() {
  try {
    return window.localStorage;
  } catch {
    // Storage blocked: keep the game playable in memory for this visit.
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
}

export interface GameApi {
  state: GameState;
  notice: string | null;
  dismissNotice(): void;
  dispatch(action: Action): ActionResult;
  reset(): void;
}

export function useGame(): GameApi {
  const store = useRef(browserStore()).current;
  const [{ state: initial, notice: initialNotice }] = useState(() => loadGame(store, makeCtx()));
  const [state, setState] = useState(initial);
  const [notice, setNotice] = useState(initialNotice);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Another tab saved: pick up its state.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || !e.newValue) return;
      try {
        const next = parseSavedState(JSON.parse(e.newValue));
        if (next) setState(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      const result = dispatchAndSave(store, stateRef.current, action, makeCtx());
      if (result.ok) {
        stateRef.current = result.state;
        setState(result.state);
        if (!result.saved) setNotice("Progress couldn’t be saved in this browser. It will be lost when you close the page.");
      }
      return result;
    },
    [store],
  );

  const reset = useCallback(() => {
    const fresh = resetGame(store, makeCtx());
    stateRef.current = fresh;
    setState(fresh);
  }, [store]);

  return { state, notice, dismissNotice: () => setNotice(null), dispatch, reset };
}
