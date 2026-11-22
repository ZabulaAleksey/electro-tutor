/** @typedef {[number, number, number]} Vector3 */
/** @typedef {[number, number, number, number]} Quaternion */

/** @param {Vector3} a @param {Vector3} b */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** @param {Vector3} a @param {Vector3} b @returns {Vector3} */
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** @param {Vector3} v @param {number} factor @returns {Vector3} */
export function scale(v, factor) {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

/** @param {Quaternion} q @returns {Quaternion} */
export function conjugate([w, x, y, z]) {
  return [w, -x, -y, -z];
}

/** @param {Quaternion} a @param {Quaternion} b @returns {Quaternion} */
export function multiply([a, x, y, z], [b, u, v, w]) {
  return [
    a * b - x * u - y * v - z * w,
    a * u + x * b + y * w - z * v,
    a * v - x * w + y * b + z * u,
    a * w + x * v - y * u + z * b,
  ];
}

/** @param {Quaternion} q @returns {Quaternion} */
export function normalizedQuaternion(q) {
  const [w, x, y, z] = q;
  const norm = Math.hypot(w, x, y, z);
  return [w / norm, x / norm, y / norm, z / norm];
}

/** @param {Vector3} axis unit rotation axis @param {number} angle @returns {Quaternion} */
export function quaternionAround(axis, angle) {
  const [x, y, z] = scale(axis, Math.sin(angle / 2));
  return [Math.cos(angle / 2), x, y, z];
}

/** @param {Quaternion} q unit quaternion @param {Vector3} v @returns {Vector3} */
export function rotateVector(q, v) {
  const [, x, y, z] = multiply(multiply(q, [0, ...v]), conjugate(q));
  return [x, y, z];
}

/**
 * Maximum projection onto direction of a unit normal rotated about a unit axis
 * through every angle in [0, angle]. The maximum is at an endpoint or at the
 * first stationary maximum of the sinusoidal projection.
 * @param {Vector3} direction
 * @param {Vector3} axis
 * @param {Vector3} initialNormal
 * @param {number} angle nonnegative radians
 */
export function maxArcProjection(direction, axis, initialNormal, angle) {
  const constant = dot(direction, axis) * dot(axis, initialNormal);
  const cosine = dot(direction, initialNormal) - constant;
  const sine = dot(direction, cross(axis, initialNormal));
  const peak = Math.atan2(sine, cosine);
  const firstPeak = peak < 0 ? peak + 2 * Math.PI : peak;
  if (firstPeak <= angle) {
    return constant + Math.hypot(cosine, sine);
  }
  const start = cosine;
  const end = cosine * Math.cos(angle) + sine * Math.sin(angle);
  return constant + Math.max(start, end);
}
