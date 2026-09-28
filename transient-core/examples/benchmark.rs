use std::time::Instant;
use transient_core::config::{LineConfig, LoadConfig, LoadKind, SourceConfig, Topology};
use transient_core::line::TransmissionLine;

fn main() {
    println!("cells,steps,elapsed_ms,steps_per_second,simulated_seconds_per_second,snapshot_copy_us,state_kib");
    for cells in [1000, 5000, 10000] {
        let mut line = TransmissionLine::new(
            LineConfig { length_m: 1e6, velocity_m_s: 2e8, impedance_ohm: 50.0, cells, cfl: 0.9 },
            SourceConfig { voltage_v: 100.0, resistance_ohm: 50.0, switch_time_s: 0.0 },
            LoadConfig { kind: LoadKind::Open, topology: Topology::Series,
                resistance_ohm: 50.0, inductance_h: 0.02, capacitance_f: 1e-5,
                initial_voltage_v: 0.0, initial_current_a: 0.0 },
        ).expect("valid benchmark config");
        let steps = 1000;
        let started = Instant::now();
        for _ in 0..steps { line.step_many(1).expect("finite state"); }
        let seconds = started.elapsed().as_secs_f64();
        let snapshot_started = Instant::now();
        let copies = 100;
        for _ in 0..copies {
            std::hint::black_box((line.voltages().to_vec(), line.currents().to_vec()));
        }
        let snapshot_us = snapshot_started.elapsed().as_secs_f64() * 1e6 / copies as f64;
        println!("{cells},{steps},{:.3},{:.0},{:.6},{:.2},{:.1}", seconds * 1000.0,
            steps as f64 / seconds, line.time() / seconds, snapshot_us,
            line.storage_f64_count() as f64 * 8.0 / 1024.0);
    }
}
