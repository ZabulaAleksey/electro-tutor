import { describe, expect, it } from "vitest";
import { readInk, recognizeInk, type Ink, type SketchKind } from "./handwriting";

const stroke = (...values: [number, number][]) => values.map(([x, y]) => ({ x, y }));
const round = Array.from({ length: 25 }, (_, index) => {
  const angle = index * Math.PI / 12;
  return { x: 18 * Math.cos(angle), y: 17 * Math.sin(angle) };
});
const examples: [SketchKind, Ink][] = [
  ["r", [stroke([-25,-10],[26,-10],[27,9],[-25,10],[-25,-10])]],
  ["r", [stroke([-33,0],[-24,-8],[-15,9],[-7,-9],[0,10],[9,-8],[17,9],[24,-9],[31,1])]],
  ["c", [stroke([-6,-17],[-5,16]),stroke([5,-16],[6,18])]],
  ["l", [Array.from({length: 41},(_,i)=>({x:i*1.6,y:-11*Math.abs(Math.sin(i*Math.PI/10))}))]],
  ["ground", [stroke([-18,0],[18,1]),stroke([-12,6],[11,6]),stroke([-6,12],[6,13])]],
  ["source", [round,stroke([-5,-6],[6,-6]),stroke([0,-11],[0,-1]),stroke([-5,7],[5,7])]],
  ["current", [round,stroke([0,10],[0,-10],[-5,-3]),stroke([0,-10],[5,-3])]],
  ["switch", [stroke([-23,0],[-13,0]),stroke([-13,0],[8,-10]),stroke([13,0],[23,0])]],
];

describe("local circuit ink", () => {
  it.each(examples)("recognizes %s at different angles and scales", (kind, ink) => {
    for (const [angle, scale] of [[0,1],[.52,.8],[1.56,1.6],[2.73,2.4]]) {
      const rotate = (x: number, y: number) => ({
        x: 300 + (x*Math.cos(angle)-y*Math.sin(angle))*scale,
        y: 100 + (x*Math.sin(angle)+y*Math.cos(angle))*scale,
      });
      expect(recognizeInk(ink.map(line=>line.map(({x,y})=>rotate(x,y))),1)?.kind).toBe(kind);
    }
  });

  it("preserves endpoint positions and requires the marked-line gesture", () => {
    const a = {x:40,y:80}, b = {x:230,y:110};
    const line = stroke([41,80],[125,96],[232,110]);
    expect(recognizeInk([[a],[b],line],1)).toMatchObject({kind:"line",terminals:[a,b]});
    expect(recognizeInk([line],1)?.kind).toBe("wire");
    expect(recognizeInk([stroke([1,4],[14,4])],1)?.kind).toBe("wire");
    expect(recognizeInk([stroke([1,4],[900,4])],1)?.kind).toBe("wire");
    expect(recognizeInk([[a]],1)?.kind).toBe("junction");
    expect(recognizeInk([[a],[b],stroke([100,200],[260,200])],1)).toBeNull();
  });

  it("leaves crossings and low confidence ink pending", () => {
    expect(recognizeInk([stroke([0,0],[50,50]),stroke([50,0],[0,50])],1)).toBeNull();
    expect(recognizeInk([stroke([0,0],[10,22],[55,30],[1,45])],1)).toBeNull();
  });

  it("sanitizes local save data without changing geometry", () => {
    const ink = examples[0][1];
    expect(readInk(JSON.parse(JSON.stringify([ink])))).toEqual([ink]);
    expect(readInk([[[{x:"4",y:5}]],[[null]],[],...Array.from({length:30},()=>ink)])).toHaveLength(17);
  });
});
