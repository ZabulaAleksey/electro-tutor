import { solveRollingFeasibility } from "./feasibility.mjs";
import { prepareRollingTrack, type Point2, type RollingRequest, type RollingResponse } from "./lab-model";
import { verifyRollingReplay } from "./replay.mjs";
import { buildRollingMesh, rollingMeshVolume } from "./rolling-mesh";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<RollingRequest>) => void) | null;
  postMessage: (reply: RollingResponse, transfer?: Transferable[]) => void;
};
const diagnostics = new Set([
  "INVALID_INPUT", "DEGENERATE_TRACE", "TRACE_COMPLEXITY", "TRACE_REVERSAL",
  "BUDGET_EXCEEDED", "TRACE_BUDGET", "TRACE_SHAPE_ERROR", "NO_CERTIFIED_SHAPE", "CONTACT_NOT_CERTIFIED",
]);

async function progress(id: number, phase: "trace" | "solve" | "verify" | "mesh", value: number) {
  worker.postMessage({ id, type: "progress", progress: value, phase });
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

async function run({ id, input }: RollingRequest) {
  const started = performance.now();
  try {
    await progress(id, "trace", .12);
    const track = prepareRollingTrack(input);
    await progress(id, "solve", .35);
    const { shape, poses } = solveRollingFeasibility(track);
    await progress(id, "verify", .6);
    const { contacts, ...verification } = verifyRollingReplay(shape, poses);
    await progress(id, "mesh", .85);
    const mesh = buildRollingMesh(shape.radius, shape.vertices, input.quality);
    const target = poses.map(pose => pose.target);
    const rebuilt: Point2[] = contacts.map(([x, y]) => [x, y]);
    const requested = input.trace.kind === "stroke" ? input.trace.points : undefined;
    const meshVolumeM3 = rollingMeshVolume(mesh);
    const workerMs = performance.now() - started;
    worker.postMessage({ id, type: "result", run: { target, contacts: rebuilt, poses, shape, mesh, verification, requested,
      traceMetrics: track.traceMetrics, meshVolumeM3, workerMs } },
      [mesh.vertices.buffer as ArrayBuffer, mesh.triangles.buffer as ArrayBuffer]);
  } catch (error) {
    const code = error instanceof Error && diagnostics.has(error.message) ? error.message : "ROLLING_FAILED";
    worker.postMessage({ id, type: "error", code });
  }
}

worker.onmessage = ({ data }) => {
  if (!data || !Number.isSafeInteger(data.id) || data.id < 0) return;
  void run(data);
};
