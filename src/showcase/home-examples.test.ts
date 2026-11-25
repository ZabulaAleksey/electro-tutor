import { describe, expect, it } from "vitest";
import { validatePlotData } from "../engineering/plot";
import { dcExampleInput, homeExamples } from "./home-examples";

const demo = (id: string) => {
  const result = homeExamples.find(example => example.id === id);
  if (!result) throw new Error("Missing demonstration: " + id);
  return {
    ...result,
    value: (name: string) => {
      const metric = result.metrics.find(item => item.id === name);
      if (!metric) throw new Error("Missing result: " + name);
      return metric.value;
    },
  };
};

describe("EVAL-02 independent physical references", () => {
  it("DC: Ohm's law, KVL and measured node potentials", () => {
    expect(dcExampleInput).toEqual({ voltage: 24, firstResistance: 4, secondResistance: 8 });
    const d = demo("dc");
    expect([d.value("current"), d.value("first-drop"), d.value("second-drop"), d.value("total-drop")]).toEqual([2, 8, 16, 24]);
    expect(d.plot.curves[0].points).toEqual([[0, 24], [1, 16], [2, 0]]);
  });

  it("AC: equal R and net reactance give a 45-degree current lag", () => {
    const d = demo("ac");
    expect(d.value("reactance")).toBeCloseTo(30, 12);
    expect(d.value("impedance")).toBeCloseTo(42.42640687119285, 12);
    expect(d.value("current")).toBeCloseTo(1.414213562373095, 12);
    expect(d.value("phase")).toBeCloseTo(45, 12);
    expect(d.plot.curves[0].points[0][1]).toBeCloseTo(-Math.SQRT2, 12);
    expect(Math.max(...d.plot.curves[0].points.map(point => point[1]))).toBeCloseTo(2, 12);
    for (const [timeMs, current] of d.plot.curves[0].points) {
      expect(current).toBeCloseTo(2 * Math.sin(timeMs / 10 - Math.PI / 4), 12);
    }
  });

  it("balanced star: 120/24 A RMS and instant KCL", () => {
    const d = demo("three-phase");
    for (const phase of ["A", "B", "C"]) expect(d.value(phase)).toBeCloseTo(5, 12);
    expect(d.value("neutral")).toBe(0);
    const quarterPeriod = d.plot.curves.map(curve => curve.points.find(([time]) => time === 5)?.[1]);
    expect(quarterPeriod[0]).toBeCloseTo(0, 12);
    expect(quarterPeriod[1]).toBeCloseTo(5 * Math.sqrt(6) / 2, 12);
    expect(quarterPeriod[2]).toBeCloseTo(-5 * Math.sqrt(6) / 2, 12);
    for (let index = 0; index < d.plot.curves[0].points.length; index++) {
      expect(d.plot.curves.reduce((sum, curve) => sum + curve.points[index][1], 0)).toBeCloseTo(0, 12);
    }
  });

  it("RC: time constant, initial state and independent exponential samples", () => {
    const d = demo("transients");
    expect(d.value("tau")).toBe(1);
    expect(d.value("one-tau")).toBeCloseTo(7.585446705942692, 12);
    expect(d.plot.curves[0].points[0]).toEqual([0, 0]);
    expect(d.plot.curves[0].points.at(-1)?.[1]).toBeCloseTo(11.91914463601097, 12);
    for (const [time, voltage] of d.plot.curves[0].points) {
      expect(voltage).toBeCloseTo(12 - 12 / Math.exp(time), 12);
    }
  });

  it("diode: the operating point satisfies both load-line and PWL equations", () => {
    const d = demo("nonlinear");
    const currentAmperes = d.value("current") / 1000;
    const voltage = d.value("diode-voltage");
    expect(currentAmperes).toBeCloseTo(43 / 10100, 12);
    expect(voltage).toBeCloseTo(0.7 + 10 * currentAmperes, 12);
    expect(1000 * currentAmperes + voltage).toBeCloseTo(5, 12);
  });

  it("no-gap magnetic core: H in A/m and B in tesla", () => {
    const d = demo("magnetic");
    expect(d.value("field")).toBe(125);
    expect(d.value("flux-density")).toBeCloseTo(Math.PI / 20, 12);
    expect(d.plot.curves[0].points[0]).toEqual([0, 0]);
    expect(d.plot.curves[0].points.at(-1)?.[1]).toBeCloseTo(Math.PI / 10, 12);
  });

  it("resistive unbalance: floating neutral displaces by 57.5 V and carries no current", () => {
    const d = demo("unbalanced");
    expect(d.value("A")).toBeCloseTo(8.625, 12);
    const phaseBC = 23 * Math.sqrt(21) / 16;
    for (const phase of ["B", "C"]) expect(d.value(phase)).toBeCloseTo(phaseBC, 12);
    expect(d.value("neutral")).toBe(0);
    expect(d.value("neutral-displacement")).toBeCloseTo(57.5, 12);
    const plotted = d.plot.curves[0].points;
    [8.625, phaseBC, phaseBC, 0].forEach((expected, index) => expect(plotted[index][1]).toBeCloseTo(expected, 12));
  });

  it("matched source/lossless line: delay and load boundary after first arrival", () => {
    const d = demo("long-line");
    expect(d.value("delay")).toBe(0.5);
    expect(d.value("reflection")).toBeCloseTo(1 / 3, 12);
    expect(d.value("load-voltage")).toBeCloseTo(200 / 3, 12);
    expect(d.value("load-current")).toBeCloseTo(2 / 3, 12);
    expect(d.plot.curves[0].points[1]).toEqual([0.5, 0]);
    expect(d.plot.curves[0].points[2][0]).toBe(0.5);
    expect(d.plot.curves[0].points[2][1]).toBeCloseTo(200 / 3, 12);
  });

  it("every chart uses finite values, labeled quantities and valid domains", () => {
    expect(new Set(homeExamples.map(example => example.id)).size).toBe(8);
    for (const example of homeExamples) {
      expect(validatePlotData(example.plot), example.id).toEqual([]);
      expect(example.metrics.every(item => Number.isFinite(item.value))).toBe(true);
      for (const curve of example.plot.curves) {
        expect(curve.points.every(([x, y]) =>
          x >= (example.plot.xMin ?? 0) && x <= example.plot.xMax &&
          y >= example.plot.yMin - 1e-12 && y <= example.plot.yMax + 1e-12
        ), example.id).toBe(true);
      }
    }
  });
});
