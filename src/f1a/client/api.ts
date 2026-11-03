// Talking to the game server: REST for actions, Server-Sent Events for live state.

import { useEffect, useRef, useState } from "react";

import type { Settings } from "../shared/rules.ts";
import type { Action, LobbyView, RaceFrame } from "../shared/types.ts";
import { localHub } from "./localHub.ts";

declare const __LOCAL_MODE__: boolean;
/** Test version: the game runs inside this page (no server); play against AI managers. */
export const LOCAL_MODE = typeof __LOCAL_MODE__ !== "undefined" && __LOCAL_MODE__;

export interface SessionInfo {
  code: string;
  token: string;
  managerId: string;
}

const KEY = "grid-auction.session";

export function savedSession(): SessionInfo | null {
  if (LOCAL_MODE) return null; // in-page lobbies don't survive a reload
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionInfo) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: SessionInfo | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts for this tab */
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: "The server sent an unreadable reply." }));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export const createLobby = async (name: string, settings: Partial<Settings>): Promise<SessionInfo> =>
  LOCAL_MODE ? localHub().create(name, settings) : post<SessionInfo>("/api/lobby", { name, settings });
export const joinLobby = async (code: string, name: string): Promise<SessionInfo> => {
  if (LOCAL_MODE) throw new Error("Joining friends needs the online game server. In this test version, create a lobby and add AI managers.");
  return post<SessionInfo>(`/api/lobby/${encodeURIComponent(code.toUpperCase())}/join`, { name });
};
export const sendAction = async (s: SessionInfo, action: Action): Promise<{ ok: true }> => {
  if (LOCAL_MODE) {
    localHub().act(s.code, s.token, action);
    return { ok: true };
  }
  return post<{ ok: true }>(`/api/lobby/${s.code}/action`, { token: s.token, action });
};

export interface FrameState {
  frame: RaceFrame & { events?: { t: number; carId: string; text: string }[]; order?: string[] };
  receivedAt: number;
}

export type StreamStatus = "connecting" | "live" | "reconnecting" | "lost";

/** Live lobby state. Reconnects automatically (refreshing the page also reconnects). */
export function useLobbyStream(session: SessionInfo | null, onGone: () => void) {
  const [view, setView] = useState<LobbyView | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const frame = useRef<FrameState | null>(null);
  const offset = useRef(0);
  const gone = useRef(onGone);
  gone.current = onGone;

  useEffect(() => {
    if (!session) return;
    if (LOCAL_MODE) {
      const unsub = localHub().subscribe(
        session.code,
        session.token,
        (v) => {
          offset.current = 0;
          setStatus("live");
          setView(v);
        },
        (f) => {
          frame.current = { frame: f, receivedAt: performance.now() };
        },
      );
      if (!unsub) gone.current();
      return () => unsub?.();
    }
    let closed = false;
    let es: EventSource | null = null;
    let failures = 0;
    const open = () => {
      es = new EventSource(`/api/lobby/${session.code}/stream?token=${encodeURIComponent(session.token)}`);
      es.addEventListener("state", (e) => {
        const v = JSON.parse((e as MessageEvent).data) as LobbyView;
        offset.current = v.serverNow - Date.now();
        failures = 0;
        setStatus("live");
        setView(v);
      });
      es.addEventListener("frame", (e) => {
        const f = JSON.parse((e as MessageEvent).data);
        offset.current = f.serverNow - Date.now();
        frame.current = { frame: f, receivedAt: performance.now() };
      });
      es.onerror = async () => {
        if (closed) return;
        es?.close();
        failures++;
        setStatus(failures > 6 ? "lost" : "reconnecting");
        // Is the lobby (or our seat) still there?
        try {
          const r = await fetch(`/api/lobby/${session.code}`);
          if (r.status === 404) {
            gone.current();
            return;
          }
        } catch {
          /* offline: keep retrying */
        }
        setTimeout(() => !closed && open(), Math.min(5000, 500 * failures));
      };
    };
    open();
    return () => {
      closed = true;
      es?.close();
    };
  }, [session]);

  return { view, status, frame, serverNow: () => Date.now() + offset.current };
}
