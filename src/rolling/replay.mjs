// Forward check uses only the convex body, orientation sequence and the first
// planar contact as its translation datum. Later targets are only comparators.
function rotate([w, x, y, z], [a, b, c]) {
  return [
    (1 - 2 * (y * y + z * z)) * a + 2 * (x * y - w * z) * b + 2 * (x * z + w * y) * c,
    2 * (x * y + w * z) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - w * x) * c,
    2 * (x * z - w * y) * a + 2 * (y * z + w * x) * b + (1 - 2 * (x * x + y * y)) * c,
  ];
}

function cross([a, b, c], [x, y, z]) {
  return [b * z - c * y, c * x - a * z, a * y - b * x];
}

function rotationStep(left, right) {
  const product = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const sign = product < 0 ? -1 : 1;
  const summed = left.map((value, index) => value + sign * right[index]);
  const norm = Math.hypot(...summed);
  const midpoint = summed.map(value => value / norm);
  const [dw, ...du] = right.map((value, index) => sign * value - left[index]);
  const [w, ...u] = left;
  const skew = cross(du, u);
  // Vector part of q_right * conjugate(q_left), evaluated with small differences.
  const sineAxis = du.map((value, index) => w * value - dw * u[index] - skew[index]);
  return { midpoint, sineAxis };
}

function support(shape, orientation) {
  const [w, x, y, z] = orientation;
  const down = [2 * (w * y - x * z), -2 * (y * z + w * x), 2 * (x * x + y * y) - 1];
  let exteriorGap = Infinity;
  for (const vertex of shape.vertices) {
    const projection = vertex[0] * down[0] + vertex[1] * down[1] + vertex[2] * down[2];
    exteriorGap = Math.min(exteriorGap, shape.radius - projection);
  }
  // A tie would make the convex combinations on the support plane contacts too.
  if (exteriorGap <= 1e-10 * shape.radius) throw Error("CONTACT_NOT_CERTIFIED");
  return { material: down.map(value => value * shape.radius), exteriorGap };
}

export function verifyRollingReplay(shape, poses) {
  const first = poses[0];
  const initial = support(shape, first.orientation);
  const initialOffset = rotate(first.orientation, initial.material);
  const center = [-initialOffset[0], -initialOffset[1]];
  const contacts = [];
  let maxSlipOverSpeed = 0;
  let maxTraceOverRadius = 0;
  let minGapOverRadius = Infinity;
  let minSampledExteriorGapOverRadius = Infinity;
  for (const [index, pose] of poses.entries()) {
    const actualSupport = support(shape, pose.orientation);
    const offset = rotate(pose.orientation, actualSupport.material);
    minGapOverRadius = Math.min(minGapOverRadius, (pose.center[2] + offset[2]) / shape.radius);
    minSampledExteriorGapOverRadius = Math.min(minSampledExteriorGapOverRadius, actualSupport.exteriorGap / shape.radius);
    if (index > 0) {
      const previous = poses[index - 1];
      const { midpoint, sineAxis } = rotationStep(previous.orientation, pose.orientation);
      const { material } = support(shape, midpoint);
      // At the two ends this point is rotated by opposite half-angles about the
      // same world axis. The cosine parts cancel in the difference.
      const delta = cross(sineAxis, rotate(midpoint, material)).map(value => 2 * value);
      center[0] -= delta[0];
      center[1] -= delta[1];
      const displacement = pose.localCenter.map((value, axis) => value - previous.localCenter[axis] + delta[axis]);
      maxSlipOverSpeed = Math.max(maxSlipOverSpeed, Math.hypot(...displacement) / (pose.s - previous.s));
    }
    const contact = [center[0] + offset[0], center[1] + offset[1]];
    contacts.push([first.target[0] + contact[0], first.target[1] + contact[1]]);
    const traceError = Math.hypot(contact[0] - pose.localCenter[0], contact[1] - pose.localCenter[1]);
    maxTraceOverRadius = Math.max(maxTraceOverRadius, traceError / shape.radius);
  }
  return {
    contacts, maxSlipOverSpeed, maxTraceOverRadius, minGapOverRadius,
    minSampledExteriorGapOverRadius: shape.vertices.length ? minSampledExteriorGapOverRadius : null,
  };
}
