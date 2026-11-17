import { defaultCircuitSettings, serializeCircuit } from "../../src/circuit/document";
import { emptyDrawing, junctionAt, placeComponent, wireDrawing } from "../../src/circuit/drawing";

/** Two parallel ideal inductors with an effective nominal between input ticks. */
export function parallelInductorsDocument(): string {
  let drawing = placeComponent(emptyDrawing(), "port", { x: 270, y: 300 });
  drawing = placeComponent(drawing, "l", { x: 270, y: 95 });
  drawing = placeComponent(drawing, "l", { x: 270, y: 195 });
  drawing = junctionAt(drawing, { x: 85, y: 145 });
  drawing = junctionAt(drawing, { x: 455, y: 145 });
  drawing = { ...drawing, topology: { ...drawing.topology,
    components: drawing.topology.components.map(part => part.kind === "l"
      ? { ...part, parameters: { ...part.parameters, henry: part.id === "L1" ? 1e-6 : 2e-6 } } : part),
  } };
  for (const [from, to] of [
    ["P1:a", "J1"], ["P1:b", "J2"], ["L1:a", "J1"], ["L1:b", "J2"], ["L2:a", "J1"], ["L2:b", "J2"],
  ]) drawing = wireDrawing(drawing, from, to);
  return serializeCircuit(drawing, defaultCircuitSettings);
}
