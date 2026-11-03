// HTTP server: JSON API + Server-Sent Events for live updates + static client files.
// No dependencies: plain node:http. Every browser keeps one event stream open
// and sends actions with POST; the server is the only place game rules run.

import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { cryptoRng } from "../../lib/game/rng.ts";
import { RULES } from "../shared/rules.ts";
import type { Action } from "../shared/types.ts";
import { Lobby } from "./lobby.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Stream {
  res: ServerResponse;
  lobby: Lobby;
  managerId: string;
  sentVersion: number;
}

export interface ServerOptions {
  port: number;
  staticDir: string;
  /** For tests: clock override. */
  now?: () => number;
  log?: (msg: string) => void;
}

export function startServer(opts: ServerOptions) {
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? ((m: string) => console.log(m));
  const lobbies = new Map<string, Lobby>();
  const streams = new Set<Stream>();
  const rate = new Map<string, { n: number; at: number }>();
  const staticRoot = resolve(opts.staticDir);

  const deps = () => ({
    rng: cryptoRng(),
    newId: () => randomBytes(6).toString("base64url"),
    newToken: () => randomBytes(18).toString("base64url"),
  });

  function newCode(): string {
    for (;;) {
      let c = "";
      const bytes = randomBytes(RULES.codeLength);
      for (let i = 0; i < RULES.codeLength; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!lobbies.has(c)) return c;
    }
  }

  function json(res: ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(data) });
    res.end(data);
  }

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 16_384) return null;
      chunks.push(chunk as Buffer);
    }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  }

  function send(stream: Stream, event: string, data: unknown) {
    if (stream.res.writableEnded || stream.res.destroyed) {
      streams.delete(stream);
      return;
    }
    stream.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function pushState(lobby: Lobby, force = false) {
    const t = now();
    for (const s of streams) {
      if (s.lobby !== lobby) continue;
      if (!force && s.sentVersion === lobby.version) continue;
      s.sentVersion = lobby.version;
      send(s, "state", lobby.view(s.managerId, t));
    }
  }

  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json",
  };

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    const rel = pathname === "/" ? "/index.html" : pathname;
    const file = normalize(join(staticRoot, rel));
    if (!file.startsWith(staticRoot) || !existsSync(file) || !statSync(file).isFile()) {
      // Single-page app: unknown paths get the client.
      const index = join(staticRoot, "index.html");
      if (existsSync(index) && req.method === "GET" && !pathname.startsWith("/api/")) {
        res.writeHead(200, { "content-type": MIME[".html"] });
        createReadStream(index).pipe(res);
        return;
      }
      json(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    try {
      if (path === "/healthz") return json(res, 200, { ok: true, lobbies: lobbies.size });

      if (path === "/api/lobby" && req.method === "POST") {
        const body = await readBody(req);
        if (!body) return json(res, 400, { error: "Bad request." });
        const lobby = new Lobby(newCode(), (body.settings as object) ?? {}, now(), deps());
        const r = lobby.addManager(String(body.name ?? ""), now());
        if (!r.ok) return json(res, 400, { error: r.error });
        lobbies.set(lobby.code, lobby);
        log(`lobby ${lobby.code} created`);
        return json(res, 200, { code: lobby.code, token: r.value!.token, managerId: r.value!.id });
      }

      const m = /^\/api\/lobby\/([A-Za-z0-9]{5})(\/(join|stream|action))?$/.exec(path);
      if (m) {
        const lobby = lobbies.get(m[1].toUpperCase());
        const sub = m[3];
        if (!lobby) return json(res, 404, { error: "No lobby with that code. Check it with the host." });

        if (!sub && req.method === "GET") {
          return json(res, 200, { code: lobby.code, phase: lobby.phase, managers: lobby.managers.length, max: RULES.maxManagers });
        }

        if (sub === "join" && req.method === "POST") {
          const body = await readBody(req);
          if (!body) return json(res, 400, { error: "Bad request." });
          const r = lobby.addManager(String(body.name ?? ""), now());
          if (!r.ok) return json(res, 409, { error: r.error });
          pushState(lobby);
          return json(res, 200, { code: lobby.code, token: r.value!.token, managerId: r.value!.id });
        }

        if (sub === "stream" && req.method === "GET") {
          const mgr = lobby.byToken(url.searchParams.get("token") ?? "");
          if (!mgr) return json(res, 403, { error: "You’re not in this lobby. Join with the code." });
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          });
          res.write("retry: 1500\n\n");
          const stream: Stream = { res, lobby, managerId: mgr.id, sentVersion: -1 };
          res.on("error", () => streams.delete(stream));
          streams.add(stream);
          mgr.connected++;
          lobby.version++;
          pushState(lobby);
          req.on("close", () => {
            streams.delete(stream);
            mgr.connected = Math.max(0, mgr.connected - 1);
            lobby.version++;
          });
          return;
        }

        if (sub === "action" && req.method === "POST") {
          const body = await readBody(req);
          if (!body) return json(res, 400, { error: "Bad request." });
          const mgr = lobby.byToken(String(body.token ?? ""));
          if (!mgr) return json(res, 403, { error: "You’re not in this lobby." });
          const r0 = rate.get(mgr.token);
          const t = now();
          if (r0 && t - r0.at < 1000) {
            if (++r0.n > 40) return json(res, 429, { error: "Too many requests." });
          } else rate.set(mgr.token, { n: 1, at: t });
          const action = body.action as Action;
          if (!action || typeof action !== "object" || typeof action.type !== "string") return json(res, 400, { error: "Bad action." });
          const result = lobby.act(mgr.id, action, t);
          if (action.type === "leave") {
            for (const s of [...streams]) {
              if (s.lobby === lobby && s.managerId === mgr.id) {
                streams.delete(s);
                s.res.end();
              }
            }
          }
          pushState(lobby);
          return json(res, result.ok ? 200 : 409, result.ok ? { ok: true } : { ok: false, error: result.error });
        }
        return json(res, 405, { error: "Method not allowed." });
      }

      if (req.method === "GET") return serveStatic(req, res, path);
      return json(res, 404, { error: "Not found" });
    } catch (e) {
      log(`error ${path}: ${e instanceof Error ? e.stack : e}`);
      if (!res.headersSent) json(res, 500, { error: "Server error." });
      else res.end();
    }
  });

  // Game clock: advance every lobby, push changed state, stream race frames.
  let frameTick = 0;
  const clock = setInterval(() => {
    const t = now();
    frameTick++;
    for (const lobby of lobbies.values()) {
      // One broken lobby must never take the server down for everyone else.
      try {
        lobby.tick(t);
        pushState(lobby);
        if (lobby.phase === "race" && lobby.race && frameTick % 2 === 0) {
          const frame = lobby.race.frame();
          const events = lobby.race.events();
          for (const s of [...streams]) if (s.lobby === lobby) send(s, "frame", { ...frame, events, serverNow: t });
        }
      } catch (e) {
        log(`lobby ${lobby.code} tick error: ${e instanceof Error ? e.stack : e}`);
      }
    }
  }, 50);

  // Keep connections alive through proxies, and clean up abandoned lobbies.
  const keepAlive = setInterval(() => {
    for (const s of [...streams]) {
      if (s.res.writableEnded || s.res.destroyed) streams.delete(s);
      else s.res.write(": ping\n\n");
    }
    const t = now();
    for (const [code, lobby] of lobbies) {
      const online = lobby.managers.some((m) => !m.isBot && m.connected > 0);
      if (!online && t - lobby.lastActivity > 30 * 60_000) {
        lobbies.delete(code);
        log(`lobby ${code} removed (inactive)`);
      }
    }
  }, 15_000);

  server.listen(opts.port);
  return {
    server,
    lobbies,
    close: () =>
      new Promise<void>((done) => {
        clearInterval(clock);
        clearInterval(keepAlive);
        for (const s of streams) s.res.end();
        server.close(() => done());
      }),
  };
}
