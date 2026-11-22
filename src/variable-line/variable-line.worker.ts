import { VariableLineError, type VariableLineReply, type VariableLineRequest, type VariableLineResult } from "./contracts";
import { prepareVariableLine } from "./profiles";
import { createVariableLineRun } from "./solver";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<VariableLineRequest>) => void) | null;
  postMessage: (reply: VariableLineReply, transfer?: Transferable[]) => void;
};

type Job = { requestId: number; run: ReturnType<typeof createVariableLineRun>; lastProgress: number };
let active: Job | undefined;

function transferResult(result: VariableLineResult): Transferable[] {
  const series = Object.values(result.energy).filter(value => value instanceof Float64Array);
  return [result.timeSeconds, result.voltageMetres, result.currentMetres, result.voltage, result.current, ...series]
    .map(values => values.buffer as ArrayBuffer);
}

function reportFailure(requestId: number, error: unknown) {
  const code = error instanceof VariableLineError ? error.code : "numerical-failure";
  worker.postMessage({ type: "error", requestId, code });
}

function resume(job: Job) {
  if (active !== job) return;
  const { requestId, run } = job;
  const started = performance.now();
  try {
    // Return to the Worker event loop between chunks so cancellation can run.
    for (let batch = 0; batch < 8; batch++) {
      if (run.advance(8)) {
        worker.postMessage({ type: "result", requestId, result: run.result }, transferResult(run.result));
        active = undefined;
        return;
      }
      if (performance.now() - started >= 8) break;
    }
    const now = performance.now();
    if (now - job.lastProgress >= 40) {
      job.lastProgress = now;
      worker.postMessage({ type: "progress", requestId, completed: run.completed, total: run.result.steps });
    }
    setTimeout(() => resume(job), 0);
  } catch (error) {
    active = undefined;
    reportFailure(requestId, error);
  }
}

function cancel(job: Job) {
  active = undefined;
  worker.postMessage({ type: "cancelled", requestId: job.requestId });
}

worker.onmessage = ({ data }) => {
  if (!data || !Number.isSafeInteger(data.requestId) || data.requestId < 0) return;
  if (data.type === "cancel") {
    if (active?.requestId === data.requestId) cancel(active);
    return;
  }
  if (data.type !== "run") return;
  if (active) cancel(active);
  try {
    const run = createVariableLineRun(prepareVariableLine(data.input));
    const job: Job = { requestId: data.requestId, run, lastProgress: -Infinity };
    active = job;
    worker.postMessage({ type: "progress", requestId: data.requestId, completed: 0, total: run.result.steps });
    setTimeout(() => resume(job), 0);
  } catch (error) {
    reportFailure(data.requestId, error);
  }
};
