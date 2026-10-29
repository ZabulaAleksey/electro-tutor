/** Independent closed-form reference verification; deliberately no solver import.
 * Loads and lengths come from fixtures; equilibrium/compatibility formulas below
 * recompute every persisted reference before the numerical solver suite runs. */
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync(new URL("../src/models/beam-goldens.json", import.meta.url), "utf8"));
let assertions = 0;
for (const { id, scheme: s, expected: e } of fixtures) {
  const L = s.length, point = s.loads.find(l => l.kind === "force"), P = point ? -point.value : 0, a = point?.x ?? 0, q = s.loads.find(l => l.kind === "distributed"), w = q ? -q.q1 : 0;
  const eq = (actual, reference, label) => { assertions++; if (!Number.isFinite(actual) || Math.abs(actual - reference) > 1e-8 * Math.max(1, Math.abs(reference))) throw Error(`${id}/${label}: saved ${actual}; analytical ${reference}`); };
  const R = (i, Fy, M, Fx) => { if (Fy !== undefined) eq(e.reactions[i].Fy, Fy, `Ry${i}`); if (M !== undefined) eq(e.reactions[i].M, M, `M${i}`); if (Fx !== undefined) eq(e.reactions[i].Fx, Fx, `Rx${i}`); };
  const at = (key, expression) => { if (e.at?.[key] !== undefined) eq(e.at[key], expression(e.at.x), key); };
  switch (id) {
    case "cantilever-tip-force": R(0, P, P * L); eq(e.tipLeft.Q, P, "Qtip-"); eq(e.tipLeft.M, 0, "Mtip-"); break;
    case "cantilever-tip-moment": { const m = s.loads[0].value; R(0, 0, -m); eq(e.tipLeft.M, m, "Mtip-"); eq(e.tipRight.M, 0, "Mtip+"); break; }
    case "cantilever-udl": R(0, w * L, w * L * L / 2); at("Q", x => w * (L - x)); at("M", x => -w * (L - x) ** 2 / 2); break;
    case "simple-centre-force": case "simple-offset-force": case "variable-ei": { const A = P * (L - a) / L; R(0, A); R(1, P * a / L); at("M", x => A * x - P * Math.max(0, x - a)); if (e.at?.Q !== undefined) at("Q", () => A); if (e.jump) { eq(e.jump.leftQ, A, "Q-"); eq(e.jump.rightQ, A - P, "Q+"); } break; }
    case "simple-udl": R(0, w * L / 2); R(1, w * L / 2); at("M", x => w * x * (L - x) / 2); at("Q", x => w * (L / 2 - x)); break;
    case "simple-triangular": R(0, w * L / 6); R(1, w * L / 3); at("M", x => w * L * x / 6 - w * x ** 3 / (6 * L)); break;
    case "simple-multiple-forces": { const A = s.loads.reduce((v, l) => v - l.value * (L - l.x) / L, 0), total = -s.loads.reduce((v, l) => v + l.value, 0); R(0, A); R(1, total - A); at("M", x => A * x + s.loads.reduce((v, l) => v + l.value * Math.max(0, x - l.x), 0)); break; }
    case "combined-axial-transverse": { const H = s.loads.find(l => l.kind === "axial").value; R(0, P / 2, undefined, -H); R(1, P / 2); at("N", () => H); at("M", x => P * x / 2); break; }
    case "fixed-fixed-udl": R(0, w * L / 2, w * L * L / 12); R(1, w * L / 2, -w * L * L / 12); at("M", x => -w * L * L / 12 + w * L * x / 2 - w * x * x / 2); break;
    case "intermediate-support": {
      const b = s.supports[1].x;
      // δ(b) for a simply supported beam loaded at a≤b; unit-load flexibility f(b,b).
      const delta = P * a * (L - b) * (L * L - a * a - (L - b) ** 2) / (6 * L), flexibility = b * b * (L - b) ** 2 / (3 * L), C = delta / flexibility;
      R(0, P * (L - a) / L - C * (L - b) / L); R(1, C); R(2, P * a / L - C * b / L); break;
    }
    case "right-console": R(0, P, -P * L); break;
    default: throw Error(`No independent analytic reference for ${id}`);
  }
}
console.log(`Independent analytical references: ${fixtures.length} cases / ${assertions} assertions PASS (no numerical-kernel import).`);
