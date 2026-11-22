"""Reproducible Stage 7A comparison. All internal variables are dimensionless."""

import json
from dataclasses import dataclass
from math import ceil, cos, exp, fsum, isfinite, log2, pi, sin, sqrt


TRANSIT_SECONDS = 0.005  # 1000 km at 2e8 m/s; U0=1 V, Z0=50 ohm
EXPLICIT_LIMIT = 1.25
GRIDS = (40, 80, 160)
THRESHOLDS = {
    "minObservedOrder": 1.8,
    "maxFineMatchedRelativeL2": 1e-2,
    "maxFineManufacturedRelativeL2": 1e-4,
    "maxImplicitRelativeEnergyDefect": 1e-10,
    "maxRk4RelativeEnergyDefect": 1e-5,
    "maxExplicitStepBound": EXPLICIT_LIMIT,
    "maxReceiverTransitErrorSeconds": 20e-6,
    "maxReceiverPeakErrorVolts": 0.005,
    "minDefectWithoutModulation": 0.002,
    "minFieldErrorWithBrokenModel": 0.05,
}


class InvalidExperiment(ValueError):
    pass


def matched_field(x, t, loss):
    return exp(-loss * x - ((t - x - 0.25) / 0.18) ** 2)


def manufactured_voltage(x, t):
    return 1 + 0.2 * sin(2 * pi * (x - 0.6 * t))


def manufactured_current(x, t):
    return manufactured_voltage(x, t) + 0.15 * sin(pi * x) * cos(2 * pi * t)


@dataclass(frozen=True)
class Profile:
    end: float
    loss: float = 0
    manufactured: bool = False

    def exact(self, x, t, is_voltage):
        if self.manufactured:
            return (manufactured_voltage if is_voltage else manufactured_current)(x, t)
        return matched_field(x, t, self.loss)

    def sample(self, x, t, is_voltage):
        """Return storage coefficient, loss coefficient, source and storage rate."""
        if not self.manufactured:
            return 1, self.loss, 0, 0

        capacitance = 1 + 0.2 * x + 0.1 * sin(2 * pi * t)
        capacitance_rate = 0.2 * pi * cos(2 * pi * t)
        voltage_x = 0.4 * pi * cos(2 * pi * (x - 0.6 * t))
        voltage_t = -0.6 * voltage_x
        if is_voltage:
            voltage = manufactured_voltage(x, t)
            current_x = voltage_x + 0.15 * pi * cos(pi * x) * cos(2 * pi * t)
            conductance = 0.1 * capacitance
            source = capacitance * voltage_t + capacitance_rate * voltage + current_x + conductance * voltage
            return capacitance, conductance, source, capacitance_rate

        inductance = 1 / capacitance
        inductance_rate = -capacitance_rate / capacitance**2
        resistance = 0.1 + 0.02 * x + 0.01 * sin(2 * pi * t)
        current = manufactured_current(x, t)
        current_t = voltage_t - 0.3 * pi * sin(pi * x) * sin(2 * pi * t)
        source = inductance * current_t + inductance_rate * current + voltage_x + resistance * current
        return inductance, resistance, source, inductance_rate


