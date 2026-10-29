import { validateBeam, type BeamScheme, type BeamLoad } from "../models/beam";

export type BeamPreset = "simple" | "left" | "right" | "fixed" | "triangle" | "continuous" | "combined";
export function beamPreset(name: BeamPreset = "simple"): BeamScheme {
  const scheme: BeamScheme = { version: 1, length: 4, segments: [{ start: 0, end: 4, EI: 2e7, EA: 2e9 }], supports: [{ id: "A", kind: "pin", x: 0 }, { id: "B", kind: "roller", x: 4 }], loads: [{ id: "F1", kind: "force", x: 2, value: -10000 }] };
  if (name === "left" || name === "right") { scheme.supports = [{ id: "A", kind: "fixed", x: name === "left" ? 0 : 4 }]; scheme.loads = [{ id: "F1", kind: "force", x: name === "left" ? 4 : 0, value: -10000 }]; }
  if (name === "fixed") { scheme.supports = [{ id: "A", kind: "fixed", x: 0 }, { id: "B", kind: "fixed", x: 4 }]; scheme.loads = [{ id: "q1", kind: "distributed", start: 0, end: 4, q0: -4000, q1: -4000 }]; }
  if (name === "triangle") scheme.loads = [{ id: "q1", kind: "distributed", start: 0, end: 4, q0: 0, q1: -6000 }];
  if (name === "continuous") { scheme.length = 6; scheme.segments = [{ start: 0, end: 3, EI: 2e7, EA: 2e9 }, { start: 3, end: 6, EI: 4e7, EA: 2e9 }]; scheme.supports = [{ id: "A", kind: "pin", x: 0 }, { id: "B", kind: "roller", x: 3 }, { id: "C", kind: "roller", x: 6 }]; scheme.loads = [{ id: "q1", kind: "distributed", start: 0, end: 6, q0: -3000, q1: -3000 }]; }
  if (name === "combined") { scheme.loads.push({ id: "M1", kind: "moment", x: 3, value: 5000 }, { id: "N1", kind: "axial", x: 4, value: 8000 }, { id: "q1", kind: "distributed", start: 0, end: 2, q0: -2000, q1: -4000 }); }
  return scheme;
}
export type BeamHistory = { current: BeamScheme; past: BeamScheme[]; future: BeamScheme[]; origin: BeamScheme | null };
export type BeamAction = { type: "commit" | "preview"; value: BeamScheme } | { type: "start" | "finish" | "cancel" | "undo" | "redo" };
export const initialHistory = (current = beamPreset()): BeamHistory => ({ current, past: [], future: [], origin: null });
const equal = (a: BeamScheme, b: BeamScheme) => JSON.stringify(a) === JSON.stringify(b);
export function beamHistory(state: BeamHistory, action: BeamAction): BeamHistory {
  if (action.type === "start") return state.origin ? state : { ...state, origin: state.current };
  if (action.type === "cancel") return state.origin ? { ...state, current: state.origin, origin: null } : state;
  if (action.type === "finish") return !state.origin ? state : equal(state.origin, state.current) ? { ...state, origin: null } : { ...state, past: [...state.past, state.origin].slice(-64), future: [], origin: null };
  if (action.type === "undo") { const value = state.past.at(-1); return !value || state.origin ? state : { current: value, past: state.past.slice(0, -1), future: [state.current, ...state.future].slice(0, 64), origin: null }; }
  if (action.type === "redo") { const value = state.future[0]; return !value || state.origin ? state : { current: value, past: [...state.past, state.current].slice(-64), future: state.future.slice(1), origin: null }; }
  if (!("value" in action)) return state;
  validateBeam(action.value);
  if (action.type === "preview") return { ...state, current: action.value };
  return equal(state.current, action.value) ? state : { current: action.value, past: [...state.past, state.current].slice(-64), future: [], origin: null };
}
export function resizeBeam(s: BeamScheme, length: number): BeamScheme {
  const r = length / s.length;
  return validateBeam({ ...s, length, supports: s.supports.map(a => ({ ...a, x: a.x * r })), segments: s.segments.map(g => ({ ...g, start: g.start * r, end: g.end * r })), loads: s.loads.map(l => l.kind === "distributed" ? { ...l, start: l.start * r, end: l.end * r } : { ...l, x: l.x * r }) });
}
export function moveBeamItem(s: BeamScheme, id: string, x: number, end = false): BeamScheme {
  x = Math.max(0, Math.min(s.length, x));
  return { ...s, supports: s.supports.map(a => a.id === id ? { ...a, x } : a), loads: s.loads.map(l => {
    if (l.id !== id) return l;
    if (l.kind !== "distributed") return { ...l, x };
    const gap = s.length * 1e-5;
    return end ? { ...l, end: Math.max(l.start + gap, x) } : { ...l, start: Math.min(l.end - gap, x) };
  }) };
}
export function reverseLoad(l: BeamLoad): BeamLoad { return l.kind === "distributed" ? { ...l, q0: -l.q0 || 0, q1: -l.q1 || 0 } : { ...l, value: -l.value || 0 }; }
