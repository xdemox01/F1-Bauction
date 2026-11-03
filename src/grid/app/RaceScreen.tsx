import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { cryptoRng } from "../../lib/game/rng.ts";
import { classification, createRace, gapToLeader, RACE_RULES, raceDistance, speedKmh, step } from "../engine/race.ts";
import type { ControlMode, Entry, PaceMode, Race } from "../engine/race.ts";
import { buildTrack, worldPos } from "../engine/track.ts";
import type { Track } from "../engine/track.ts";
import { CAMERA_LABELS, RaceScene } from "../render/scene.ts";
import type { CameraMode } from "../render/scene.ts";

const TRACK: Track = buildTrack();
const CAMERAS: CameraMode[] = ["chase", "cockpit", "tv", "overview"];

interface Hud {
  t: number;
  position: number;
  total: number;
  lap: number;
  speed: number;
  boost: number;
  boosting: boolean;
  cooldown: number;
  wear: number;
  pitRequested: boolean;
  inPit: boolean;
  stops: number;
  penalties: number;
  offTrack: boolean;
  sliding: boolean;
  finished: boolean;
  order: { id: string; name: string; color: string; isPlayer: boolean; gap: string; inPit: boolean; finished: boolean }[];
  progress: { id: string; color: string; isPlayer: boolean; share: number }[];
  events: string[];
  countdown: number;
}

function snapshot(race: Race): Hud {
  const me = race.cars.find((c) => c.isPlayer)!;
  const order = classification(race);
  const total = race.laps * race.track.length;
  return {
    t: race.t,
    position: order.indexOf(me) + 1,
    total: race.cars.length,
    lap: Math.min(race.laps, Math.max(1, me.lap + 1)),
    speed: speedKmh(me),
    boost: me.boost,
    boosting: me.boosting,
    cooldown: me.boostCooldown,
    wear: me.wear,
    pitRequested: me.pitRequested,
    inPit: !!me.pit,
    stops: me.pitStops.length,
    penalties: me.penalties,
    offTrack: me.offTrack,
    sliding: me.sliding,
    finished: me.finished,
    order: order.map((c) => ({ id: c.id, name: c.name, color: c.color, isPlayer: c.isPlayer, gap: gapToLeader(race, c), inPit: !!c.pit, finished: c.finished })),
    progress: race.cars.map((c) => ({ id: c.id, color: c.color, isPlayer: c.isPlayer, share: Math.max(0, Math.min(1, raceDistance(race, c) / total)) })),
    events: race.events
      .slice(-40)
      .filter((e) => e.carId === me.id || /Pit stop|Contact/.test(e.text))
      .slice(-3)
      .reverse()
      .map((e) => `${e.carId === me.id ? "You" : race.cars.find((c) => c.id === e.carId)!.name}: ${e.text}`),
    countdown: race.t < 0 ? Math.ceil(-race.t) : 0,
  };
}

