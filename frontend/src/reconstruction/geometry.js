import { BufferGeometry, Float32BufferAttribute } from 'three'
import { validateMeshResponse } from './mesh.js'

/** A fresh, untransformed copy of the verified final Pixel2Mesh topology. */
export function createRawStage3Geometry(mesh) {
  if (validateMeshResponse(mesh)) throw new Error('MESH DATA INVALID')

  const positions = new Float32Array(mesh.vertices.length * 3)
  const indices = new Uint16Array(mesh.faces.length * 3)
  for (let i = 0; i < mesh.vertices.length; i += 1) {
    positions.set(mesh.vertices[i], i * 3)
  }
  for (let i = 0; i < mesh.faces.length; i += 1) {
    indices.set(mesh.faces[i], i * 3)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(Array.from(indices))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
