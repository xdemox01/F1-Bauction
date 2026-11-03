import { useState } from "react";

export function Settings({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <section className="panel">
        <h2>Where your progress is saved</h2>
        <p>
          This is a local prototype. Your coins, cards and team are saved in this browser’s local storage on this device only. They won’t follow
          you to another browser or device, and clearing site data deletes them.
        </p>
        <p>
          Local storage can be edited by anyone using the browser’s developer tools, so nothing here is secure. That’s acceptable for a
          single-player prototype, which is why auctions, trading and multiplayer stay switched off until the game runs on a server with
          accounts.
        </p>
      </section>
      <section className="panel">
        <h2>Start over</h2>
        <p>Deletes your cards, coins, team and history, and starts a new game.</p>
        {done && <p role="status">A new game has started.</p>}
        {!confirming ? (
          <button type="button" className="button" onClick={() => { setConfirming(true); setDone(false); }}>
            Reset my game
          </button>
        ) : (
          <div className="confirm" role="group" aria-label="Confirm reset">
            <p>This can’t be undone.</p>
            <button type="button" className="button button--danger" onClick={() => { onReset(); setConfirming(false); setDone(true); }}>
              Yes, delete everything
            </button>
            <button type="button" className="button button--quiet" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        )}
      </section>
    </div>
  );
}
