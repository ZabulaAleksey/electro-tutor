import type { Complex } from "./math";

export const motionShapes = ["triangle", "square", "rectangle", "polygon", "circle"] as const;
export type MotionShape = typeof motionShapes[number];
export type MotionFamily = "all" | MotionShape;

export const motionSampleCount = 128;
export const motionMaxComponents = 12;
export const motionMaxPoints = 4096;
export const motionSvgMaxBytes = 128 * 1024;
export const motionJsonMaxBytes = 512 * 1024;
export const motionMaxScale = 4;
export const motionFixtureSeed = 0x32ef19a1;

export type MotionOptions = { family: MotionFamily; sides: number; aspect: number; count: number };

export type PolygonMotion = {
  shape: MotionShape;
  scale: number;
  angleDegrees: number;
  phaseIndex: number;
  direction: 1 | -1;
};

export type PolygonMotionResult = {
  center: Complex;
  components: PolygonMotion[];
  samples: Complex[];
  reconstruction: Complex[];
  contributions: Complex[][];
  prefixRms: number[];
  rms: number;
  max: number;
};

export type PolygonMotionExperiment = {
  kind: "electrotutor-polygon-motion";
  schemaVersion: 1;
  points: Complex[];
  options: MotionOptions;
  components?: PolygonMotion[];
};

export const defaultMotionOptions: Readonly<MotionOptions> = { family: "all", sides: 5, aspect: 1.7, count: 4 };
