// TEST FIXTURE ONLY. A deterministic ellipsoid, NOT Pixel2Mesh model output.
// Never import this module from production source.
export function healthyStage3() {
  const rings = 32, segments = 77
  const vertices = [[0, 1.2, 0]]
  for (let ring = 1; ring <= rings; ring++) {
    const phi = Math.PI * ring / (rings + 1)
    for (let segment = 0; segment < segments; segment++) {
      const theta = 2 * Math.PI * segment / segments
      vertices.push([Math.sin(phi) * Math.cos(theta), 1.2 * Math.cos(phi), 0.7 * Math.sin(phi) * Math.sin(theta)])
    }
  }
  vertices.push([0, -1.2, 0])
  const faces = []
  for (let j = 0; j < segments; j++) faces.push([0, 1 + (j + 1) % segments, 1 + j])
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segments; j++) {
    const a = 1 + i * segments + j, b = 1 + i * segments + (j + 1) % segments
    faces.push([a, b, a + segments], [b, b + segments, a + segments])
  }
  const last = 1 + (rings - 1) * segments
  for (let j = 0; j < segments; j++) faces.push([vertices.length - 1, last + j, last + (j + 1) % segments])
  return { status: 'complete', model: 'Pixel2Mesh', stage: 3, vertices_count: 2466, faces_count: 4928, latency_ms: 981.4, model_init_ms: 0, vertices, faces }
}
