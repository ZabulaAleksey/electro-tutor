pub mod config;
pub mod devices;
pub mod line;
pub mod source;

use config::{LineConfig, LoadConfig, LoadKind, SimError, SourceConfig, Topology};
use line::TransmissionLine;
use wasm_bindgen::prelude::*;

fn js_error(error: SimError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

/// Copies only one render snapshot across the WASM boundary on request.
/// The hot timestep loop stays entirely in Rust and the worker owns this object.
#[wasm_bindgen]
pub struct WasmSimulation {
    inner: TransmissionLine,
}

#[wasm_bindgen]
impl WasmSimulation {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        length_m: f64,
        velocity_m_s: f64,
        impedance_ohm: f64,
        cells: u32,
        cfl: f64,
        source_voltage_v: f64,
        source_resistance_ohm: f64,
        switch_time_s: f64,
        load_kind: &str,
        topology: &str,
        resistance_ohm: f64,
        inductance_h: f64,
        capacitance_f: f64,
        initial_voltage_v: f64,
        initial_current_a: f64,
    ) -> Result<WasmSimulation, JsValue> {
        let line = LineConfig {
            length_m,
            velocity_m_s,
            impedance_ohm,
            cells: cells as usize,
            cfl,
        };
        let source = SourceConfig {
            voltage_v: source_voltage_v,
            resistance_ohm: source_resistance_ohm,
            switch_time_s,
        };
        let load = LoadConfig {
            kind: LoadKind::parse(load_kind).map_err(js_error)?,
            topology: Topology::parse(topology).map_err(js_error)?,
            resistance_ohm,
            inductance_h,
            capacitance_f,
            initial_voltage_v,
            initial_current_a,
        };
        let inner = TransmissionLine::new(line, source, load).map_err(js_error)?;
        Ok(Self { inner })
    }

    pub fn step_many(&mut self, count: u32) -> Result<(), JsValue> {
        self.inner.step_many(count).map_err(js_error)
    }

    pub fn seek(&mut self, target_s: f64) -> Result<(), JsValue> {
        self.inner.advance_to(target_s).map_err(js_error)
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }

    pub fn time_s(&self) -> f64 {
        self.inner.time()
    }

    pub fn dt_s(&self) -> f64 {
        self.inner.dt()
    }

    pub fn step_index(&self) -> f64 {
        self.inner.step_index() as f64
    }

    pub fn voltages(&self) -> Vec<f64> {
        self.inner.voltages().to_vec()
    }

    pub fn currents(&self) -> Vec<f64> {
        self.inner.currents().to_vec()
    }

    /// Fixed-order numeric record, decoded by the Worker protocol adapter.
    /// Optional device readings are zero when the selected topology lacks them.
    pub fn diagnostics(&self) -> Vec<f64> {
        let d = self.inner.diagnostics();
        vec![
            d.time_s,
            d.step_index as f64,
            d.dt_s,
            d.dx_m,
            d.cfl,
            d.travel_time_s,
            d.source_voltage_v,
            d.source_current_a,
            d.load_voltage_v,
            d.load_current_a,
            d.min_voltage_v,
            d.max_voltage_v,
            d.min_current_a,
            d.max_current_a,
            d.line_energy_j,
            d.device.capacitor_voltage_v.unwrap_or(0.0),
            d.device.inductor_current_a.unwrap_or(0.0),
            d.device.stored_energy_j,
        ]
    }
}