class Mesh:
    def __init__(self, cells, profile):
        self.profile = profile
        self.locations = [(index / (2 * cells), index % 2 == 0) for index in range(2 * cells + 1)]
        self.widths = [1 / cells] * len(self.locations)
        self.widths[0] *= 0.5
        self.widths[-1] *= 0.5
        self.lower = [0, *(1 / width for width in self.widths[1:])]
        self.upper = [*(-1 / width for width in self.widths[:-1]), 0]

    def source_voltage(self, t):
        # Normalized Thevenin and receiver resistances are both one.
        return 2 * self.profile.exact(0, t, True)

    def exact(self, t):
        return [self.profile.exact(x, t, is_voltage) for x, is_voltage in self.locations]

    def coefficients(self, t):
        rows = [self.profile.sample(x, t, is_voltage) for x, is_voltage in self.locations]
        if any(not all(map(isfinite, row)) or row[0] <= 0 or row[1] < 0 for row in rows):
            raise InvalidExperiment("nonphysical-coefficients")
        return tuple(map(list, zip(*rows)))

    def operator(self, losses, source_terms, t):
        diagonal = [-loss for loss in losses]
        drive = source_terms.copy()
        diagonal[0] -= 1 / self.widths[0]
        diagonal[-1] -= 1 / self.widths[-1]
        drive[0] += self.source_voltage(t) / self.widths[0]
        return diagonal, drive

    def apply(self, field, diagonal, drive):
        previous = [0, *field[:-1]]
        following = [*field[1:], 0]
        return [a * left + b * center + c * right + source for a, b, c, left, center, right, source in
                zip(self.lower, diagonal, self.upper, previous, field, following, drive)]

    def explicit_guard(self, step, storage, diagonal):
        inverse = [1 / value for value in storage]
        bound = max(a * left + abs(b) * center + abs(c) * right for a, b, c, left, center, right in
                    zip(self.lower, diagonal, self.upper, [0, *inverse[:-1]], inverse, [*inverse[1:], 0]))
        if step * bound > EXPLICIT_LIMIT:
            raise InvalidExperiment("explicit-step-outside-envelope")
        return step * bound

    def powers(self, field, losses, source_terms, t):
        left, right = field[0], field[-1]
        boundary = left * (self.source_voltage(t) - left) - right**2
        loss = -fsum(w * k * value**2 for w, k, value in zip(self.widths, losses, field))
        source = fsum(w * f * value for w, f, value in zip(self.widths, source_terms, field))
        return boundary, loss, source


def conjugate(state, storage):
    return [p / a for p, a in zip(state, storage)]


def shifted(state, rate, step):
    return [p + step * derivative for p, derivative in zip(state, rate)]


def rk4_step(mesh, state, time, step, omit_modulation):
    def evaluate(stage_state, stage_time):
        storage, losses, forces, rates = mesh.coefficients(stage_time)
        field = conjugate(stage_state, storage)
        diagonal, drive = mesh.operator(losses, forces, stage_time)
        bound = mesh.explicit_guard(step, storage, diagonal)
        derivative = mesh.apply(field, diagonal, drive)
        if omit_modulation:
            # Incorrect constitutive law M*y_t in place of (M*y)_t.
            derivative = [dp + rate * value for dp, rate, value in zip(derivative, rates, field)]
        modulation = -0.5 * fsum(w * rate * value**2 for w, rate, value in zip(mesh.widths, rates, field))
        return derivative, (*mesh.powers(field, losses, forces, stage_time), modulation), bound

    k1, p1, b1 = evaluate(state, time)
    k2, p2, b2 = evaluate(shifted(state, k1, step / 2), time + step / 2)
    k3, p3, b3 = evaluate(shifted(state, k2, step / 2), time + step / 2)
    k4, p4, b4 = evaluate(shifted(state, k3, step), time + step)
    state = shifted(state, [(a + 2 * b + 2 * c + d) / 6 for a, b, c, d in zip(k1, k2, k3, k4)], step)
    work = tuple(step * (a + 2 * b + 2 * c + d) / 6 for a, b, c, d in zip(p1, p2, p3, p4))
    return state, work, max(b1, b2, b3, b4)


def tridiagonal(lower, diagonal, upper, rhs):
    for j in range(1, len(rhs)):
        multiplier = lower[j] / diagonal[j - 1]
        diagonal[j] -= multiplier * upper[j - 1]
        rhs[j] -= multiplier * rhs[j - 1]
    rhs[-1] /= diagonal[-1]
    for j in range(len(rhs) - 2, -1, -1):
        rhs[j] = (rhs[j] - upper[j] * rhs[j + 1]) / diagonal[j]
    return rhs


