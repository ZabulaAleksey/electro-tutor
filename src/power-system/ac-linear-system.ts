/** Scaled partial pivoting for the real Newton correction. */
export function solvePowerLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const scales = matrix.map(row => Math.max(...row.map(Math.abs)));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let maximum = 0;
    for (let row = col; row < n; row++) {
      const candidate = scales[row] > 0 ? Math.abs(matrix[row][col]) / scales[row] : 0;
      if (candidate > maximum) { maximum = candidate; pivot = row; }
    }
    if (maximum < 1e-13 || !Number.isFinite(maximum)) throw Error("power-ac-jacobian-singular");
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    [scales[col], scales[pivot]] = [scales[pivot], scales[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col] / matrix[col][col];
      for (let k = col + 1; k < n; k++) matrix[row][k] -= factor * matrix[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  const answer = Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let value = rhs[row];
    for (let col = row + 1; col < n; col++) value -= matrix[row][col] * answer[col];
    answer[row] = value / matrix[row][row];
  }
  if (!answer.every(Number.isFinite)) throw Error("power-ac-jacobian-singular");
  return answer;
}
