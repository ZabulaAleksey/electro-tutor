import type { Complex } from "./math";
import { checkedMotionPoints } from "./polygon-motion-input";
import { motionMaxPoints, motionSvgMaxBytes } from "./polygon-motion-contract";

const svgNamespace = "http://www.w3.org/2000/svg";
const coordinateLimit = 1e6;
const pathStepsLimit = 1024;
const curvedStepsLimit = 64;
const curvedSamples = 1024;
const numberToken = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/g;
const pathToken = /[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/g;
const commandSizes = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 } as const;
type PathCommand = keyof typeof commandSizes;
type PathBlock = { command: PathCommand; relative: boolean; values: number[] };
const shapes = new Set(["path", "polygon", "polyline", "rect", "circle", "ellipse"]);

function rejectSvg(): never {
  throw Error("unsupported-svg");
}

function number(value: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value)) rejectSvg();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > coordinateLimit) rejectSvg();
  return parsed;
}

function tokens(value: string, pattern: RegExp) {
  const matches = Array.from(value.matchAll(pattern));
  let previous = 0;
  for (const match of matches) {
    const index = match.index!;
    if (!/^[\s,]*$/.test(value.slice(previous, index))) rejectSvg();
    previous = index + match[0].length;
  }
  if (!/^[\s,]*$/.test(value.slice(previous))) rejectSvg();
  return matches.map(match => match[0]);
}

