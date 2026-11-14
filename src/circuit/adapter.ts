import type { CircuitTopology } from "./topology";

export type LaboratoryAdapter<Model> = {
  convert: (topology: CircuitTopology) => { model: Model; resultIds: ReadonlyMap<string, string> };
};
