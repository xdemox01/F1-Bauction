import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";

import { performance as perfOf } from "../../grid/engine/performance.ts";
import { cornerLimit, createRace, lineOffset, maxSteer, speedKmh, step } from "../../grid/engine/race.ts";
import { sampleAt } from "../../grid/engine/track.ts";
import type { Entry, PaceMode, Race } from "../../grid/engine/race.ts";
import { buildTrack } from "../../grid/engine/track.ts";
import { assistHint, gearbox, speedProfile } from "../../grid/engine/assist.ts";
import { CAMERA_LABELS, RaceScene } from "../../grid/render/scene.ts";
import type { CameraMode } from "../../grid/render/scene.ts";
import { cryptoRng } from "../../lib/game/rng.ts";
import { CATALOGUE } from "../../lib/game/catalogue.ts";
import { STRATEGY_INFO } from "../shared/rules.ts";
import type { Action, LobbyView, RaceEntryView } from "../shared/types.ts";
import { FLAG } from "../shared/types.ts";
import type { FrameState } from "./api.ts";
import { Swatch, useCountdown } from "./ui.tsx";

const TRACK = buildTrack();
const CAMERAS: CameraMode[] = ["chase", "tv", "cockpit", "overview"];
// Stand-in physics for cars simulated on the server (only their positions are drawn here).
const DUMMY_PERF = perfOf({
  driver: CATALOGUE.find((c) => c.category === "driver")!,
  car: CATALOGUE.find((c) => c.category === "car")!,
  pit_crew: CATALOGUE.find((c) => c.category === "pit_crew")!,
});

interface CarHud {
  id: string;
  name: string;
  color: string;
  managerId: string;
  pos: number;
  lap: number;
  speed: number;
  boost: number;
  boosting: boolean;
  wear: number;
  inPit: boolean;
  pitRequested: boolean;
  stops: number;
  penalties: number;
  finished: boolean;
}