def implicit_step(mesh, state, time, step):
    old_mass = mesh.coefficients(time)[0]
    new_mass = mesh.coefficients(time + step)[0]
    midpoint = time + step / 2
    _, losses, forces, _ = mesh.coefficients(midpoint)
    diagonal, drive = mesh.operator(losses, forces, midpoint)
    old_field = conjugate(state, old_mass)
    old_rate = mesh.apply(old_field, diagonal, drive)
    half_step = step / 2
    # M1*y1 = M0*y0 + dt*(K_mid*(y0+y1)/2 + b_mid).
    rhs = [value + half_step * (rate + source) for value, rate, source in zip(state, old_rate, drive)]
    new_field = tridiagonal([-half_step * c for c in mesh.lower],
                            [m - half_step * c for m, c in zip(new_mass, diagonal)],
                            [-half_step * c for c in mesh.upper], rhs)
    averaged = [(old + new) / 2 for old, new in zip(old_field, new_field)]
    modulation = -0.5 * fsum(w * (m1 - m0) * a * b for w, m0, m1, a, b in
                             zip(mesh.widths, old_mass, new_mass, old_field, new_field))
    work = (*(step * power for power in mesh.powers(averaged, losses, forces, midpoint)), modulation)
    return [m * field for m, field in zip(new_mass, new_field)], work, 0


def energy(mesh, state, storage):
    return 0.5 * fsum(w * p**2 / m for w, p, m in zip(mesh.widths, state, storage))


def relative_error(mesh, computed, expected, offset):
    terms = list(zip(mesh.widths[offset::2], computed[offset::2], expected[offset::2]))
    return sqrt(fsum(w * (actual - ref)**2 for w, actual, ref in terms) /
                fsum(w * ref**2 for w, _, ref in terms))


def peak(trace, step):
    j = max(range(1, len(trace) - 1), key=trace.__getitem__)
    left, middle, right = trace[j - 1:j + 2]
    offset = 0.5 * (left - right) / (left - 2 * middle + right)
    return (j + offset) * step, middle + 0.25 * (right - left) * offset


def run(profile, cells, method, *, omit_modulation=False):
    mesh = Mesh(cells, profile)
    steps = ceil(profile.end * cells * 4)
    step = profile.end / steps
    mass = mesh.coefficients(0)[0]
    state = [m * value for m, value in zip(mass, mesh.exact(0))]
    initial_energy = energy(mesh, state, mass)
    current_energy = initial_energy
    max_step_defect = 0
    trace = [state[-1] / mass[-1]]
    work = []
    max_bound = 0
    for index in range(steps):
        time = index * step
        if method == "rk4":
            state, increment, bound = rk4_step(mesh, state, time, step, omit_modulation)
        else:
            state, increment, bound = implicit_step(mesh, state, time, step)
        mass = mesh.coefficients((index + 1) * step)[0]
        next_energy = energy(mesh, state, mass)
        max_step_defect = max(max_step_defect, abs(next_energy - current_energy - fsum(increment)))
        current_energy = next_energy
        work.append(increment)
        max_bound = max(max_bound, bound)
        trace.append(state[-1] / mass[-1])
    totals = tuple(fsum(increments) for increments in zip(*work))
    defect = current_energy - initial_energy - fsum(totals)
    computed = conjugate(state, mass)
    expected = mesh.exact(profile.end)
    row = {
        "cells": cells, "steps": steps, "stepOverCellWidth": step * cells,
        "voltageRelativeL2": relative_error(mesh, computed, expected, 0),
        "currentRelativeL2": relative_error(mesh, computed, expected, 1),
        "energy": dict(zip(("boundaryWork", "dissipatedWork", "sourceWork", "modulationWork"), totals),
                       initial=initial_energy, final=current_energy,
                       relativeDefect=abs(defect) / initial_energy,
                       maxStepRelativeDefect=max_step_defect / initial_energy,
                       relativeDefectWithoutModulation=abs(defect + totals[-1]) / initial_energy),
    }
    if method == "rk4":
        row["maxExplicitStepBound"] = max_bound
    if not profile.manufactured:
        peak_time, peak_voltage = peak(trace, step)
        row["receiver"] = {
            "peakTimeSeconds": peak_time * TRANSIT_SECONDS,
            "transitSeconds": (peak_time - 0.25) * TRANSIT_SECONDS,
            "peakVoltage": peak_voltage,
            "exactPeakVoltage": exp(-profile.loss),
        }
    return row


def observed_order(rows, key):
    return [log2(coarse[key] / fine[key]) for coarse, fine in zip(rows, rows[1:])]


