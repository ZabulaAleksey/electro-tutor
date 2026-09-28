use crate::config::SourceConfig;

pub trait SourcePort {
    fn voltage_at(&self, time_s: f64) -> f64;
    fn resistance_ohm(&self) -> f64;
}

#[derive(Clone, Copy)]
pub struct DcStepSource(pub SourceConfig);

impl SourcePort for DcStepSource {
    fn voltage_at(&self, time_s: f64) -> f64 {
        if time_s >= self.0.switch_time_s {
            self.0.voltage_v
        } else {
            0.0
        }
    }

    fn resistance_ohm(&self) -> f64 {
        self.0.resistance_ohm
    }
}
