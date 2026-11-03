import { randomsEntryCost } from "../../lib/game/actions.ts";
import { QUICK_RACE, RANDOMS } from "../../lib/game/config.ts";
import type { GameState } from "../../lib/game/state.ts";

interface Mode {
  id: string;
  name: string;
  available: boolean;
  description: string;
  rules: string[];
  entry: string;
  rewards: string;
  href?: string;
  unavailableReason?: string;
}

export function Modes({ state }: { state: GameState }) {
  const cost = randomsEntryCost(state, new Date());
  const modes: Mode[] = [
    {
      id: "randoms",
      name: "Randoms",
      available: true,
      href: "#/randoms",
      description: "Draft a team from random cards you don’t need to own, then race it against three AI teams.",
      rules: [
        `Three draft rounds: car, driver, pit crew. Each round offers ${RANDOMS.optionsPerRound} random cards; pick one within ${RANDOMS.secondsPerPick} seconds or the highest-rated is picked for you.`,
        "Race conditions (dry, wet or high tyre wear) are revealed after the draft. Then choose a strategy.",
        "Drafted cards are only for this run, unless you win.",
      ],
      entry: cost === 0 ? `Free (first run today), then ${RANDOMS.entryFee} coins` : `${RANDOMS.entryFee} coins (today’s free run is used)`,
      rewards: `${RANDOMS.coinRewards.join(" / ")} coins for P1–P4. A win also lets you keep one drafted card.`,
    },
    {
      id: "quick-race",
      name: "Quick race (single player)",
      available: true,
      href: "#/team",
      description: "Race the team you built from your own collection against three AI teams.",
      rules: ["Uses your saved driver, car and pit crew.", "Random conditions; you choose the strategy."],
      entry: "Free. Needs a complete team.",
      rewards: `${QUICK_RACE.coinRewards.join(" / ")} coins for P1–P4, for the first ${QUICK_RACE.rewardedRacesPerDay} races each day.`,
    },
    {
      id: "multiplayer",
      name: "Multiplayer",
      available: false,
      description: "Race other players’ teams.",
      rules: [],
      entry: "Needs an account",
      rewards: "To be decided",
      unavailableReason: "Needs accounts and a server to check teams and results. Not built yet.",
    },
    {
      id: "auctions",
      name: "Auction house",
      available: false,
      description: "Buy and sell cards with other players.",
      rules: [],
      entry: "Needs an account",
      rewards: "Not applicable",
      unavailableReason: "Needs a server so sales are secure. Not built yet.",
    },
    {
      id: "trading",
      name: "Trading",
      available: false,
      description: "Swap cards directly with other players.",
      rules: [],
      entry: "Needs an account",
      rewards: "Not applicable",
      unavailableReason: "Needs a server so trades are secure. Not built yet.",
    },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Game modes</h1>
      </div>
      <div className="mode-grid">
        {modes.map((m) => (
          <section key={m.id} className={`panel mode${m.available ? "" : " mode--off"}`} aria-labelledby={`mode-${m.id}`}>
            <h2 id={`mode-${m.id}`}>{m.name}</h2>
            <p>{m.description}</p>
            {m.rules.length > 0 && (
              <ul className="rules">
                {m.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            <dl className="facts">
              <div><dt>Entry</dt><dd>{m.entry}</dd></div>
              <div><dt>Rewards</dt><dd>{m.rewards}</dd></div>
            </dl>
            {m.available ? (
              <a className="button button--primary" href={m.href}>Play {m.name.split(" (")[0]}</a>
            ) : (
              <p className="unavailable">
                <span className="tag tag--muted">Not available yet</span> {m.unavailableReason}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
