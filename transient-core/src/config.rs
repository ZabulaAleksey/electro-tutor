use std::fmt;

#[derive(Clone, Debug, PartialEq)]
pub enum SimError {
    Invalid(&'static str),
    Unstable,
    NonFinite,
    TooManySteps,
}

impl fmt::Display for SimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(field) => write!(f, "Invalid simulation parameter: {field}"),
            Self::Unstable => write!(f, "CFL limit exceeded"),
            Self::NonFinite => write!(f, "Simulation produced a non-finite value"),
            Self::TooManySteps => write!(f, "Requested time exceeds the safe step limit"),
        }
    }
}

impl std::error::Error for SimError {}

#[derive(Clone, Copy, Debug)]
pub struct LineConfig {
    pub length_m: f64,
    pub velocity_m_s: f64,
    pub impedance_ohm: f64,
    pub cells: usize,
    pub cfl: f64,
}

impl LineConfig {
    pub fn validate(self) -> Result<Self, SimError> {
        if !self.length_m.is_finite() || self.length_m <= 0.0 || self.length_m > 1e10 {
            return Err(SimError::Invalid("length"));
        }
        if !self.velocity_m_s.is_finite() || self.velocity_m_s <= 0.0 || self.velocity_m_s > 3e8 {
            return Err(SimError::Invalid("wave velocity"));
        }
        if !self.impedance_ohm.is_finite() || self.impedance_ohm <= 0.0 || self.impedance_ohm > 1e6
        {
            return Err(SimError::Invalid("characteristic impedance"));
        }
        if !(20..=10000).contains(&self.cells) {
            return Err(SimError::Invalid("cell count"));
        }
        if !self.cfl.is_finite() || self.cfl <= 0.0 || self.cfl > 0.95 {
            return Err(SimError::Unstable);
        }
        let dx = self.length_m / self.cells as f64;
        let dt = self.cfl * dx / self.velocity_m_s;
        if !dx.is_finite() || !dt.is_finite() || dt <= 0.0 {
            return Err(SimError::Invalid("grid spacing"));
        }
        Ok(self)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct SourceConfig {
    pub voltage_v: f64,
    pub resistance_ohm: f64,
    pub switch_time_s: f64,
}

impl SourceConfig {
    pub fn validate(self) -> Result<Self, SimError> {
        if !self.voltage_v.is_finite() || self.voltage_v.abs() > 1e6 {
            return Err(SimError::Invalid("source voltage"));
        }
        if !self.resistance_ohm.is_finite()
            || self.resistance_ohm < 0.0
            || self.resistance_ohm > 1e9
        {
            return Err(SimError::Invalid("source resistance"));
        }
        if !self.switch_time_s.is_finite() || self.switch_time_s < 0.0 || self.switch_time_s > 10.0
        {
            return Err(SimError::Invalid("switch time"));
        }
        Ok(self)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoadKind {
    Open,
    Short,
    R,
    L,
    C,
    RL,
    RC,
    RLC,
}

impl LoadKind {
    pub fn parse(value: &str) -> Result<Self, SimError> {
        match value {
            "open" => Ok(Self::Open),
            "short" => Ok(Self::Short),
            "r" => Ok(Self::R),
            "l" => Ok(Self::L),
            "c" => Ok(Self::C),
            "rl" => Ok(Self::RL),
            "rc" => Ok(Self::RC),
            "rlc" => Ok(Self::RLC),
            _ => Err(SimError::Invalid("load type")),
        }
    }

    pub fn components(self) -> (bool, bool, bool) {
        match self {
            Self::Open | Self::Short => (false, false, false),
            Self::R => (true, false, false),
            Self::L => (false, true, false),
            Self::C => (false, false, true),
            Self::RL => (true, true, false),
            Self::RC => (true, false, true),
            Self::RLC => (true, true, true),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Topology {
    Series,
    Parallel,
}

impl Topology {
    pub fn parse(value: &str) -> Result<Self, SimError> {
        match value {
            "series" => Ok(Self::Series),
            "parallel" => Ok(Self::Parallel),
            _ => Err(SimError::Invalid("load topology")),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct LoadConfig {
    pub kind: LoadKind,
    pub topology: Topology,
    pub resistance_ohm: f64,
    pub inductance_h: f64,
    pub capacitance_f: f64,
    pub initial_voltage_v: f64,
    pub initial_current_a: f64,
}

impl LoadConfig {
    pub fn validate(self) -> Result<Self, SimError> {
        let (r, l, c) = self.kind.components();
        if (r
            && (!self.resistance_ohm.is_finite()
                || self.resistance_ohm <= 0.0
                || self.resistance_ohm > 1e9))
            || (l
                && (!self.inductance_h.is_finite()
                    || self.inductance_h <= 0.0
                    || self.inductance_h > 1e9))
            || (c
                && (!self.capacitance_f.is_finite()
                    || self.capacitance_f <= 0.0
                    || self.capacitance_f > 1e6))
        {
            return Err(SimError::Invalid("passive load value"));
        }
        if !self.initial_voltage_v.is_finite()
            || self.initial_voltage_v.abs() > 1e6
            || !self.initial_current_a.is_finite()
            || self.initial_current_a.abs() > 1e6
        {
            return Err(SimError::Invalid("load initial state"));
        }
        Ok(self)
    }
}
