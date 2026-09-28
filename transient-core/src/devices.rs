use crate::config::{LoadConfig, LoadKind, Topology};

#[derive(Clone, Copy, Debug)]
pub enum PortRelation {
    Linear { conductance: f64, bias_current: f64 },
    FixedVoltage(f64),
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DeviceState {
    pub current_a: f64,
    pub capacitor_voltage_v: Option<f64>,
    pub inductor_current_a: Option<f64>,
    pub stored_energy_j: f64,
}

/// The line knows only a terminal relation and the device's committed state.
/// A future nonlinear device can provide a residual F(v, i, x, t), while a
/// boundary solver extension handles it without changing TransmissionLine's API.
pub trait BoundaryDevice {
    fn relation(&self, old_voltage: f64, dt: f64) -> PortRelation;
    fn commit(&mut self, old_voltage: f64, new_voltage: f64, current: f64, dt: f64);
    fn reset(&mut self);
    fn state(&self) -> DeviceState;
    fn initial_terminal_voltage(&self) -> Option<f64> {
        None
    }
    fn nonlinear_residual(&self, _voltage: f64, _current: f64, _time: f64) -> Option<f64> {
        None
    }
}

pub struct LinearLoad {
    config: LoadConfig,
    capacitor_voltage_v: f64,
    inductor_current_a: f64,
    terminal_current_a: f64,
}

impl LinearLoad {
    pub fn new(config: LoadConfig) -> Self {
        Self {
            capacitor_voltage_v: config.initial_voltage_v,
            inductor_current_a: config.initial_current_a,
            terminal_current_a: 0.0,
            config,
        }
    }

    fn parts(&self) -> (bool, bool, bool) {
        self.config.kind.components()
    }
}

impl BoundaryDevice for LinearLoad {
    fn relation(&self, _old_voltage: f64, dt: f64) -> PortRelation {
        match self.config.kind {
            LoadKind::Open => return PortRelation::Linear { conductance: 0.0, bias_current: 0.0 },
            LoadKind::Short => return PortRelation::FixedVoltage(0.0),
            _ => {}
        }
        let (has_r, has_l, has_c) = self.parts();
        let r = if has_r { self.config.resistance_ohm } else { 0.0 };
        let l = self.config.inductance_h;
        let c = self.config.capacitance_f;
        let (conductance, bias_current) = match self.config.topology {
            Topology::Series if has_l => {
                let a = dt / (2.0 * l);
                let denominator = 1.0 + a * r + if has_c { a * dt / (2.0 * c) } else { 0.0 };
                (a / denominator,
                    (self.inductor_current_a - if has_c { a * self.capacitor_voltage_v } else { 0.0 }) / denominator)
            }
            Topology::Series if has_c => {
                let denominator = r + dt / (2.0 * c);
                (1.0 / denominator, -self.capacitor_voltage_v / denominator)
            }
            Topology::Series => (1.0 / r, 0.0),
            Topology::Parallel => {
                let g_r = if has_r { 1.0 / r } else { 0.0 };
                let g_l = if has_l { dt / (2.0 * l) } else { 0.0 };
                let g_c = if has_c { 2.0 * c / dt } else { 0.0 };
                let bias = if has_l { self.inductor_current_a } else { 0.0 }
                    - g_c * self.capacitor_voltage_v;
                (g_r + g_l + g_c, bias)
            }
        };
        PortRelation::Linear { conductance, bias_current }
    }

    fn commit(&mut self, old_voltage: f64, new_voltage: f64, current: f64, dt: f64) {
        self.terminal_current_a = current;
        let (_, has_l, has_c) = self.parts();
        if self.config.topology == Topology::Series {
            if has_l {
                self.inductor_current_a = 2.0 * current - self.inductor_current_a;
            }
            if has_c {
                self.capacitor_voltage_v += dt * current / self.config.capacitance_f;
            }
        } else {
            let mid_voltage = (old_voltage + new_voltage) / 2.0;
            if has_l {
                self.inductor_current_a += dt * mid_voltage / self.config.inductance_h;
            }
            if has_c {
                self.capacitor_voltage_v = 2.0 * mid_voltage - self.capacitor_voltage_v;
            }
        }
    }

    fn reset(&mut self) {
        self.capacitor_voltage_v = self.config.initial_voltage_v;
        self.inductor_current_a = self.config.initial_current_a;
        self.terminal_current_a = 0.0;
    }

    fn state(&self) -> DeviceState {
        let (_, has_l, has_c) = self.parts();
        let energy = if has_l {
            0.5 * self.config.inductance_h * self.inductor_current_a.powi(2)
        } else { 0.0 } + if has_c {
            0.5 * self.config.capacitance_f * self.capacitor_voltage_v.powi(2)
        } else { 0.0 };
        DeviceState {
            current_a: self.terminal_current_a,
            capacitor_voltage_v: has_c.then_some(self.capacitor_voltage_v),
            inductor_current_a: has_l.then_some(self.inductor_current_a),
            stored_energy_j: energy,
        }
    }

    fn initial_terminal_voltage(&self) -> Option<f64> {
        let (_, _, has_c) = self.parts();
        (self.config.topology == Topology::Parallel && has_c
            || self.config.kind == LoadKind::C).then_some(self.config.initial_voltage_v)
    }
}
