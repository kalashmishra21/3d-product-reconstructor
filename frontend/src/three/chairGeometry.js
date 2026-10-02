import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Original illustrative geometry. This is not a trained model output.
export function createChairGeometry() {
  const columns = 16
  const rows = 26
  const positions = []
  const indices = []
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0.96, -0.72), new Vector3(0, 0.91, -0.18),
    new Vector3(0, 0.97, 0.31), new Vector3(0, 1.3, 0.53),
    new Vector3(0, 1.92, 0.66), new Vector3(0, 2.15, 0.64),
  ])
  const layerSize = (columns + 1) * (rows + 1)
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= rows; row++) {
      const t = row / rows
      const center = curve.getPoint(t)
      const tangent = curve.getTangent(t)
      const normal = new Vector3(0, tangent.z, -tangent.y).normalize()
      const halfWidth = 0.72 - 0.09 * t + 0.025 * Math.sin(t * Math.PI)
      for (let column = 0; column <= columns; column++) {
        const across = column / columns * 2 - 1
        const point = center.clone().addScaledVector(normal, (layer === 0 ? 0.032 : -0.032) + across * across * 0.065)
        positions.push(across * halfWidth, point.y, point.z)
      }
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column
      const b = a + 1
      const c = a + columns + 1
      const d = c + 1
      indices.push(a, c, b, b, c, d)
      indices.push(a + layerSize, b + layerSize, c + layerSize, b + layerSize, d + layerSize, c + layerSize)
    }
  }
  function join(a, b) {
    indices.push(a, b, a + layerSize, b, b + layerSize, a + layerSize)
  }
  for (let column = 0; column < columns; column++) {
    join(column + 1, column)
    join(rows * (columns + 1) + column, rows * (columns + 1) + column + 1)
  }
  for (let row = 0; row < rows; row++) {
    join(row * (columns + 1), (row + 1) * (columns + 1))
    join((row + 1) * (columns + 1) + columns, row * (columns + 1) + columns)
  }
  const shell = new BufferGeometry()
  shell.setAttribute('position', new Float32BufferAttribute(positions, 3))
  shell.setIndex(indices)
  shell.computeVertexNormals()
  const parts = [shell]
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const top = new Vector3(x * 0.51, 0.91, z * 0.38)
      const bottom = new Vector3(x * 0.67, 0.035, z * 0.61)
      const direction = top.clone().sub(bottom)
      const leg = new CylinderGeometry(0.044, 0.025, direction.length(), 8, 4)
      leg.deleteAttribute('uv')
      leg.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()))
      leg.translate(...top.add(bottom).multiplyScalar(0.5).toArray())
      parts.push(leg)
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  if (!merged) throw new Error('Could not construct the illustrative mesh.')
  const geometry = merged.toNonIndexed()
  merged.dispose()
  return geometry
}

export function createFaceOffsets(geometry) {
  const positions = geometry.getAttribute('position')
  const offsets = new Float32Array(positions.array.length)
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  const centroid = new Vector3(), normal = new Vector3(), center = new Vector3(0, 1, 0)
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i)
    b.fromBufferAttribute(positions, i + 1)
    c.fromBufferAttribute(positions, i + 2)
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center).normalize().multiplyScalar(0.17)
    normal.subVectors(b, a).cross(c.sub(a)).normalize().multiplyScalar(0.045)
    centroid.add(normal)
    for (let vertex = 0; vertex < 3; vertex++) centroid.toArray(offsets, (i + vertex) * 3)
  }
  return offsets
}