export function RaceMP({
  view,
  act,
  serverNow,
  frameRef,
}: {
  view: LobbyView;
  act: (a: Action) => Promise<string | null>;
  serverNow: () => number;
  frameRef: MutableRefObject<FrameState | null>;
}) {
  const race = view.race!;
  const me = view.managers.find((m) => m.isYou)!;
  const arcade = race.mode === "arcade";
  const myEntries = race.entries.filter((e) => e.managerId === me.id);
  const myArcadeCar = arcade ? myEntries.find((e) => e.human && e.perf) : undefined;
  const driving = !!myArcadeCar;
  const managerName = (id: string) => view.managers.find((m) => m.id === id)?.name ?? "";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<CameraMode>(driving ? "chase" : "tv");
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [follow, setFollow] = useState(myArcadeCar?.carId ?? myEntries[0]?.carId ?? race.entries[0].carId);
  const followRef = useRef(follow);
  followRef.current = follow;
  const keys = useRef(new Set<string>());
  const pitPressed = useRef(false);
  const resetPressed = useRef(false);
  const [showLine, setShowLine] = useState(true);
  const lineRef = useRef(showLine);
  lineRef.current = showLine;
  const [drive, setDrive] = useState<{ kmh: number; gear: number; rpm: number; hint: string; boost: number; offTrack: boolean } | null>(null);
  const [hud, setHud] = useState<{ cars: CarHud[]; t: number; events: string[] }>({ cars: [], t: -3, events: [] });
  const [commands, setCommands] = useState<Record<string, { pace: PaceMode; boost: boolean }>>(() => {
    const def = { balanced: { pace: "normal", boost: true }, aggressive: { pace: "push", boost: true }, conservative: { pace: "save", boost: false } }[me.strategy] as { pace: PaceMode; boost: boolean };
    return Object.fromEntries(myEntries.map((e) => [e.carId, { ...def }]));
  });
  const [glError, setGlError] = useState<string | null>(null);
  const stageLeft = useCountdown(race.stageEndsAt, serverNow, 250);

  // A local copy of the race used for drawing (and, in Arcade, for driving your own car).
  const display = useMemo<Race>(() => {
    const entries: Entry[] = race.entries.map((e: RaceEntryView) => ({
      id: e.carId,
      name: e.driverName,
      color: e.color,
      isPlayer: e.carId === myArcadeCar?.carId,
      perf: e.perf ?? DUMMY_PERF,
      gridScore: 0,
    }));
    const r = createRace(TRACK, entries, { laps: race.laps, mode: "drive" });
    for (const c of r.cars) c.remote = c.id !== myArcadeCar?.carId;
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race.index, race.entries.map((e) => e.carId + e.human).join()]);

  // Keyboard (Arcade driving + camera)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) && driving) e.preventDefault();
      if (e.repeat) return;
      if (k === "c") setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]);
      if (k === "p") pitPressed.current = true;
      if (k === "r") resetPressed.current = true;
      if (k === "l") setShowLine((v) => !v);
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [driving]);

  // Render loop: apply server frames, drive own car (Arcade), draw.
  useEffect(() => {
    let scene: RaceScene | null = null;
    try {
      scene = new RaceScene(canvasRef.current!, overlayRef.current!, TRACK, display.cars.map((c) => ({ id: c.id, color: c.color })));
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "WebGL failed to start.");
    }
    const rng = cryptoRng();
    const L = TRACK.length;
    let last = performance.now();
    let lastReport = 0;
    let hudTimer = 0;
    let raf = 0;
    const own = display.cars.find((c) => c.id === myArcadeCar?.carId);
    const loop = (nowMs: number) => {
      const dt = Math.min(0.25, (nowMs - last) / 1000);
      last = nowMs;
      const fs = frameRef.current;
      if (fs) {
        const f = fs.frame;
        const age = Math.min(0.3, (nowMs - fs.receivedAt) / 1000);
        for (const tuple of f.cars) {
          const [id, s, d, v, lap, boost, flags, wear, pen, stops, yaw] = tuple;
          const car = display.cars.find((c) => c.id === id);
          if (!car || car === own) continue;
          const finished = (flags & FLAG.finished) !== 0;
          let ss = s + (finished || race.stage !== "running" ? 0 : v * age);
          let ll = lap;
          if (ss >= L) {
            ss -= L;
            ll += 1;
          }
          car.s = ss;
          car.d = d;
          car.yaw += ((yaw ?? 0) - car.yaw) * Math.min(1, dt * 10);
          car.v = v;
          car.lap = ll;
          car.boost = boost;
          car.boosting = (flags & FLAG.boosting) !== 0;
          car.offTrack = (flags & FLAG.offTrack) !== 0;
          car.sliding = (flags & FLAG.sliding) !== 0;
          car.pitRequested = (flags & FLAG.pitRequested) !== 0;
          car.pit = flags & FLAG.pit ? { phase: "stopped", remaining: 0, duration: 0, slow: false } : null;
          car.wear = wear;
          car.penalties = pen;
          car.finished = finished;
          car.pitStops = Array.from({ length: Math.max(stops, finished ? 1 : 0) }, () => 0);
          car.finishTime = finished ? f.order.indexOf(id) : null;
        }
        if (Math.abs(display.t - f.t) > 0.3 || race.stage !== "running") display.t = f.t;
      }
      // Arcade: simulate and report your own car.
      if (own && race.stage === "running" && !own.finished) {
        const k = keys.current;
        step(
          display,
          dt,
          {
            player: {
              throttle: k.has("arrowup") || k.has("w") ? 1 : 0,
              brake: k.has("arrowdown") || k.has("s") ? 1 : 0,
              steer: (k.has("arrowleft") || k.has("a") ? 1 : 0) - (k.has("arrowright") || k.has("d") ? 1 : 0),
              boost: k.has(" ") || k.has("shift"),
              reset: resetPressed.current,
            },
            playerPit: pitPressed.current,
          },
          rng,
        );
        pitPressed.current = false;
        resetPressed.current = false;
        // Test hook only: automated browser tests hand the car to the AI driver to finish an Arcade race.
        if ((window as unknown as { __autopilot?: boolean }).__autopilot && own.isPlayer) {
          own.isPlayer = false;
          own.commands = { pace: "normal", boost: true };
        }
        if (nowMs - lastReport > 100) {
          lastReport = nowMs;
          void act({
            type: "arcadeState",
            carId: own.id,
            s: own.s,
            d: own.d,
            yaw: own.yaw,
            v: own.v,
            lap: own.lap,
            boost: own.boost,
            boosting: own.boosting,
            wear: own.wear,
            inPit: !!own.pit,
            offTrack: own.offTrack,
            stops: own.pitStops.length,
            penalties: own.penalties,
          });
        }
      } else if (own && own.finished && nowMs - lastReport > 500) {
        lastReport = nowMs;
        void act({ type: "arcadeState", carId: own.id, s: own.s, d: own.d, v: own.v, lap: own.lap, boost: own.boost, boosting: false, wear: own.wear, inPit: false, offTrack: false, stops: own.pitStops.length, penalties: own.penalties });
      }
      if (scene) scene.render(display, cameraRef.current, followRef.current, dt, { line: lineRef.current && (!!own || cameraRef.current !== "tv") });
      hudTimer += dt;
      if (hudTimer > 0.15) {
        hudTimer = 0;
        const order = frameRef.current?.frame.order ?? display.cars.map((c) => c.id);
        const cars: CarHud[] = order
          .map((id) => display.cars.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c, i) => {
            const e = race.entries.find((x) => x.carId === c.id)!;
            return {
              id: c.id,
              name: c.name,
              color: c.color,
              managerId: e.managerId,
              pos: i + 1,
              lap: Math.min(race.laps, Math.max(1, c.lap + 1)),
              speed: speedKmh(c),
              boost: c.boost,
              boosting: c.boosting,
              wear: c.wear,
              inPit: !!c.pit,
              pitRequested: c.pitRequested,
              stops: c.pitStops.length,
              penalties: c.penalties,
              finished: c.finished,
            };
          });
        const events = (frameRef.current?.frame.events ?? [])
          .slice(-4)
          .reverse()
          .map((e) => `${display.cars.find((c) => c.id === e.carId)?.name ?? ""}: ${e.text}`);
        setHud({ cars, t: display.t, events });
        if (own) {
          const gb = gearbox(own.v, own.perf.topSpeed);
          setDrive({ kmh: speedKmh(own), gear: gb.gear, rpm: gb.rpm, hint: assistHint(TRACK, speedProfile(TRACK, own.perf), own), boost: own.boost, offTrack: own.offTrack });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __display?: Race }).__display = display;
    // Test hook: track helpers so automated tests can drive with the keyboard.
    (window as unknown as { __engine?: unknown }).__engine = { TRACK, sampleAt, lineOffset, cornerLimit, maxSteer };
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, race.stage]);

  const command = useCallback(
    async (carId: string, patch: { pace?: PaceMode; boost?: boolean; pit?: boolean }) => {
      if (patch.pace || patch.boost !== undefined) setCommands((c) => ({ ...c, [carId]: { ...c[carId], ...(patch.pace ? { pace: patch.pace } : {}), ...(patch.boost !== undefined ? { boost: patch.boost } : {}) } }));
      await act({ type: "carCommand", carId, ...patch });
    },
    [act],
  );

  const hold = (key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      keys.current.add(key);
    },
    onPointerUp: () => keys.current.delete(key),
    onPointerCancel: () => keys.current.delete(key),
    onPointerLeave: () => keys.current.delete(key),
  });

  const followCar = hud.cars.find((c) => c.id === follow);
  const myCars = hud.cars.filter((c) => c.managerId === me.id);
  const lights = race.stage === "running" && hud.t < 0 ? Math.ceil(-hud.t) : 0;

  return (
    <div className="mprace" data-testid="mp-race">
      <canvas ref={canvasRef} className="race__canvas" aria-label="3D race view" />
      <canvas ref={overlayRef} className="race__overlay" aria-hidden="true" />
      {glError && <p className="race__glerror" role="alert">3D graphics aren’t available here ({glError}). Standings still update live.</p>}

      <div className="hud hud--top-left">
        <p className="hud__race">Race {race.index + 1}/{race.total}</p>
        <p className="hud__lap" data-testid="hud-lap">Lap {followCar?.lap ?? 1}/{race.laps}</p>
        <ol className="tower" aria-label="Race order" data-testid="tower">
          {hud.cars.map((c) => (
            <li key={c.id} className={c.managerId === me.id ? "is-player" : undefined}>
              <span className="tower__pos">{c.pos}</span>
              <Swatch color={c.color} />
              <span className="tower__name">{c.name.split(" ").slice(-1)[0]}</span>
              <span className="tower__gap">{c.finished ? "FIN" : c.inPit ? "PIT" : c.penalties ? `+${c.penalties}s` : ""}</span>
            </li>
          ))}
        </ol>
      </div>

      {hud.events.length > 0 && (
        <ul className="hud hud--events" aria-live="polite">
          {hud.events.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {lights > 0 && (
        <div className="lights" aria-live="assertive"><span>{lights}</span></div>
      )}
      {race.stage === "grid" && (
        <div className="stage-overlay" role="status">
          <div className="fp">
            <h2>Race {race.index + 1} of {race.total}</h2>
            <p>{race.laps} laps. Lights in {stageLeft !== null ? Math.ceil(stageLeft / 1000) : "…"} s.</p>
            <p className="small muted">{arcade ? (driving ? "You drive your lead driver. W/↑ throttle, S/↓ brake, A/D or ←/→ steer, Space boost, R reset, P pit, L racing line. Brake before the red sections of the line." : "Your car is driven by the AI.") : "Both your drivers race. Make live calls from the pit wall below."}</p>
          </div>
        </div>
      )}
      {race.stage === "results" && race.results && (
        <div className="stage-overlay" role="dialog" aria-label="Race results">
          <div className="fp results-box" data-testid="race-results">
            <h2>Race {race.index + 1} results</h2>
            <table className="rtable">
              <thead>
                <tr><th>Pos</th><th>Driver</th><th>Team</th><th className="num">Gap</th><th className="num">Stops</th><th className="num">Pen.</th><th className="num">Pts</th></tr>
              </thead>
              <tbody>
                {race.results.map((r) => (
                  <tr key={r.carId} className={r.managerId === me.id ? "is-you" : undefined}>
                    <td>{r.position}</td>
                    <td>{r.driverName}</td>
                    <td>{managerName(r.managerId)}</td>
                    <td className="num">{r.gap}</td>
                    <td className="num">{r.stops}</td>
                    <td className="num">{r.penalties ? `+${r.penalties}s` : "—"}</td>
                    <td className="num strong">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Championship</h3>
            <ol className="standings">
              {view.standings.map((s) => {
                const m = view.managers.find((x) => x.id === s.managerId)!;
                return (
                  <li key={s.managerId} className={m.isYou ? "is-you" : undefined}>
                    <Swatch color={m.color} /> {m.name} <span className="num strong">{s.points}</span>
                  </li>
                );
              })}
            </ol>
            <p className="muted">{race.index + 1 < race.total ? "Next race" : "Final standings"} in {stageLeft !== null ? Math.ceil(stageLeft / 1000) : "…"} s</p>
          </div>
        </div>
      )}

      <div className="hud hud--controls">
        <div className="row">
          <button type="button" className="btn btn--small" onClick={() => setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length])}>
            {CAMERA_LABELS[camera]}
          </button>
          <button type="button" className="btn btn--small" onClick={() => {
            const ids = hud.cars.map((c) => c.id);
            setFollow(ids[(ids.indexOf(follow) + 1) % ids.length]);
          }}>
            Watching: {followCar?.name ?? "—"}
          </button>
          <button type="button" className={`btn btn--small${showLine ? " btn--primary" : ""}`} aria-pressed={showLine} onClick={() => setShowLine((v) => !v)} data-testid="line-toggle">
            Racing line {showLine ? "on" : "off"} (L)
          </button>
          {me.isHost && !arcade && (
            <div className="seg seg--inline" role="radiogroup" aria-label="Race speed (host)">
              {[1, 2, 4].map((sp) => (
                <button key={sp} type="button" role="radio" aria-checked={race.speed === sp} onClick={() => act({ type: "raceSpeed", speed: sp })}>{sp}×</button>
              ))}
            </div>
          )}
        </div>

        {!arcade && (
          <div className="pitwall-mp" aria-label="Pit wall">
            {myEntries.map((e) => {
              const c = myCars.find((x) => x.id === e.carId);
              const cmd = commands[e.carId] ?? { pace: "normal", boost: true };
              return (
                <div key={e.carId} className="carctl" data-testid={`car-${e.number}`}>
                  <p className="carctl__head">
                    <strong>P{c?.pos ?? "–"}</strong> {e.driverName}
                    <span className="small muted"> · tyres {c ? Math.round((1 - c.wear) * 100) : 100}% · boost {c ? Math.round(c.boost) : 0}% · {c?.inPit ? "in pit" : c?.stops ? "stopped" : c?.pitRequested ? "boxing" : "no stop yet"}</span>
                  </p>
                  <div className="row">
                    <div className="seg seg--inline" role="radiogroup" aria-label={`Pace for ${e.driverName}`}>
                      {(["push", "normal", "save"] as PaceMode[]).map((p) => (
                        <button key={p} type="button" role="radio" aria-checked={cmd.pace === p} onClick={() => command(e.carId, { pace: p })}>
                          {p === "push" ? "Push" : p === "normal" ? "Normal" : "Save"}
                        </button>
                      ))}
                    </div>
                    <button type="button" className={`btn btn--small${cmd.boost ? " btn--primary" : ""}`} aria-pressed={cmd.boost} onClick={() => command(e.carId, { boost: !cmd.boost })}>
                      Boost {cmd.boost ? "on" : "off"}
                    </button>
                    <button type="button" className={`btn btn--small${c?.pitRequested ? " btn--primary" : ""}`} disabled={!c || c.inPit || c.finished} onClick={() => command(e.carId, { pit: true })}>
                      {c?.pitRequested ? "Cancel box" : "Box"}
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="small muted">Strategy: {STRATEGY_INFO[me.strategy].label}. One stop is mandatory; the team stops automatically if you don’t call it.</p>
          </div>
        )}

        {driving && drive && (
          <div className="dash" data-testid="dash" aria-label="Car dashboard">
            <div className="dash__speed"><strong>{drive.kmh}</strong><span>km/h</span></div>
            <div className="dash__gear"><strong>{drive.gear}</strong><span>gear</span></div>
            <div className="dash__rpm" aria-label={`${drive.rpm} rpm`}>
              <span className="dash__bar"><span style={{ width: `${Math.min(100, (drive.rpm / 12500) * 100)}%` }} /></span>
              <span>{drive.rpm.toLocaleString("en-GB")} rpm</span>
            </div>
            <div className="dash__boost"><span className="dash__bar dash__bar--boost"><span style={{ width: `${drive.boost}%` }} /></span><span>Boost {Math.round(drive.boost)}%</span></div>
            <div className={`dash__hint dash__hint--${drive.offTrack ? "offtrack" : drive.hint.toLowerCase()}`} data-testid="hint">{drive.offTrack ? "OFF TRACK" : drive.hint}</div>
          </div>
        )}
        {driving && (
          <div className="drive-hud">
            {myCars[0] && (
              <p className="drive-hud__line" data-testid="drive-hud">
                <strong>P{myCars[0].pos}</strong> · {myCars[0].speed} km/h · boost {Math.round(myCars[0].boost)}% · tyres {Math.round((1 - myCars[0].wear) * 100)}% ·{" "}
                {myCars[0].inPit ? "in pit" : myCars[0].stops ? "stop done" : myCars[0].pitRequested ? "boxing" : "stop not done (P)"}
              </p>
            )}
            <div className="touch-controls">
              <button type="button" className="touch" {...hold("arrowleft")} aria-label="Steer left">◀</button>
              <button type="button" className="touch" {...hold("arrowright")} aria-label="Steer right">▶</button>
              <button type="button" className="touch touch--brake" {...hold("arrowdown")}>Brake</button>
              <button type="button" className="touch touch--gas" {...hold("arrowup")}>Throttle</button>
              <button type="button" className="touch touch--boost" {...hold(" ")}>Boost</button>
              <button type="button" className="touch" onClick={() => (pitPressed.current = true)}>Box</button>
              <button type="button" className="touch" onClick={() => (resetPressed.current = true)}>Reset (R)</button>
            </div>
          </div>
        )}
        {arcade && !driving && myEntries.length > 0 && <p className="small muted panel-note">The AI is driving your car (you lost connection or left).</p>}
      </div>
    </div>
  );
}
