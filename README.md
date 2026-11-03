# Grid Auction (project: F1 FootbAuction)

A multiplayer F1-themed auction game modelled on FootbAuction's gameplay: managers join a lobby with a
5-character code, bid for drivers, cars, pit crews and team principals with 100 credits, set their lineup,
then race a championship in 3D. Unofficial fan project: not affiliated with Formula 1, the FIA, any team,
or FootbAuction. Ratings are subjective game estimates.

## Run it (no npm install needed)

Requires **Node.js 22.18 or newer** (it runs the TypeScript server directly). The browser client is
already built into `public/f1a/`.

```bash
node src/f1a/server/main.ts            # or: npm start
# open http://localhost:3000
```

- **Friends on the same Wi-Fi:** they open `http://<your computer's IP>:3000` (allow Node through your
  firewall when asked).
- **Friends anywhere:** deploy the server (below) and share its address.

### Deploy for internet play

- **Render:** push this folder to a GitHub repository, then on render.com choose *New → Blueprint* and pick
  it. `render.yaml` sets everything up (free plan works; it sleeps when idle).
- **Docker / any host:** `docker build -t grid-auction . && docker run -p 3000:3000 grid-auction`.
- Any Node 22.18+ host works: start command `node src/f1a/server/main.ts`, port from `PORT`.

Game state lives in the server's memory: restarting the server ends running games.

## How a game works

| Stage | What happens |
|---|---|
| Landing | **Create a lobby** (name, player pool, era, Classic/Blind auction, Race Manager/Arcade Driving, laps, races) or **Join a lobby** (name + code). Invite links `/?join=CODE` open the join form directly. |
| Lobby | 2–10 managers. Host changes settings (everyone sees them live), can add AI managers, and starts the auction. Copy code / Copy link, unique team colours. |
| Auction | One item at a time: drivers → cars → pit crews → team principals. 10-second clock, reset by every bid. **+1 / +10 / +20** or a custom amount added to the current bid; **I'm out**. Sold when everyone else is out or the clock runs out. |
| Lineup (60 s) | Choose two race drivers from your three (the third is the reserve) and a strategy: Balanced, Aggressive or Conservative. |
| Review (45 s) | Check every team's lineup; starts when everyone is ready. |
| Championship | 1, 3 or 5 races. **Race Manager:** both your drivers race; you make live calls per car (pace, boost, box). **Arcade Driving:** you drive your lead driver yourself (arrows/WASD, Space boost, P pit). Points 25-18-15-12-10-8-6-4-2-1 per car; team points add up. |
| Final | Final table, race winners and the winning squad. The host can start a new auction with the same lobby. |

### Auction rules (adapted from FootbAuction's published rules)

- 100 credits each, no way to earn more. Squad: 3 drivers, 1 car, 1 pit crew, 1 team principal.
- 1 credit is reserved for every other empty slot, so the biggest first bid is 95.
- You can't bid while leading, and can't drop out while leading.
- No bids: every manager still needing that position pays 1 credit (never touching their reserve).
- A manager who can only afford 1 credit per slot opens the lot at 1 automatically.
- The only manager still needing a position gets it for 1 credit (free if they have none left).
- An offered item never returns. Pools that run out use clearly fictional fillers.
- **Blind mode:** individual ratings are hidden from everyone (team overall optional before racing).

### Player pools

Global F1, Current Grid (2026 entries), Legends (retired drivers, classic cars, crews and principals),
Custom (pick teams). Era: current drivers or all-time. Academy drivers and privateer items are fictional.

### What the cards do on track

Driver pace and car aero set cornering grip; straight-line speed sets top speed; tyre management sets wear;
experience and consistency reduce mistakes; the pit crew sets stop times and slow-stop risk; the team
principal improves pit timing (strategy), consistency (leadership) and car performance (development).

## Security model

The server is authoritative: every bid, sale, lineup and race result is validated and computed on the
server. Browsers only send requests and get personal views (Blind mode ratings are removed on the server).
Each manager has a secret token. In Arcade mode a driver's browser reports its car; the server rejects
impossible speeds or jumps and hands a silent car to the AI after 5 seconds. A determined cheater could
still drive "perfectly" within physical limits; competitive play would need server-side driving.

## Tests

```bash
npm test               # 98 unit tests (auction rules, lobby flow, races, physics, earlier prototypes)
npm run test:e2e       # real server + several browsers playing full games (needs Playwright)
npm run test:db        # database schema tests (needs PostgreSQL binaries)
```

## Project layout

```
src/f1a/server/    multiplayer server: lobby + auction rules, race runner, HTTP/SSE
src/f1a/shared/    rules, item pools, message types (used by server and browser)
src/f1a/client/    browser client (built into public/f1a/)
src/grid/engine/   track, race physics, AI drivers, stats → performance
src/grid/render/   WebGL 3D renderer
public/f1a/        built multiplayer client (served by the server)
public/game/       earlier single-player prototype (auction vs AI + 3D race)
public/play/       earlier card-collection prototype (packs, Randoms)
supabase/          database schema from milestone 1 (not used by the game yet)
```

Rebuild the client after changes: `npm install && npm run build:play`.
