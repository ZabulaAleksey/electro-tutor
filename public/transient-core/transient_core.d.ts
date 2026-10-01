/* tslint:disable */
/* eslint-disable */

/**
 * Copies only one render snapshot across the WASM boundary on request.
 * The hot timestep loop stays entirely in Rust and the worker owns this object.
 */
export class WasmSimulation {
    free(): void;
    [Symbol.dispose](): void;
    currents(): Float64Array;
    /**
     * Fixed-order numeric record, decoded by the Worker protocol adapter.
     * Optional device readings are zero when the selected topology lacks them.
     */
    diagnostics(): Float64Array;
    dt_s(): number;
    constructor(length_m: number, velocity_m_s: number, impedance_ohm: number, cells: number, cfl: number, source_voltage_v: number, source_resistance_ohm: number, switch_time_s: number, load_kind: string, topology: string, resistance_ohm: number, inductance_h: number, capacitance_f: number, initial_voltage_v: number, initial_current_a: number);
    reset(): void;
    seek(target_s: number): void;
    step_index(): number;
    step_many(count: number): void;
    time_s(): number;
    voltages(): Float64Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsimulation_free: (a: number, b: number) => void;
    readonly wasmsimulation_currents: (a: number) => [number, number];
    readonly wasmsimulation_diagnostics: (a: number) => [number, number];
    readonly wasmsimulation_dt_s: (a: number) => number;
    readonly wasmsimulation_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => [number, number, number];
    readonly wasmsimulation_reset: (a: number) => void;
    readonly wasmsimulation_seek: (a: number, b: number) => [number, number];
    readonly wasmsimulation_step_index: (a: number) => number;
    readonly wasmsimulation_step_many: (a: number, b: number) => [number, number];
    readonly wasmsimulation_time_s: (a: number) => number;
    readonly wasmsimulation_voltages: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
