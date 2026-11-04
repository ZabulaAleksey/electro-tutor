/** Four planar DC topologies, SI. Meshes clockwise; branch1 up, others down.
 * E2 in preset3 is defined bottom-positive; all other E are top-positive.
 * Signed source power uses fixed top-to-bottom voltage/current references. */
export type MeshExample = 1 | 2 | 3 | 4;
export type MeshParameters = { example: MeshExample; r: number[]; emf: number[]; current: number };
export type MeshError = "invalid_input" | "resistance_range" | "source_range" | "inconsistent" | "underdetermined" | "numerical_limit";
export type MeshSolution = { status: "ok"; matrix: number[][]; rhs: number[]; rowUnits: ("V" | "A")[]; mesh: number[]; branch: number[]; voltages: number[]; resistorPower: number[]; nodeVoltage: number; sources: { id: string; voltage: number; current: number; power: number }[]; generated: number; absorbed: number; residuals: { kcl: number; kvl: number; constraint: number; ohm: number; power: number }; };
export type MeshResult = MeshSolution | { status: "error"; code: MeshError };
export function meshPreset(example: MeshExample): MeshParameters {
  return { example, r: example === 3 ? [2, 4, 6, 2] : example === 4 ? [2, 4] : [2, 4, 2], emf: example === 3 ? [24, 6] : example === 2 ? [12, 24] : [12], current: example === 4 ? 1 : 0 };
}
/** Row equilibration permits the supermesh's mixed V/A equations. Partial pivot
 * elimination reports rank failures, never a pseudoinverse or fabricated zeros.
 * Near-zero nonzero pivots/ambiguous rank are numerical_limit, not a unique solution. */
