import type { RollingInput, RollingMesh, Vec3 } from "./lab-model";

type Triangle = [number, number, number];
type Edge = [number, number];
type Face = { indices: Triangle; normal: Vec3; offset: number };
const planeTolerance = 1e-9;

function dot([x, y, z]: Vec3, [a, b, c]: Vec3) {
  return x * a + y * b + z * c;
}

function difference([x, y, z]: Vec3, [a, b, c]: Vec3): Vec3 {
  return [x - a, y - b, z - c];
}

function cross([x, y, z]: Vec3, [a, b, c]: Vec3): Vec3 {
  return [y * c - z * b, z * a - x * c, x * b - y * a];
}

function unit([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function hullFace(indices: Triangle, points: Vec3[], interior: Vec3): Face {
  const [a, b, c] = indices.map(index => points[index]);
  const direction = cross(difference(b, a), difference(c, a));
  const length = Math.hypot(...direction);
  if (length < Number.EPSILON) throw Error("ROLLING_FAILED");
  const normal: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
  const offset = dot(normal, a);
  if (dot(normal, interior) <= offset) return { indices, normal, offset };
  return { indices: [indices[0], indices[2], indices[1]], normal: [-normal[0], -normal[1], -normal[2]], offset: -offset };
}

function furthest(points: Vec3[], measure: (point: Vec3) => number) {
  let max = -Infinity, index = -1;
  points.forEach((point, i) => {
    const value = measure(point);
    if (value > max) {
      index = i;
      max = value;
    }
  });
  return index;
}

function hull(points: Vec3[]) {
  const a = furthest(points, point => -point[0]);
  const b = furthest(points, point => {
    const offset = difference(point, points[a]);
    return dot(offset, offset);
  });
  const axis = difference(points[b], points[a]);
  const c = furthest(points, point => {
    const perpendicular = cross(axis, difference(point, points[a]));
    return dot(perpendicular, perpendicular);
  });
  const normal = cross(axis, difference(points[c], points[a]));
  const d = furthest(points, point => Math.abs(dot(normal, difference(point, points[a]))));
  const seed = new Set([a, b, c, d]);
  // An interior point of this initial tetrahedron remains inside the expanded hull.
  const interior: Vec3 = [0, 0, 0];
  for (const i of seed) for (const axis of [0, 1, 2]) interior[axis] += points[i][axis] / 4;
  let faces = ([[a, b, c], [a, d, b], [b, d, c], [c, d, a]] as Triangle[])
    .map(indices => hullFace(indices, points, interior));

  points.forEach((point, index) => {
    if (seed.has(index)) return;
    const boundary = new Map<number, Edge>();
    const remaining: Face[] = [];
    for (const face of faces) {
      if (dot(face.normal, point) - face.offset <= planeTolerance) {
        remaining.push(face);
        continue;
      }
      const [x, y, z] = face.indices;
      const edges: Edge[] = [[x, y], [y, z], [z, x]];
      for (const [from, to] of edges) {
        if (!boundary.delete(to * points.length + from)) boundary.set(from * points.length + to, [from, to]);
      }
    }
    for (const [from, to] of boundary.values()) {
      remaining.push(hullFace([from, to, index], points, interior));
    }
    faces = remaining;
  });
  return faces.map(face => face.indices);
}

function shell(detail: number) {
  const golden = (1 + Math.sqrt(5)) / 2;
  const vertices: Vec3[] = [];
  for (const long of [-golden, golden]) {
    for (const short of [-1, 1]) vertices.push(unit([0, short, long]), unit([short, long, 0]), unit([long, 0, short]));
  }
  let triangles = hull(vertices);
  for (let level = 0; level < detail; level++) {
    const edgeMidpoints = new Map<number, number>();
    const stride = vertices.length;
    function midpoint(i: number, j: number) {
      const key = Math.min(i, j) * stride + Math.max(i, j);
      const previous = edgeMidpoints.get(key);
      if (previous !== undefined) return previous;
      const [a, b, c] = vertices[i], [x, y, z] = vertices[j];
      const index = vertices.length;
      vertices.push(unit([a + x, b + y, c + z]));
      edgeMidpoints.set(key, index);
      return index;
    }
    triangles = triangles.flatMap(([a, b, c]): Triangle[] => {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return vertices;
}

/** Inscribed ball samples and analytic outer generators preserve the convexity of the result. */
export function buildRollingMesh(radius: number, exterior: Vec3[], quality: RollingInput["quality"]): RollingMesh {
  const points = shell(quality === "compact" ? 2 : 3);
  for (const [x, y, z] of exterior) points.push([x / radius, y / radius, z / radius]);
  const triangles = hull(points);
  const packed: number[] = [];
  const remap = new Map<number, number>();
  const indices = triangles.flat().map(index => {
    const previous = remap.get(index);
    if (previous !== undefined) return previous;
    const next = packed.length / 3;
    const [x, y, z] = points[index];
    packed.push(x * radius, y * radius, z * radius);
    remap.set(index, next);
    return next;
  });
  return { vertices: new Float32Array(packed), triangles: new Uint32Array(indices) };
}
