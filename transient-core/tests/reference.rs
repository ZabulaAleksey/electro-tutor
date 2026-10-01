use transient_core::config::{LineConfig, LoadConfig, LoadKind, SimError, SourceConfig, Topology};
use transient_core::line::TransmissionLine;

fn line(cells: usize) -> LineConfig {
    LineConfig {
        length_m: 1e6,
        velocity_m_s: 2e8,
        impedance_ohm: 50.0,
        cells,
        cfl: 0.9,
    }
}
fn source() -> SourceConfig {
    SourceConfig {
        voltage_v: 100.0,
        resistance_ohm: 50.0,
        switch_time_s: 0.0,
    }
}
fn load(kind: LoadKind) -> LoadConfig {
    LoadConfig {
        kind,
        topology: Topology::Series,
        resistance_ohm: 50.0,
        inductance_h: 0.02,
        capacitance_f: 1e-5,
        initial_voltage_v: 0.0,
        initial_current_a: 0.0,
    }
}
fn sim(cells: usize, kind: LoadKind) -> TransmissionLine {
    TransmissionLine::new(line(cells), source(), load(kind)).expect("reference config")
}
fn near(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} ± {tolerance}, got {actual}"
    );
}

#[test]
fn propagation_speed_and_characteristic_relation() {
    let mut sim = sim(1000, LoadKind::Open);
    near(sim.diagnostics().travel_time_s, 0.005, 1e-12);
    sim.advance_to(0.003).expect("stable propagation");
    // An ideal step rings at an individual Yee-grid point. The passed-wave
    // plateau has the analytic 50 V / 1 A amplitude across a physical window.
    let plateau_start = sim.cells() / 5;
    let plateau_end = sim.cells() * 2 / 5;
    let plateau_v = sim.voltages()[plateau_start..plateau_end]
        .iter()
        .sum::<f64>()
        / (plateau_end - plateau_start) as f64;
    let plateau_i = sim.currents()[plateau_start..plateau_end]
        .iter()
        .sum::<f64>()
        / (plateau_end - plateau_start) as f64;
    near(plateau_v, 50.0, 0.5);
    near(plateau_i, 1.0, 0.02);
    near(plateau_v / plateau_i, 50.0, 0.5);
    near(sim.currents()[500], 1.0, 0.05);
    assert!(sim.voltages()[1000].abs() < 0.1, "front arrived early");
    sim.advance_to(0.0055).expect("arrival");
    near(sim.voltages()[1000], 100.0, 3.0);
    near(sim.diagnostics().load_current_a, 0.0, 1e-12);
}

#[test]
fn matched_open_short_and_mismatch_match_reference_oracles() {
    // Expected first terminal voltages use Γ=(RL−Z0)/(RL+Z0) only here.
    for (kind, resistance, expected) in [
        (LoadKind::R, 50.0, 50.0),
        (LoadKind::Open, 50.0, 100.0),
        (LoadKind::Short, 50.0, 0.0),
        (LoadKind::R, 150.0, 75.0),
    ] {
        let mut config = load(kind);
        config.resistance_ohm = resistance;
        let mut sim = TransmissionLine::new(line(1000), source(), config).expect("load");
        sim.advance_to(0.006).expect("first arrival");
        let d = sim.diagnostics();
        near(d.load_voltage_v, expected, 4.0);
        if kind == LoadKind::Open {
            near(d.load_current_a, 0.0, 1e-12);
        }
        if kind == LoadKind::Short {
            near(d.load_voltage_v, 0.0, 1e-12);
        }
    }
}

#[test]
fn capacitor_and_inductor_initial_conditions_are_continuous() {
    let mut c = load(LoadKind::C);
    c.initial_voltage_v = 12.0;
    let mut cap = TransmissionLine::new(line(1000), source(), c).expect("capacitor");
    near(cap.voltages()[1000], 12.0, 1e-12);
    cap.step_many(1).expect("one C step");
    assert!(
        (cap.diagnostics()
            .device
            .capacitor_voltage_v
            .unwrap_or_default()
            - 12.0)
            .abs()
            < 1.0
    );
    cap.advance_to(0.007).expect("charging");
    assert!(
        cap.diagnostics()
            .device
            .capacitor_voltage_v
            .unwrap_or_default()
            > 20.0
    );
    cap.reset();
    near(
        cap.diagnostics()
            .device
            .capacitor_voltage_v
            .unwrap_or_default(),
        12.0,
        1e-12,
    );

    let mut l = load(LoadKind::L);
    l.initial_current_a = 0.2;
    let mut ind = TransmissionLine::new(line(1000), source(), l).expect("inductor");
    ind.step_many(1).expect("one L step");
    assert!(
        (ind.diagnostics()
            .device
            .inductor_current_a
            .unwrap_or_default()
            - 0.2)
            .abs()
            < 0.1
    );
    ind.advance_to(0.007).expect("inductor evolution");
    assert!(
        (ind.diagnostics()
            .device
            .inductor_current_a
            .unwrap_or_default()
            - 0.2)
            .abs()
            > 0.1
    );
}

