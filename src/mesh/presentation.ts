import type { MeshParameters, MeshSolution } from "../models/mesh-current";
export const format3 = (v: number) => (Object.is(v, -0) ? 0 : v).toPrecision(3).replace(".", ",");
export function latexNumber(v: number) {
  const s = (Object.is(v, -0) ? 0 : v).toPrecision(3), [mantissa, exponent] = s.split("e");
  return mantissa.replace(".", "{,}") + (exponent ? `\\cdot10^{${Number(exponent)}}` : "");
}
export const parseValue = (s: string) => s.length <= 32 && /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(s.trim()) ? Number(s.trim().replace(",", ".")) : NaN;
export function parameterKeys(p: MeshParameters) { return [...p.r.map((_, k) => `R${k + 1}`), ...p.emf.map((_, k) => `E${k + 1}`), ...(p.example === 4 ? ["J"] : [])]; }
export function makeDraft(p: MeshParameters): Record<string, string> { return Object.fromEntries([...p.r.map((v, k) => [`R${k + 1}`, String(v)]), ...p.emf.map((v, k) => [`E${k + 1}`, String(v)]), ...(p.example === 4 ? [["J", String(p.current)]] : [])]); }
export function parameters(example: MeshParameters["example"], draft: Record<string, string>): MeshParameters { return { example, r: Array.from({ length: example === 3 ? 4 : example === 4 ? 2 : 3 }, (_, k) => parseValue(draft[`R${k + 1}`] ?? "")), emf: Array.from({ length: example === 2 || example === 3 ? 2 : 1 }, (_, k) => parseValue(draft[`E${k + 1}`] ?? "")), current: example === 4 ? parseValue(draft.J ?? "") : 0 }; }
export const unitFor = (key: string) => key.startsWith("R") ? "Ω" : key === "J" ? "A" : "V";
export function meshLatex(s: MeshSolution) {
  const matrix = `\\mathbf A=\\begin{bmatrix}${s.matrix.map(row => row.map(latexNumber).join("&")).join("\\\\")}\\end{bmatrix}`;
  const rhs = `\\mathbf b=\\begin{bmatrix}${s.rhs.map(latexNumber).join("\\\\")}\\end{bmatrix}`;
  const rows = s.matrix.map((row, k) => (row.map((v, j) => v === 0 ? "" : `${v < 0 ? "-" : "+"}${latexNumber(Math.abs(v))}I_{${j + 1}}`).join("").replace(/^\+/, "") || "0") + `=${latexNumber(s.rhs[k])}`);
  return { matrix, rhs, rows };
}
