use transient_core::config::{LineConfig, LoadConfig, LoadKind, SourceConfig, Topology};
use transient_core::line::TransmissionLine;

const TAU_S: f64 = 0.005;

fn simulation(source_resistance_ohm: f64) -> TransmissionLine {
    TransmissionLine::new(
        LineConfig {
            length_m: 1e6,
            velocity_m_s: 2e8,
            impedance_ohm: 50.0,
            cells: 1000,
            cfl: 0.9,
        },
        SourceConfig {
            voltage_v: 100.0,
            resistance_ohm: source_resistance_ohm,
            switch_time_s: 0.0,
        },
        LoadConfig {
            kind: LoadKind::Open,
            topology: Topology::Series,
            resistance_ohm: 50.0,
            inductance_h: 0.02,
            capacitance_f: 1e-5,
            initial_voltage_v: 0.0,
            initial_current_a: 0.0,
        },
    )
    .expect("valid lossless line")
}

fn near(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() < tolerance,
        "expected {expected} ± {tolerance}, got {actual}"
    );
}

#[test]
fn ideal_voltage_source_reverses_returning_wave_and_round_trips_continue() {
    let mut line = simulation(0.0);
    // Open load: +100 V launched, +100 V reflected at the load. The return
    // reaches the ideal source at 2τ; fixed source voltage sends −100 V back.
    line.advance_to(2.25 * TAU_S).expect("first source return");
    near(line.diagnostics().source_voltage_v, 100.0, 1e-10);
    near(line.voltages()[500], 200.0, 5.0);

    line.advance_to(3.25 * TAU_S).expect("second load arrival");
    near(line.diagnostics().source_voltage_v, 100.0, 1e-10);
    near(line.diagnostics().load_voltage_v, 0.0, 5.0);

    // The −100 V load reflection travels back, reverses again at 4τ, and
    // raises the open-load voltage to 200 V at 5τ.
    line.advance_to(5.25 * TAU_S).expect("third load arrival");
    near(line.diagnostics().load_voltage_v, 200.0, 5.0);
}

#[test]
fn matched_source_absorbs_returning_wave() {
    let mut line = simulation(50.0);
    line.advance_to(3.25 * TAU_S)
        .expect("source return absorbed");
    near(line.diagnostics().load_voltage_v, 100.0, 5.0);
    line.advance_to(5.25 * TAU_S)
        .expect("no further load reflection");
    near(line.diagnostics().load_voltage_v, 100.0, 5.0);
}