#[test]
fn series_and_parallel_rlc_remain_finite() {
    for topology in [Topology::Series, Topology::Parallel] {
        let mut config = load(LoadKind::RLC);
        config.topology = topology;
        let mut sim = TransmissionLine::new(line(500), source(), config).expect("RLC");
        sim.advance_to(0.0055).expect("RLC transient");
        if topology == Topology::Series {
            // 100 V Thevenin step, 100 ohm total R, 20 mH and 10 uF give
            // 0.754 A at 0.5 ms after the wave reaches the load.
            near(
                sim.diagnostics()
                    .device
                    .inductor_current_a
                    .expect("series inductor"),
                0.754,
                0.05,
            );
        } else {
            // Parallel RLC: v(s) = 200 exp(-2000s) sin(1000s) V.
            // At s=0.5 ms, the capacitor must see about 35.27 V.
            near(
                sim.diagnostics()
                    .device
                    .capacitor_voltage_v
                    .expect("parallel capacitor"),
                35.27,
                2.0,
            );
        }
        sim.advance_to(0.02).expect("finite RLC");
        let d = sim.diagnostics();
        assert!(d.line_energy_j.is_finite() && d.device.stored_energy_j.is_finite());
        if topology == Topology::Series {
            // A charged series capacitor blocks steady DC current.
            assert!(d.device.inductor_current_a.expect("series inductor").abs() < 0.005);
            near(
                d.device.capacitor_voltage_v.expect("series capacitor"),
                100.0,
                0.5,
            );
        } else {
            // At DC the parallel inductor shorts the load; its voltage decays.
            assert!(
                d.device
                    .capacitor_voltage_v
                    .expect("parallel capacitor")
                    .abs()
                    < 0.01
            );
            near(
                d.device.inductor_current_a.expect("parallel inductor"),
                2.0,
                0.05,
            );
        }
    }
}

#[test]
fn grid_refinement_converges_at_equal_physical_time() {
    let mut reference = sim(1600, LoadKind::R);
    reference.advance_to(0.006).expect("reference");
    let reference_v = reference.voltages()[1600];
    let errors: Vec<f64> = [100, 200, 400, 800]
        .into_iter()
        .map(|cells| {
            let mut sim = sim(cells, LoadKind::R);
            sim.advance_to(0.006).expect("refinement");
            (sim.voltages()[cells] - reference_v).abs()
        })
        .collect();
    assert!(errors[3] < errors[0] + 0.1, "errors: {errors:?}");
    assert!(errors[3] < 1.0, "errors: {errors:?}");
}

#[test]
fn passive_long_run_is_stable_and_storage_is_bounded() {
    let mut source = source();
    source.voltage_v = 0.0;
    let mut c = load(LoadKind::C);
    c.initial_voltage_v = 20.0;
    let mut sim = TransmissionLine::new(line(100), source, c).expect("passive");
    let storage = sim.storage_f64_count();
    let initial_energy = sim.diagnostics().line_energy_j + sim.diagnostics().device.stored_energy_j;
    sim.step_many(100_000).expect("long run");
    let d = sim.diagnostics();
    assert_eq!(sim.storage_f64_count(), storage);
    assert!(d.line_energy_j.is_finite());
    assert!(d.line_energy_j + d.device.stored_energy_j < initial_energy * 1.2);
}

#[test]
fn backward_seek_resets_and_recomputes_deterministically() {
    let mut sim = sim(200, LoadKind::RC);
    sim.advance_to(0.012).expect("first");
    let voltage = sim.voltages().to_vec();
    let current = sim.currents().to_vec();
    sim.advance_to(0.002).expect("rewind");
    sim.advance_to(0.012).expect("replay");
    assert_eq!(sim.voltages(), voltage);
    assert_eq!(sim.currents(), current);
}

#[test]
fn invalid_inputs_and_cfl_fail_closed() {
    let mut bad_line = line(100);
    bad_line.cfl = 1.1;
    assert!(matches!(
        TransmissionLine::new(bad_line, source(), load(LoadKind::R)),
        Err(SimError::Unstable)
    ));
    let mut bad_load = load(LoadKind::R);
    bad_load.resistance_ohm = -1.0;
    assert!(matches!(
        TransmissionLine::new(line(100), source(), bad_load),
        Err(SimError::Invalid(_))
    ));
    let mut sim = sim(100, LoadKind::Open);
    assert!(matches!(
        sim.advance_to(f64::INFINITY),
        Err(SimError::Invalid(_))
    ));
}
