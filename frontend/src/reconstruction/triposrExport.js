import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

function createPredictedObject(prediction) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(prediction.vertices.flat()), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(
    prediction.vertex_colors.flatMap((rgba) => rgba.slice(0, 3).map((channel) => channel / 255))), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array(prediction.faces.flat()), 1))
  geometry.computeVertexNormals()
  const object = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: .78 }))
  object.name = 'TripoSR predicted mesh'
  object.updateMatrixWorld(true)
  return object
}

export async function exportTriposrMesh(prediction, format) {
  if (!['obj', 'glb'].includes(format)) throw new Error('Unsupported TripoSR export format')
  const object = createPredictedObject(prediction)
  try {
    const data = format === 'obj' ? new OBJExporter().parse(object) : await new GLTFExporter().parseAsync(object, { binary: true })
    if (format === 'glb' && !(data instanceof ArrayBuffer)) throw new Error('GLB export did not return a binary asset')
    const blob = new Blob([data], { type: format === 'obj' ? 'text/plain;charset=utf-8' : 'model/gltf-binary' })
    if (!blob.size) throw new Error('TripoSR export is empty')
    return { blob, filename: `triposr-predicted-mesh.${format}` }
  } finally {
    object.geometry.dispose()
    object.material.dispose()
  }
}

export function downloadTriposrAsset(asset, { documentRef = document, urlApi = URL } = {}) {
  const href = urlApi.createObjectURL(asset.blob)
  const anchor = documentRef.createElement('a')
  anchor.href = href
  anchor.download = asset.filename
  anchor.hidden = true
  try { documentRef.body.append(anchor); anchor.click() }
  finally { anchor.remove(); setTimeout(() => urlApi.revokeObjectURL(href), 1500) }
}
