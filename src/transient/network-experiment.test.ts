import { describe, expect, it } from "vitest";
import { experimentRows, experimentTimeLabel, parseExperimentDuration } from "./network-experiment";
import { DEFAULT_NETWORK, simulateNetwork } from "./network";

describe("line experiment data",()=>{
 it.each([["1 µs",1e-6],["0,5 мс",.0005],["1 ms",.001],["10 ms",.01],["100 ms",.1],["1 s",1],["10 с",10]])("parses %s",(text,seconds)=>{
  expect(parseExperimentDuration(text)).toBe(seconds);
  expect(parseExperimentDuration(experimentTimeLabel(seconds,"ru",true))).toBe(seconds);
 });
 it.each(["", "1", "0 ms", "-1 s", "1 e3 s", "5 min"])("rejects %s",(text)=>{
  expect(parseExperimentDuration(text)).toBeNull();
 });
 it("keeps both values at a discontinuity and exports the complete interval",()=>{
  const run=simulateNetwork({...DEFAULT_NETWORK,durationS:1});
  const rows=[...experimentRows(run,run.config.sections[0].lengthM)];
  expect(rows[0]).toEqual([0,0,0]);
  expect(rows.at(-1)?.[0]).toBe(1);
  expect(rows.some((row,i)=>i>0&&row[0]===rows[i-1][0]&&row[1]!==rows[i-1][1])).toBe(true);
 });
});