function linear(matrix: number[][], rhs: number[]): number[] | MeshError {
  if (matrix.some((row, k) => row.every(v => v === 0) && rhs[k] !== 0)) return "inconsistent";
  const a = matrix.map((row, k) => { const scale = Math.max(...row.map(Math.abs)) || 1; return [...row.map(v => v / scale), rhs[k] / scale]; });
  const n = rhs.length, eps = 1e-12, rhsScale = Math.max(...a.map(row => Math.abs(row[n]))) || 1;
  let rank = 0, ambiguous = false;
  const columns: number[] = [];
  for (let col = 0; col < n && rank < n; col++) {
    let pivot = rank;
    for (let k = rank + 1; k < n; k++) if (Math.abs(a[k][col]) > Math.abs(a[pivot][col])) pivot = k;
    const value = Math.abs(a[pivot][col]);
    if (value <= eps) { if (value !== 0) ambiguous = true; continue; }
    [a[rank], a[pivot]] = [a[pivot], a[rank]];
    const divisor = a[rank][col];
    for (let j = col; j <= n; j++) a[rank][j] /= divisor;
    for (let k = rank + 1; k < n; k++) { const factor = a[k][col]; for (let j = col; j <= n; j++) a[k][j] -= factor * a[rank][j]; }
    columns.push(col); rank++;
  }
  for (let k = rank; k < n; k++) {
    if (Math.abs(a[k][n]) > eps * rhsScale) return "inconsistent";
    if (a[k][n] !== 0) ambiguous = true;
  }
  if (rank < n) return ambiguous ? "numerical_limit" : "underdetermined";
  const x = Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) x[columns[k]] = a[k][n] - a[k].slice(0, n).reduce((sum, v, j) => sum + (j > columns[k] ? v * x[j] : 0), 0);
  return x.every(Number.isFinite) ? x : "numerical_limit";
}
export function solveMesh(p: MeshParameters): MeshResult {
  const fail = (code: MeshError): MeshResult => ({ status: "error", code });
  if (!p || ![1, 2, 3, 4].includes(p.example) || !Array.isArray(p.r) || !Array.isArray(p.emf) || p.r.length !== (p.example === 3 ? 4 : p.example === 4 ? 2 : 3) || p.emf.length !== (p.example === 2 || p.example === 3 ? 2 : 1)) return fail("invalid_input");
  if (![...p.r, ...p.emf, p.current].every(v => typeof v === "number" && Number.isFinite(v))) return fail("invalid_input");
  if (p.r.some(v => v !== 0 && (v < .001 || v > 1e6))) return fail("resistance_range");
  if (p.emf.some(v => Math.abs(v) > 1e4) || Math.abs(p.current) > 1e3 || (p.example !== 4 && p.current !== 0)) return fail("source_range");
  const [r1, r2, r3, r4] = p.r, [e1, e2 = 0] = p.emf, triple = p.example === 3, supermesh = p.example === 4;
  const matrix = triple ? [[r1 + r2, -r2, 0], [-r2, r2 + r3, -r3], [0, -r3, r3 + r4]] : supermesh ? [[r1, r2], [1, -1]] : [[r1 + r3, -r3], [-r3, r2 + r3]];
  const rhs = triple ? [e1, 0, e2] : supermesh ? [e1, p.current] : [e1, -e2];
  const mesh = linear(matrix, rhs); if (typeof mesh === "string") return fail(mesh);
  const [m1, m2, m3] = mesh;
  const branch = triple ? [m1, m1 - m2, m2 - m3, m3] : [m1, m1 - m2, m2];
  const resistorCurrents = triple ? branch : supermesh ? [branch[0], branch[2]] : [branch[0], branch[2], branch[1]];
  const voltages = p.r.map((r, k) => r * resistorCurrents[k]), resistorPower = p.r.map((r, k) => r * resistorCurrents[k] ** 2);
  const nodeVoltage = triple ? voltages[1] : supermesh ? voltages[1] : voltages[2];
  const sources = [{ id: "E1", voltage: e1, current: -branch[0], power: -e1 * branch[0] }];
  if (p.example === 2 || triple) { const voltage = triple ? -e2 : e2, current = branch.at(-1)!; sources.push({ id: "E2", voltage, current, power: voltage * current }); }
  if (supermesh) sources.push({ id: "J", voltage: nodeVoltage, current: p.current, power: nodeVoltage * p.current });
  const generated = -sources.reduce((sum, s) => sum + Math.min(0, s.power), 0), absorbed = resistorPower.reduce((a, b) => a + b, 0) + sources.reduce((sum, s) => sum + Math.max(0, s.power), 0);
  const kvl = triple ? [e1 - voltages[0] - voltages[1], voltages[1] - voltages[2], e2 + voltages[2] - voltages[3]] : [e1 - voltages[0] - nodeVoltage, nodeVoltage - voltages[1] - e2];
  // Nodal constitutive cross-check, not the telescoping mesh-current identity.
  // An ideal wire has undefined U/R; retain its current and verify voltage by KVL.
  const through = (drop: number, resistance: number, current: number) => resistance === 0 ? current : drop / resistance;
  const nodal = triple ? [through(e1 - nodeVoltage, r1, branch[0]), through(nodeVoltage, r2, branch[1]), through(nodeVoltage, r3, branch[2]), through(nodeVoltage + e2, r4, branch[3])] : [through(e1 - nodeVoltage, r1, branch[0]), supermesh ? p.current : through(nodeVoltage, r3, branch[1]), through(nodeVoltage - e2, r2, branch[2])];
  const residuals = { kcl: nodal[0] - nodal.slice(1).reduce((a, b) => a + b, 0), kvl: Math.max(...kvl.map(Math.abs)), constraint: supermesh ? branch[1] - p.current : 0, ohm: Math.max(...nodal.map((value, k) => Math.abs(value - branch[k]))), power: absorbed - generated };
  const vScale = Math.max(1, ...p.emf.map(Math.abs), ...voltages.map(Math.abs)), iScale = Math.max(1, ...branch.map(Math.abs), Math.abs(p.current)), powerScale = Math.max(1, generated, absorbed);
  if (![...mesh, ...branch, ...voltages, ...resistorPower, generated, absorbed].every(Number.isFinite) || Math.abs(residuals.kcl) > 1e-8 * iScale || Math.abs(residuals.constraint) > 1e-8 * iScale || residuals.ohm > 1e-8 * iScale || residuals.kvl > 1e-8 * vScale || Math.abs(residuals.power) > 1e-8 * powerScale) return fail("numerical_limit");
  return { status: "ok", matrix, rhs, rowUnits: supermesh ? ["V", "A"] : rhs.map(() => "V"), mesh, branch, voltages, resistorPower, nodeVoltage, sources, generated, absorbed, residuals };
}