def rejection(action, expected):
    try:
        action()
    except InvalidExperiment as error:
        if str(error) == expected:
            return {"diagnostic": str(error), "passed": True}
        return {"diagnostic": str(error), "passed": False}
    return {"diagnostic": "input-accepted", "passed": False}


class ZeroStorageProfile(Profile):
    def sample(self, x, t, is_voltage):
        return (0 if is_voltage else 1), 0, 0, 0


def evaluate():
    manufactured = Profile(0.25, manufactured=True)
    cases = {}
    checks = {}
    for name, profile in (("matched-lossless", Profile(1.5)), ("matched-lossy", Profile(1.5, loss=0.2)),
                          ("manufactured-coax", manufactured)):
        methods = {}
        for method in ("rk4", "implicit"):
            rows = [run(profile, cells, method) for cells in GRIDS]
            voltage_order = observed_order(rows, "voltageRelativeL2")
            current_order = observed_order(rows, "currentRelativeL2")
            fine = rows[-1]
            methods[method] = dict(grids=rows, voltageOrder=voltage_order, currentOrder=current_order)
            checks[f"{name}/{method}/convergence"] = min(*voltage_order, *current_order) >= THRESHOLDS["minObservedOrder"]
            accuracy_threshold = (THRESHOLDS["maxFineManufacturedRelativeL2"] if profile.manufactured else
                                  THRESHOLDS["maxFineMatchedRelativeL2"])
            checks[f"{name}/{method}/accuracy"] = max(fine["voltageRelativeL2"], fine["currentRelativeL2"]) <= accuracy_threshold
            if method == "implicit":
                worst_defect = max(max(row["energy"]["relativeDefect"], row["energy"]["maxStepRelativeDefect"]) for row in rows)
                checks[f"{name}/{method}/energy"] = worst_defect <= THRESHOLDS["maxImplicitRelativeEnergyDefect"]
            else:
                checks[f"{name}/{method}/energy"] = fine["energy"]["relativeDefect"] <= THRESHOLDS["maxRk4RelativeEnergyDefect"]
            if not profile.manufactured:
                receiver = fine["receiver"]
                checks[f"{name}/{method}/receiver"] = (
                    abs(receiver["transitSeconds"] - TRANSIT_SECONDS) <= THRESHOLDS["maxReceiverTransitErrorSeconds"]
                    and abs(receiver["peakVoltage"] - receiver["exactPeakVoltage"]) <= THRESHOLDS["maxReceiverPeakErrorVolts"])
            else:
                checks[f"{name}/{method}/modulation"] = (
                    fine["energy"]["relativeDefectWithoutModulation"] >= THRESHOLDS["minDefectWithoutModulation"])
        cases[name] = methods

    wrong = run(manufactured, GRIDS[-1], "rk4", omit_modulation=True)
    checks["omitting-constitutive-rates-breaks-the-oracle"] = (
        min(wrong["voltageRelativeL2"], wrong["currentRelativeL2"]) >= THRESHOLDS["minFieldErrorWithBrokenModel"])

    mesh = Mesh(GRIDS[0], Profile(1.5))
    rejections = {
        "zeroCapacitance": rejection(lambda: Mesh(GRIDS[0], ZeroStorageProfile(1)).coefficients(0),
                                     "nonphysical-coefficients"),
        "oversizeExplicitStep": rejection(lambda: rk4_step(mesh, mesh.exact(0), 0, 1 / GRIDS[0], False),
                                          "explicit-step-outside-envelope"),
    }
    checks.update({name: outcome["passed"] for name, outcome in rejections.items()})
    return {
        "stage": "ET-LABR-007A",
        "status": "PASS" if all(checks.values()) else "FAIL",
        "normalization": {"lengthMetres": 1_000_000, "timeSeconds": TRANSIT_SECONDS, "impedanceOhms": 50,
                          "voltageVolts": 1},
        "thresholds": THRESHOLDS,
        "checks": checks, "cases": cases, "negativeInputs": rejections, "wrongModel": wrong,
    }


if __name__ == "__main__":
    report = evaluate()
    print(json.dumps(report, indent=2, allow_nan=False))
    raise SystemExit(report["status"] != "PASS")
