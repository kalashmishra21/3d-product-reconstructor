/**
 * Shape-only diagnostic. A near-line or coincident cloud is flagged conservatively;
 * a thin plate is not. No coordinates are changed and this is not a quality score.
 */
export function diagnoseMesh(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 4 ||
      vertices.some(v => !Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(x)))) {
    return { degenerate: false, spread: null }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const v of vertices) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]) }
  const scale = Math.max(...max.map((x, i) => x - min[i]))
  if (!Number.isFinite(scale)) return { degenerate: false, spread: null }
  if (scale === 0) return { degenerate: true, spread: [0, 0, 0] }
  const mean = [0, 0, 0]
  for (const v of vertices) for (let i = 0; i < 3; i++) mean[i] += (v[i] - min[i]) / scale / vertices.length
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0])
  for (const v of vertices) {
    const d = v.map((x, i) => (x - min[i]) / scale - mean[i])
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) covariance[i][j] += d[i] * d[j] / vertices.length
  }
  // Jacobi diagonalization of a symmetric 3x3 covariance matrix.
  for (let iteration = 0; iteration < 32; iteration++) {
    let p = 0, q = 1
    for (const [i, j] of [[0, 2], [1, 2]]) if (Math.abs(covariance[i][j]) > Math.abs(covariance[p][q])) { p = i; q = j }
    if (Math.abs(covariance[p][q]) < 1e-15) break
    const angle = 0.5 * Math.atan2(2 * covariance[p][q], covariance[q][q] - covariance[p][p])
    const c = Math.cos(angle), s = Math.sin(angle)
    const a = covariance[p][p], b = covariance[q][q], d = covariance[p][q]
    covariance[p][p] = c*c*a - 2*s*c*d + s*s*b
    covariance[q][q] = s*s*a + 2*s*c*d + c*c*b
    covariance[p][q] = covariance[q][p] = 0
    for (let k = 0; k < 3; k++) if (k !== p && k !== q) {
      const x = covariance[k][p], y = covariance[k][q]
      covariance[k][p] = covariance[p][k] = c*x - s*y
      covariance[k][q] = covariance[q][k] = s*x + c*y
    }
  }
  const eigenvalues = [0, 1, 2].map(i => Math.max(0, covariance[i][i])).sort((a,b) => b-a)
  const spread = eigenvalues.map(x => Math.sqrt(x / eigenvalues[0]))
  // Observed integration Chair: middle .0283, minor .000607.
  // Require BOTH small axes, avoiding a warning on ordinary planar surfaces.
  return { degenerate: spread[1] < 0.035 && spread[2] < 0.001, spread }
}