export function RaceScreen({
  entries,
  laps,
  mode,
  onFinish,
  onQuit,
}: {
  entries: Entry[];
  laps: number;
  mode: ControlMode;
  onFinish: (race: Race) => void;
  onQuit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const raceRef = useRef<Race | null>(null);
  if (!raceRef.current) raceRef.current = createRace(TRACK, entries, { laps, mode });
  const keys = useRef(new Set<string>());
  const pitPressed = useRef(false);
  const principal = useRef<{ pace: PaceMode; boost: boolean }>({ pace: "normal", boost: false });
  const [camera, setCamera] = useState<CameraMode>(mode === "drive" ? "chase" : "tv");
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [follow, setFollow] = useState<string>(entries.find((e) => e.isPlayer)!.id);
  const followRef = useRef(follow);
  followRef.current = follow;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [simSpeed, setSimSpeed] = useState(1);
  const speedRef = useRef(simSpeed);
  speedRef.current = simSpeed;
  const [pace, setPace] = useState<PaceMode>("normal");
  const [boostOn, setBoostOn] = useState(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(raceRef.current!));
  const [glError, setGlError] = useState<string | null>(null);
  const finishedRef = useRef(false);

  principal.current = { pace, boost: boostOn };

  const cycleCamera = useCallback(() => setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]), []);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if (k === "p") pitPressed.current = true;
      else if (k === "c") cycleCamera();
      else if (k === "escape") setPaused((p) => !p);
      else if (mode === "principal" && k === "1") setPace("push");
      else if (mode === "principal" && k === "2") setPace("normal");
      else if (mode === "principal" && k === "3") setPace("save");
      else if (mode === "principal" && (k === " " || k === "shift")) setBoostOn((b) => !b);
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
  }, [mode, cycleCamera]);

  // Main loop
  useEffect(() => {
    const race = raceRef.current!;
    const rng = cryptoRng();
    let scene: RaceScene | null = null;
    try {
      scene = new RaceScene(canvasRef.current!, overlayRef.current!, TRACK, entries);
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "WebGL failed to start.");
    }
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;
    const STEP = 1 / 120;
    const frame = (now: number) => {
      // Keep the race in real time even on slow machines (fixed 120 Hz physics steps).
      const real = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        acc += real * speedRef.current;
        const k = keys.current;
        let guard = 0;
        while (acc >= STEP && guard++ < 2000) {
          const input =
            mode === "drive"
              ? {
                  player: {
                    throttle: k.has("arrowup") || k.has("w") ? 1 : 0,
                    brake: k.has("arrowdown") || k.has("s") ? 1 : 0,
                    steer: (k.has("arrowleft") || k.has("a") ? 1 : 0) - (k.has("arrowright") || k.has("d") ? 1 : 0),
                    boost: k.has(" ") || k.has("shift"),
                  },
                  playerPit: pitPressed.current,
                }
              : { principal: principal.current, playerPit: pitPressed.current };
          pitPressed.current = false;
          step(race, STEP, input, rng);
          acc -= STEP;
        }
      }
      if (scene) scene.render(race, cameraRef.current, followRef.current, real);
      else drawFallback(overlayRef.current!, race);
      hudTimer += real;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud(snapshot(race));
      }
      if (race.finished && !finishedRef.current) {
        finishedRef.current = true;
        onFinish(race);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    (window as unknown as { __race?: Race }).__race = race;
    return () => cancelAnimationFrame(raf);
  }, [entries, mode, onFinish]);

  // On-screen controls write into the same key set as the keyboard.
  const hold = (key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      keys.current.add(key);
    },
    onPointerUp: () => keys.current.delete(key),
    onPointerCancel: () => keys.current.delete(key),
    onPointerLeave: () => keys.current.delete(key),
  });

  const followIndex = hud.order.findIndex((o) => o.id === follow);
  const playerFinished = hud.finished;

  return (
    <div className="race" data-testid="race">
      <canvas ref={canvasRef} className="race__canvas" aria-label="3D race view" />
      <canvas ref={overlayRef} className="race__overlay" aria-hidden="true" />

      {glError && (
        <p className="race__glerror" role="alert">
          3D graphics aren’t available in this browser ({glError}). The race still runs: you’re watching the map view.
        </p>
      )}

      {hud.countdown > 0 && (
        <div className="lights" aria-live="assertive">
          <span>{hud.countdown}</span>
        </div>
      )}

      <div className="hud hud--top-left">
        <p className="hud__pos" data-testid="hud-position">
          P{hud.position}
          <span>/{hud.total}</span>
        </p>
        <p className="hud__lap" data-testid="hud-lap">
          Lap {hud.lap}/{laps}
        </p>
        <ol className="tower" aria-label="Race order">
          {hud.order.map((o, i) => (
            <li key={o.id} className={o.isPlayer ? "is-player" : undefined}>
              <span className="tower__pos">{i + 1}</span>
              <span className="swatch" style={{ background: o.color }} />
              <span className="tower__name">{o.isPlayer ? "You" : o.name}</span>
              <span className="tower__gap">{o.inPit ? "PIT" : o.gap}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="hud hud--bottom-left">
        <p className="hud__speed" data-testid="hud-speed">
          {hud.speed}
          <span> km/h</span>
        </p>
        <div className="meter" aria-label={`Boost ${Math.round(hud.boost)}%`} data-testid="hud-boost">
          <span className="meter__label">{hud.cooldown > 0 ? `Boost recharging ${hud.cooldown.toFixed(1)} s` : hud.boosting ? "Boosting" : "Boost"}</span>
          <span className={`meter__bar${hud.boosting ? " is-on" : ""}${hud.cooldown > 0 ? " is-cool" : ""}`}>
            <span style={{ width: `${hud.boost}%` }} />
          </span>
        </div>
        <div className="meter" aria-label={`Tyres ${Math.round((1 - hud.wear) * 100)}%`}>
          <span className="meter__label">Tyres {Math.round((1 - hud.wear) * 100)}%</span>
          <span className={`meter__bar meter__bar--tyre${hud.wear > 0.5 ? " is-worn" : ""}`}>
            <span style={{ width: `${(1 - hud.wear) * 100}%` }} />
          </span>
        </div>
        <p className="hud__status" data-testid="hud-pit">
          {hud.inPit ? "In the pits" : hud.pitRequested ? "Boxing at the end of this lap" : hud.stops ? `Pit stop done (${hud.stops})` : "Mandatory pit stop: not done yet"}
          {hud.penalties > 0 && ` · Penalties +${hud.penalties} s`}
          {hud.offTrack ? " · Off track!" : hud.sliding ? " · Sliding" : ""}
        </p>
      </div>

      <div className="hud hud--progress" aria-label="Race progress">
        <div className="progress-track">
          {hud.progress.map((p) => (
            <span key={p.id} className={`progress-dot${p.isPlayer ? " is-player" : ""}`} style={{ left: `${p.share * 100}%`, background: p.color }} />
          ))}
        </div>
      </div>

      {hud.events.length > 0 && (
        <ul className="hud hud--events" aria-live="polite">
          {hud.events.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="hud hud--controls">
        <div className="row">
          <button type="button" className="button button--small" onClick={cycleCamera} title="C">
            {CAMERA_LABELS[camera]}
          </button>
          {(mode === "principal" || playerFinished) && (
            <button
              type="button"
              className="button button--small"
              onClick={() => setFollow(hud.order[(followIndex + 1) % hud.order.length].id)}
            >
              Watching: {hud.order[followIndex]?.isPlayer ? "you" : hud.order[followIndex]?.name}
            </button>
          )}
          <button type="button" className="button button--small" onClick={() => setPaused((p) => !p)} title="Esc">
            {paused ? "Resume" : "Pause"}
          </button>
        </div>

        {mode === "principal" && !playerFinished && (
          <div className="pitwall" aria-label="Pit wall commands">
            <div className="segmented" role="radiogroup" aria-label="Pace">
              {(["push", "normal", "save"] as PaceMode[]).map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={pace === p} onClick={() => setPace(p)} title={`${i + 1}`}>
                  {p === "push" ? "Push" : p === "normal" ? "Normal" : "Save tyres"}
                </button>
              ))}
            </div>
            <button type="button" className={`button button--small${boostOn ? " button--primary" : ""}`} aria-pressed={boostOn} onClick={() => setBoostOn((b) => !b)}>
              {boostOn ? "Boost on" : "Boost off"}
            </button>
            <button type="button" className={`button button--small${hud.pitRequested ? " button--primary" : ""}`} onClick={() => (pitPressed.current = true)} disabled={hud.inPit}>
              {hud.pitRequested ? "Cancel pit call" : "Box this lap"}
            </button>
            <div className="segmented" role="radiogroup" aria-label="Simulation speed">
              {[1, 2, 4].map((s) => (
                <button key={s} type="button" role="radio" aria-checked={simSpeed === s} onClick={() => setSimSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "drive" && !playerFinished && (
          <>
            <div className="touch-controls" aria-label="Driving controls">
              <button type="button" className="touch" {...hold("arrowleft")} aria-label="Steer left">◀</button>
              <button type="button" className="touch" {...hold("arrowright")} aria-label="Steer right">▶</button>
              <button type="button" className="touch touch--brake" {...hold("arrowdown")}>Brake</button>
              <button type="button" className="touch touch--gas" {...hold("arrowup")}>Throttle</button>
              <button type="button" className="touch touch--boost" {...hold(" ")}>Boost</button>
              <button type="button" className="touch" onClick={() => (pitPressed.current = true)} disabled={hud.inPit}>
                {hud.pitRequested ? "Cancel box" : "Box"}
              </button>
            </div>
            <p className="keys small">Keys: ↑/W throttle · ↓/S brake · ←→/AD steer · Space/Shift boost · P box · C camera · Esc pause</p>
          </>
        )}

        {playerFinished && !hud.order.every((o) => o.finished) && (
          <div className="row">
            <p className="finished-banner">You finished P{hud.position}. Waiting for the others…</p>
            <button type="button" className="button button--primary button--small" onClick={() => setSimSpeed(8)}>
              Skip to results
            </button>
          </div>
        )}
      </div>

      {paused && (
        <div className="pause" role="dialog" aria-label="Paused">
          <div className="panel">
            <h2>Paused</h2>
            <div className="row">
              <button type="button" className="button button--primary" onClick={() => setPaused(false)}>Resume</button>
              <button type="button" className="button" onClick={onQuit}>Retire and leave the race</button>
            </div>
            <p className="small muted">Rules: one pit stop is mandatory (+{RACE_RULES.missedStopPenalty} s if missed). Hitting a car from behind costs +{RACE_RULES.contactPenalty} s.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 2D map view used when WebGL isn't available. */
function drawFallback(canvas: HTMLCanvasElement, race: Race) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2f5a2a";
  ctx.fillRect(0, 0, w, h);
  const t = race.track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) {
    minX = Math.min(minX, t.x[i]); maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]); maxZ = Math.max(maxZ, t.z[i]);
  }
  const sc = Math.min((w - 80) / (maxX - minX), (h - 80) / (maxZ - minZ));
  const X = (x: number) => 40 + (x - minX) * sc, Z = (z: number) => 40 + (z - minZ) * sc;
  ctx.strokeStyle = "#3d3f44";
  ctx.lineWidth = 14 * sc;
  ctx.beginPath();
  for (let i = 0; i <= t.n; i++) {
    const j = i % t.n;
    if (i === 0) ctx.moveTo(X(t.x[j]), Z(t.z[j]));
    else ctx.lineTo(X(t.x[j]), Z(t.z[j]));
  }
  ctx.stroke();
  for (const c of race.cars) {
    const p = worldPos(t, c.s, c.d);
    ctx.beginPath();
    ctx.arc(X(p.x), Z(p.z), c.isPlayer ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
  }
}

