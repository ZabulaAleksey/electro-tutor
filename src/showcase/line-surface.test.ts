import { expect, it } from "vitest";
import { lineStep } from "./line-surface";

it("line initial state, transit delay and matched-load front are exact", () => {
  expect(lineStep(100_000,0).u).toBe(0);
  expect(lineStep(100_000,0.000499).u).toBe(0);
  expect(lineStep(100_000,0.0005,50).u).toBe(50);
  expect(lineStep(100_000,0.0005,50).i).toBe(1);
  expect(lineStep(50_000,0.0002).u).toBe(0);
  expect(lineStep(50_000,0.0003).u).toBe(50);
});
it("load boundary and power hold for every supported load and time after arrival", () => {
  for (const load of [0,5,25,50,100,250]) for (const t of [0.0005,0.00075,0.001]) {
    const p=lineStep(100_000,t,load);
    expect(p.u).toBeCloseTo(load*p.i,10);
    expect(p.u*p.i).toBeCloseTo((p.incident**2-p.reflected**2)/50,10);
  }
  expect(lineStep(100_000,0.001,0).u).toBe(0);
  expect(lineStep(100_000,0.001,0).i).toBe(2);
});
it("the return front arrives at each observation point at (2l-x)/v", () => {
  for(const x of [0,25_000,50_000,75_000,100_000]) {
    const arrival=(200_000-x)/200_000_000;
    expect(lineStep(x,arrival-1e-9).reflected).toBe(0);
    expect(lineStep(x,arrival).reflected).toBeCloseTo(50/3,12);
  }
});
