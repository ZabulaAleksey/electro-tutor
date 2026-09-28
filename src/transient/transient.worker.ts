import type { TransientConfig, WorkerCommand, WorkerReply } from "./types";
import type * as WasmModule from "../../public/transient-core/transient_core.js";

type Engine = WasmModule.WasmSimulation;
const worker = self as unknown as {
  location: Location;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  setTimeout(handler: () => void, timeout?: number): number;
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
};
let modulePromise: Promise<typeof WasmModule> | null = null;
let engine: Engine | null = null;
let config: TransientConfig | null = null;
let running = false;
let timer: number | undefined;
let generation = 0;
let awaitingAck = false;
let pendingSnapshot = false;
let stopTimeS = 0.02;
let speed = 1;
let desiredTimeS = 0;
let lastWall = performance.now();
let stepsPerSecond = 0;

function send(reply: WorkerReply, transfer?: Transferable[]) {
  worker.postMessage(reply, transfer ?? []);
}

function error(value: unknown) {
  running = false;
  if (timer !== undefined) clearTimeout(timer);
  send({ type: "error", message: value instanceof Error ? value.message : String(value) });
}

async function wasmModule(): Promise<typeof WasmModule> {
  if (!modulePromise) {
    const url = new URL(`${import.meta.env.BASE_URL}transient-core/transient_core.js`, worker.location.origin).href;
    modulePromise = import(/* @vite-ignore */ url) as Promise<typeof WasmModule>;
  }
  const module = await modulePromise;
  await module.default();
  return module;
}

function snapshot() {
  if (!engine) return;
  if (awaitingAck) { pendingSnapshot = true; return; }
  const start = performance.now();
  const voltages = engine.voltages();
  const currents = engine.currents();
  const diagnostics = engine.diagnostics();
  const copyMs = performance.now() - start;
  awaitingAck = true;
  pendingSnapshot = false;
  send({ type: "snapshot", voltages, currents, diagnostics, running,
    copyMs, stepsPerSecond, postedAt: performance.timeOrigin + performance.now() },
    [voltages.buffer as ArrayBuffer, currents.buffer as ArrayBuffer, diagnostics.buffer as ArrayBuffer]);
}

function pause() {
  running = false;
  generation += 1;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function schedule(delay = 30) {
  if (running) timer = worker.setTimeout(() => { void tick(generation); }, delay);
}

async function tick(token: number) {
  if (!running || token !== generation || !engine) return;
  const wallNow = performance.now();
  desiredTimeS = Math.min(stopTimeS, desiredTimeS + (wallNow - lastWall) / 1000 * 0.005 * speed);
  lastWall = wallNow;
  const computeStart = performance.now();
  const before = engine.step_index();
  try {
    while (running && token === generation && engine.time_s() + engine.dt_s() * 0.5 < desiredTimeS) {
      const remaining = Math.ceil((desiredTimeS - engine.time_s()) / engine.dt_s());
      engine.step_many(Math.min(remaining, 5000));
      if (remaining > 5000) await new Promise<void>(resolve => worker.setTimeout(resolve, 0));
    }
    stepsPerSecond = (engine.step_index() - before) * 1000 / Math.max(1, performance.now() - computeStart);
    if (engine.time_s() + engine.dt_s() * 0.5 >= stopTimeS) pause();
    snapshot();
    schedule();
  } catch (cause) {
    error(cause);
  }
}

worker.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  try {
    switch (command.type) {
      case "configure": {
        pause();
        send({ type: "busy", busy: true });
        const module = await wasmModule();
        if (engine) engine.free();
        engine = null;
        config = command.config;
        const { source, line, load } = config;
        engine = new module.WasmSimulation(
          line.lengthM, line.velocityMS, line.impedanceOhm, line.cells, line.cfl,
          source.voltageV, source.resistanceOhm, source.switchTimeS,
          load.kind, load.topology, load.resistanceOhm, load.inductanceH,
          load.capacitanceF, load.initialVoltageV, load.initialCurrentA,
        );
        stopTimeS = command.stopTimeS;
        desiredTimeS = 0;
        send({ type: "busy", busy: false });
        snapshot();
        break;
      }
      case "play":
        if (!engine) return;
        if (!Number.isFinite(command.stopTimeS) || command.stopTimeS <= 0
            || !Number.isFinite(command.speed) || command.speed <= 0) throw new Error("Invalid playback settings");
        pause();
        speed = command.speed;
        stopTimeS = command.stopTimeS;
        if (engine.time_s() >= stopTimeS) return;
        running = true;
        desiredTimeS = engine.time_s();
        lastWall = performance.now();
        schedule(0);
        snapshot();
        break;
      case "pause":
        pause();
        snapshot();
        break;
      case "reset":
        pause();
        engine?.reset();
        desiredTimeS = 0;
        snapshot();
        break;
      case "step":
        pause();
        if (engine && engine.time_s() < stopTimeS) engine.step_many(1);
        snapshot();
        break;
      case "seek":
        pause();
        if (!engine || !Number.isFinite(command.targetS) || command.targetS < 0) throw new Error("Invalid seek time");
        send({ type: "busy", busy: true });
        engine.seek(command.targetS);
        desiredTimeS = engine.time_s();
        send({ type: "busy", busy: false });
        snapshot();
        break;
      case "ack":
        awaitingAck = false;
        if (pendingSnapshot) snapshot();
        break;
    }
  } catch (cause) {
    error(cause);
  }
};
