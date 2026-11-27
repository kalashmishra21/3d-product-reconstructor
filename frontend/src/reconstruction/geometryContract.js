const selectedModel = 'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500'
const finiteRow = (row) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)

export function validReconstruction(data) {
  if (data?.schema_version !== 2 || data.status !== 'complete' || data.model !== 'Pixel3Mesh' ||
    data.model_version !== selectedModel || data.output_type !== 'point_cloud_and_visible_surface' ||
    !Number.isFinite(data.latency_ms) || data.latency_ms < 0) return false
  if (!Array.isArray(data.global_points) || data.global_points.length !== 2048 || !data.global_points.every(finiteRow)) return false
  const { vertices, faces } = data
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 50176 || !vertices.every(finiteRow) ||
    !Array.isArray(faces) || !faces.length || faces.length > 100000 ||
    vertices.length !== data.vertices_count || faces.length !== data.faces_count) return false
  const seen = new Set()
  return faces.every((face) => {
    if (!Array.isArray(face) || face.length !== 3 || new Set(face).size !== 3 ||
      !face.every((index) => Number.isInteger(index) && index >= 0 && index < vertices.length)) return false
    const key = [...face].sort((a, b) => a - b).join(',')
    if (seen.has(key)) return false
    seen.add(key)
    const [a, b, c] = face.map((index) => vertices[index])
    const u = b.map((value, index) => value - a[index])
    const v = c.map((value, index) => value - a[index])
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
    return cross.every(Number.isFinite) && cross.reduce((sum, value) => sum + value*value, 0) > 1e-20
  })
}
