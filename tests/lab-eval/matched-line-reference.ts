/**
 * Analytic reference for a lossless matched line with its input key closed.
 * Values are independent of the app's model and numerical solver.
 */
export const matchedLine = {
  seed: 20_261_121,
  lengthM: 1_000_000,
  velocityMS: 200_000_000,
  sourceV: 100,
  sourceOhm: 50,
  characteristicOhm: 50,
  loadOhm: 50,
} as const;

export const matchedLineArchive = {
  schema: "electrotutor-line-v5",
  model: {
    sections: [{
      id: "EVAL1",
      lengthM: matchedLine.lengthM,
      velocityMS: matchedLine.velocityMS,
      impedanceOhm: matchedLine.characteristicOhm,
    }],
    source: { voltageV: matchedLine.sourceV, resistanceOhm: matchedLine.sourceOhm, node: 0, onS: 0 },
    load: { id: "R-eval", kind: "r", value: matchedLine.loadOhm },
    series: [{ id: "K-eval", from: 0, to: 2, switch: { closed: false } }],
    durationS: 0.02,
    events: [],
    shunts: [],
  },
};

export const transitMs = 1000 * matchedLine.lengthM / matchedLine.velocityMS;
export const sampleOffsetMs = (10 + matchedLine.seed % 10) / 100;
const launchedV = matchedLine.sourceV * matchedLine.characteristicOhm /
  (matchedLine.sourceOhm + matchedLine.characteristicOhm);
const reflection = (matchedLine.loadOhm - matchedLine.characteristicOhm) /
  (matchedLine.loadOhm + matchedLine.characteristicOhm);
export const loadVoltageV = launchedV * (1 + reflection);
export const loadCurrentA = loadVoltageV / matchedLine.loadOhm;