function geometryNode(root: Element) {
  if (root.localName !== "svg" || (root.namespaceURI && root.namespaceURI !== svgNamespace)) rejectSvg();
  let geometry: Element | undefined;
  const elements = [root, ...root.querySelectorAll("*")];
  if (elements.length > 512) rejectSvg();
  for (const element of elements) {
    if (element.namespaceURI !== root.namespaceURI) rejectSvg();
    for (const attribute of element.attributes) {
      const key = attribute.localName.toLowerCase();
      if (key.startsWith("on") || key === "href" || key === "style" || key === "transform"
        || /\burl\s*\(/i.test(attribute.value)) rejectSvg();
    }
    if (element === root || element.localName === "g") continue;
    if (element.localName === "title" || element.localName === "desc") {
      if (element.children.length) rejectSvg();
      continue;
    }
    if (!shapes.has(element.localName) || geometry || element.children.length) rejectSvg();
    geometry = element;
  }
  if (!geometry) rejectSvg();
  return geometry;
}

function pointList(element: Element) {
  const coords = tokens(element.getAttribute("points") ?? "", numberToken);
  if (coords.length < 6 || coords.length % 2 || coords.length > 2 * motionMaxPoints) rejectSvg();
  const points = Array.from({ length: coords.length / 2 }, (_, index) => ({
    re: number(coords[2 * index]), im: number(coords[2 * index + 1]),
  }));
  if (element.localName === "polyline") {
    const first = points[0];
    const last = points.at(-1)!;
    if (first.re !== last.re || first.im !== last.im) rejectSvg();
    points.pop();
  }
  return points;
}

function arcParameters(parts: string[]) {
  let index = 0;
  let offset = 0;
  function takeNumber() {
    const part = parts[index++];
    if (!part) rejectSvg();
    const value = number(part.slice(offset));
    offset = 0;
    return value;
  }
  function takeFlag() {
    const part = parts[index];
    const flag = part?.[offset];
    if (flag !== "0" && flag !== "1") rejectSvg();
    if (++offset === part.length) {
      index++;
      offset = 0;
    }
    return Number(flag);
  }
  const result: number[] = [];
  // SVG arcs permit the two one-character flags and the next coordinate to be adjacent.
  while (index < parts.length) {
    const rx = takeNumber(), ry = takeNumber(), rotation = takeNumber();
    if (rx < 0 || ry < 0) rejectSvg();
    result.push(rx, ry, rotation, takeFlag(), takeFlag(), takeNumber(), takeNumber());
  }
  return result;
}

function pathBlocks(path: string): PathBlock[] {
  const parts = tokens(path, pathToken);
  if (parts.length > pathStepsLimit * 8) rejectSvg();
  const result: PathBlock[] = [];
  let index = 0;
  let steps = 0;
  while (index < parts.length) {
    const letter = parts[index++];
    const op = letter.toUpperCase();
    if (!Object.hasOwn(commandSizes, op)) rejectSvg();
    const command = op as PathCommand;
    if ((result.length === 0) !== (command === "M")) rejectSvg();
    const begin = index;
    while (index < parts.length && !/^[a-z]$/i.test(parts[index])) index++;
    const parameters = parts.slice(begin, index);
    const values = command === "A" ? arcParameters(parameters) : parameters.map(number);
    const size = commandSizes[command];
    if (command === "Z" ? values.length || index !== parts.length : !values.length || values.length % size) rejectSvg();
    steps += size ? values.length / size : 1;
    if (steps > pathStepsLimit) rejectSvg();
    result.push({ command, relative: letter !== op, values });
  }
  if (result.at(-1)?.command !== "Z") rejectSvg();
  return result;
}

function linearPath(blocks: PathBlock[]) {
  const points: Complex[] = [];
  let re = 0;
  let im = 0;
  for (const { command, relative, values } of blocks) {
    const size = commandSizes[command];
    for (let index = 0; index < values.length; index += size) {
      if (command !== "V") re = values[index] + (relative ? re : 0);
      if (command !== "H") {
        const y = command === "V" ? values[index] : values[index + 1];
        im = y + (relative ? im : 0);
      }
      points.push({ re, im });
    }
  }
  return points;
}

type PathPoint = [number, number];
type CurveSegment = { length: number; pointAt: (distance: number) => Complex };

function nativeSegment(start: PathPoint, command: "A" | "C" | "Q", values: number[]): CurveSegment {
  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", `M ${start.join(" ")} ${command} ${values.join(" ")}`);
  const length = path.getTotalLength();
  if (!Number.isFinite(length)) rejectSvg();
  return { length, pointAt: distance => {
    const point = path.getPointAtLength(distance);
    return { re: point.x, im: point.y };
  } };
}

function lineSegment(start: PathPoint, end: PathPoint): CurveSegment {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  return { length, pointAt: distance => ({ re: start[0] + dx * distance / length, im: start[1] + dy * distance / length }) };
}

function pathSegments(blocks: PathBlock[]) {
  const segments: CurveSegment[] = [];
  const origin: PathPoint = [0, 0];
  let current = origin;
  let cubicControl = current;
  let quadraticControl = current;
  for (const { command, relative, values } of blocks) {
    if (command === "Z") {
      segments.push(lineSegment(current, origin));
      break;
    }
    const size = commandSizes[command];
    for (let index = command === "M" ? 2 : 0; index < values.length; index += size) {
      const start = current;
      const args = values.slice(index, index + size);
      const x = relative ? start[0] : 0;
      const y = relative ? start[1] : 0;
      const point = (offset: number): PathPoint => [x + args[offset], y + args[offset + 1]];
      let nextCubic: PathPoint | undefined;
      let nextQuadratic: PathPoint | undefined;
      if (command === "C" || command === "S") {
        const first = command === "C" ? point(0) : reflectControl(start, cubicControl);
        const second = point(size - 4);
        current = point(size - 2);
        segments.push(nativeSegment(start, "C", [...first, ...second, ...current]));
        nextCubic = second;
      } else if (command === "Q" || command === "T") {
        const control = command === "Q" ? point(0) : reflectControl(start, quadraticControl);
        current = point(size - 2);
        segments.push(nativeSegment(start, "Q", [...control, ...current]));
        nextQuadratic = control;
      } else if (command === "A") {
        current = point(5);
        segments.push(nativeSegment(start, "A", [...args.slice(0, 5), ...current]));
      } else {
        current = command === "H" ? [x + args[0], start[1]] : command === "V" ? [start[0], y + args[0]] : point(0);
        segments.push(lineSegment(start, current));
      }
      cubicControl = nextCubic ?? current;
      quadraticControl = nextQuadratic ?? current;
    }
  }
  return segments.filter(segment => segment.length > 0);
}

function reflectControl(point: PathPoint, control: PathPoint): PathPoint {
  return [2 * point[0] - control[0], 2 * point[1] - control[1]];
}

function sampleSegments(segments: CurveSegment[]) {
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (length <= 0) rejectSvg();
  let active = 0;
  let offset = 0;
  return Array.from({ length: curvedSamples }, (_, index) => {
    const distance = length * index / curvedSamples;
    while (active < segments.length - 1 && distance > offset + segments[active].length) {
      offset += segments[active++].length;
    }
    return segments[active].pointAt(distance - offset);
  });
}

function mapLengths(block: PathBlock, map: (value: number, axis: 0 | 1 | undefined, index: number) => number) {
  return block.values.map((value, index) => {
    if (block.command === "A") {
      const field = index % 7;
      if (field < 2) return map(value, undefined, index);
      if (field < 5) return value;
      return map(value, field === 5 ? 0 : 1, index);
    }
    const axis = block.command === "H" || (block.command !== "V" && index % 2 === 0) ? 0 : 1;
    return map(value, axis, index);
  });
}

function curvedPath(blocks: PathBlock[]) {
  const steps = blocks.reduce((sum, block) => sum + (block.command === "Z" ? 1 : block.values.length / commandSizes[block.command]), 0);
  if (steps > curvedStepsLimit) throw Error("svg-complexity");
  const origin = [blocks[0].values[0], blocks[0].values[1]];
  let extent = 1;
  const local = blocks.map(block => ({
    ...block,
    values: mapLengths(block, (value, axis, index) => {
      const absolute = !block.relative || (block.command === "M" && index < 2);
      const shifted = absolute && axis !== undefined ? value - origin[axis] : value;
      extent = Math.max(extent, Math.abs(shifted));
      return shifted;
    }),
  }));
  // The native point lookup walks a path from its start. Sample standalone
  // segments in local coordinates so each of the 1024 lookups walks one segment.
  const scale = 32 / extent;
  const segments = pathSegments(local.map(block => ({ ...block, values: mapLengths(block, value => value * scale) })));
  return sampleSegments(segments).map(({ re, im }) => ({ re: origin[0] + re / scale, im: origin[1] + im / scale }));
}

function fromPath(data: string) {
  const blocks = pathBlocks(data);
  if (blocks.every(({ command }) => "MLHVZ".includes(command))) return linearPath(blocks);
  return curvedPath(blocks);
}

function readGeometry(element: Element): Complex[] {
  const tag = element.localName;
  if (tag === "polygon" || tag === "polyline") return pointList(element);
  if (tag === "path") return fromPath(element.getAttribute("d") ?? "");
  const attr = (name: string, fallback = "0") => number(element.getAttribute(name) ?? fallback);
  if (tag === "rect") {
    const x = attr("x"), y = attr("y");
    const width = attr("width"), height = attr("height");
    if (width <= 0 || height <= 0 || attr("rx") !== 0 || attr("ry") !== 0) rejectSvg();
    return [{ re: x, im: y }, { re: x + width, im: y }, { re: x + width, im: y + height }, { re: x, im: y + height }];
  }
  const x = attr("cx"), y = attr("cy");
  const rx = attr(tag === "circle" ? "r" : "rx");
  const ry = tag === "circle" ? rx : attr("ry");
  if (rx <= 0 || ry <= 0) rejectSvg();
  return fromPath(`M ${x + rx} ${y} A ${rx} ${ry} 0 0 1 ${x - rx} ${y} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`);
}

export function readPolygonSvg(text: string): Complex[] {
  if (text.length > motionSvgMaxBytes || new TextEncoder().encode(text).length > motionSvgMaxBytes) throw Error("svg-limit");
  if (/<!\s*(?:DOCTYPE|ENTITY)|<\?(?!xml\s)/i.test(text)) rejectSvg();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) rejectSvg();
  const points = readGeometry(geometryNode(doc.documentElement));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { re, im } of points) {
    if (!Number.isFinite(re) || !Number.isFinite(im) || Math.abs(re) > coordinateLimit || Math.abs(im) > coordinateLimit) rejectSvg();
    minX = Math.min(minX, re); maxX = Math.max(maxX, re);
    minY = Math.min(minY, im); maxY = Math.max(maxY, im);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(span) || span <= 1e-9) throw Error("invalid-contour");
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = 1.8 / span;
  return checkedMotionPoints(points.map(({ re, im }) => ({ re: (re - centerX) * scale, im: (centerY - im) * scale })));
}
