import { describe, expect, it } from "vitest";
import { hasMachineLocalReference } from "./site-contract.mjs";
describe("RC1 deployment references",()=>{
 it("rejects concrete loopback URLs and machine user paths",()=>{
  for(const source of ['http://localhost:8000/api','http://127.0.0.1:4322/','http://[::1]:8000/','C:/Users/aleks/app','/home/aleks/app']) expect(hasMachineLocalReference(source)).toBe(true);
 });
 it("allows hostname validation policy without baked-in server URLs",()=>{
  expect(hasMachineLocalReference('["127.0.0.1","localhost","[::1]"]')).toBe(false);
  expect(hasMachineLocalReference('https://api.example/')).toBe(false);
 });
});
