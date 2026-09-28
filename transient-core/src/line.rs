use crate::config::{LineConfig, LoadConfig, SimError, SourceConfig};
use crate::devices::{BoundaryDevice, DeviceState, LinearLoad, PortRelation};
use crate::source::{DcStepSource, SourcePort};

/// Per-cell layout leaves room for spatial R', L', G', C' and nonuniform dx.
/// R/G are zero in the lossless MVP and are not silently applied as losses.
pub struct Grid {
    pub dx_m: Vec<f64>,
    pub inductance_h: Vec<f64>,
    pub resistance_ohm: Vec<f64>,
    pub capacitance_f: Vec<f64>,
    pub conductance_s: Vec<f64>,
}

impl Grid {
    fn uniform(config: LineConfig) -> Result<Self, SimError> {
        let dx = config.length_m / config.cells as f64;
        let inductance = config.impedance_ohm / config.velocity_m_s * dx;
        let capacitance = dx / (config.impedance_ohm * config.velocity_m_s);
        if !inductance.is_finite()
            || inductance <= 0.0
            || !capacitance.is_finite()
            || capacitance <= 0.0
        {
            return Err(SimError::Invalid("derived LC grid"));
        }
        let mut node_c = vec![capacitance; config.cells + 1];
        node_c[0] *= 0.5;
        node_c[config.cells] *= 0.5;
        Ok(Self {
            dx_m: vec![dx; config.cells],
            inductance_h: vec![inductance; config.cells],
            resistance_ohm: vec![0.0; config.cells],
            capacitance_f: node_c,
            conductance_s: vec![0.0; config.cells + 1],
        })
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Diagnostics {
    pub time_s: f64,
    pub step_index: u64,
    pub dt_s: f64,
    pub dx_m: f64,
    pub cfl: f64,
    pub travel_time_s: f64,
    pub source_voltage_v: f64,
    pub source_current_a: f64,
    pub load_voltage_v: f64,
    pub load_current_a: f64,
    pub min_voltage_v: f64,
    pub max_voltage_v: f64,
    pub min_current_a: f64,
    pub max_current_a: f64,
    pub line_energy_j: f64,
    pub device: DeviceState,
}

/// Current values are staggered by half a timestep relative to voltage.
/// Only this state, port states, and O(N) spatial coefficients are retained.
pub struct TransmissionLine {
    config: LineConfig,
    pub grid: Grid,
    voltages: Vec<f64>,
    currents: Vec<f64>,
    source: Box<dyn SourcePort>,
    load: Box<dyn BoundaryDevice>,
    step_index: u64,
    source_current_a: f64,
}

impl TransmissionLine {
    pub fn new(line: LineConfig, source: SourceConfig, load: LoadConfig) -> Result<Self, SimError> {
        let line = line.validate()?;
        let source = source.validate()?;
        let load = load.validate()?;
        let grid = Grid::uniform(line)?;
        let mut result = Self {
            config: line,
            grid,
            voltages: vec![0.0; line.cells + 1],
            currents: vec![0.0; line.cells],
            source: Box::new(DcStepSource(source)),
            load: Box::new(LinearLoad::new(load)),
            step_index: 0,
            source_current_a: 0.0,
        };
        result.reset();
        Ok(result)
    }

    pub fn reset(&mut self) {
        self.voltages.fill(0.0);
        self.currents.fill(0.0);
        self.step_index = 0;
        self.source_current_a = 0.0;
        self.load.reset();
        if let Some(voltage) = self.load.initial_terminal_voltage() {
            self.voltages[self.config.cells] = voltage;
        }
        if self.source.resistance_ohm() == 0.0 {
            self.voltages[0] = self.source.voltage_at(0.0);
        }
    }

    pub fn dt(&self) -> f64 {
        self.config.cfl * self.grid.dx_m[0] / self.config.velocity_m_s
    }

    pub fn time(&self) -> f64 {
        self.step_index as f64 * self.dt()
    }

    pub fn step_index(&self) -> u64 {
        self.step_index
    }

    pub fn cells(&self) -> usize {
        self.config.cells
    }

    pub fn storage_f64_count(&self) -> usize {
        self.voltages.len()
            + self.currents.len()
            + self.grid.dx_m.len()
            + self.grid.inductance_h.len()
            + self.grid.resistance_ohm.len()
            + self.grid.capacitance_f.len()
            + self.grid.conductance_s.len()
    }

    pub fn voltages(&self) -> &[f64] {
        &self.voltages
    }

    pub fn currents(&self) -> &[f64] {
        &self.currents
    }

    pub fn step_many(&mut self, count: u32) -> Result<(), SimError> {
        if count > 100_000 {
            return Err(SimError::TooManySteps);
        }
        for _ in 0..count {
            self.step()?;
        }
        Ok(())
    }

    pub fn advance_to(&mut self, target_s: f64) -> Result<(), SimError> {
        if !target_s.is_finite() || target_s < 0.0 {
            return Err(SimError::Invalid("target time"));
        }
        if target_s < self.time() - self.dt() * 0.5 {
            self.reset();
        }
        let target_step = (target_s / self.dt()).ceil();
        if !target_step.is_finite() || target_step > 5_000_000.0 {
            return Err(SimError::TooManySteps);
        }
        let remaining = (target_step as u64).saturating_sub(self.step_index);
        for _ in 0..remaining {
            self.step()?;
        }
        Ok(())
    }

    fn step(&mut self) -> Result<(), SimError> {
        let dt = self.dt();
        let n = self.config.cells;
        let old_time = self.time();
        let new_step = self
            .step_index
            .checked_add(1)
            .ok_or(SimError::TooManySteps)?;
        for k in 0..n {
            self.currents[k] +=
                dt / self.grid.inductance_h[k] * (self.voltages[k] - self.voltages[k + 1]);
        }

        let old_source = self.voltages[0];
        let source_voltage = self.source.voltage_at(old_time + dt * 0.5);
        let source_resistance = self.source.resistance_ohm();
        let c0_over_dt = self.grid.capacitance_f[0] / dt;
        let new_source = if source_resistance == 0.0 {
            self.source.voltage_at(new_step as f64 * dt)
        } else {
            let conductance = 1.0 / source_resistance;
            (c0_over_dt * old_source + conductance * source_voltage
                - self.currents[0]
                - conductance * old_source * 0.5)
                / (c0_over_dt + conductance * 0.5)
        };
        self.voltages[0] = new_source;
        self.source_current_a = if source_resistance == 0.0 {
            c0_over_dt * (new_source - old_source) + self.currents[0]
        } else {
            (source_voltage - (old_source + new_source) * 0.5) / source_resistance
        };

        for k in 1..n {
            self.voltages[k] +=
                dt / self.grid.capacitance_f[k] * (self.currents[k - 1] - self.currents[k]);
        }

        let old_load = self.voltages[n];
        let cn_over_dt = self.grid.capacitance_f[n] / dt;
        let (new_load, load_current) = match self.load.relation(old_load, dt) {
            PortRelation::FixedVoltage(voltage) => (
                voltage,
                self.currents[n - 1] - cn_over_dt * (voltage - old_load),
            ),
            PortRelation::Linear {
                conductance,
                bias_current,
            } => {
                let voltage = (cn_over_dt * old_load + self.currents[n - 1]
                    - conductance * old_load * 0.5
                    - bias_current)
                    / (cn_over_dt + conductance * 0.5);
                let current = conductance * (old_load + voltage) * 0.5 + bias_current;
                (voltage, current)
            }
        };
        self.voltages[n] = new_load;
        self.load.commit(old_load, new_load, load_current, dt);
        self.step_index = new_step;

        if !self.source_current_a.is_finite()
            || !load_current.is_finite()
            || !self.voltages.iter().all(|v| v.is_finite())
            || !self.currents.iter().all(|i| i.is_finite())
        {
            return Err(SimError::NonFinite);
        }
        Ok(())
    }

    pub fn diagnostics(&self) -> Diagnostics {
        let (min_voltage_v, max_voltage_v) = min_max(&self.voltages);
        let (min_current_a, max_current_a) = min_max(&self.currents);
        let electric = self
            .voltages
            .iter()
            .zip(self.grid.capacitance_f.iter())
            .map(|(v, c)| 0.5 * c * v * v)
            .sum::<f64>();
        let magnetic = self
            .currents
            .iter()
            .zip(self.grid.inductance_h.iter())
            .map(|(i, l)| 0.5 * l * i * i)
            .sum::<f64>();
        Diagnostics {
            time_s: self.time(),
            step_index: self.step_index,
            dt_s: self.dt(),
            dx_m: self.grid.dx_m[0],
            cfl: self.config.cfl,
            travel_time_s: self.config.length_m / self.config.velocity_m_s,
            source_voltage_v: self.voltages[0],
            source_current_a: self.source_current_a,
            load_voltage_v: self.voltages[self.config.cells],
            load_current_a: self.load.state().current_a,
            min_voltage_v,
            max_voltage_v,
            min_current_a,
            max_current_a,
            line_energy_j: electric + magnetic,
            device: self.load.state(),
        }
    }
}

fn min_max(values: &[f64]) -> (f64, f64) {
    values
        .iter()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
            (min.min(*value), max.max(*value))
        })
}
