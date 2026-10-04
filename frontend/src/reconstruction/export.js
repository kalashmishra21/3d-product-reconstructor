import { DoubleSide, Mesh, MeshStandardMaterial } from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createRawStage3Geometry } from './geometry.js'
import { deriveObjectName } from './mesh.js'

const MAX_STEM_LENGTH = 64
const SENSITIVE_LABEL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

export function exportStem(objectName = '', sourceFilename = '') {
  const meaningfulSource = SENSITIVE_LABEL.test(sourceFilename) ? '' : deriveObjectName(sourceFilename)
  const requested = String(objectName).trim()
  const proposed = [requested, meaningfulSource].find((value) => value && !SENSITIVE_LABEL.test(value)) || 'reconstruction'
  return proposed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STEM_LENGTH)
    .replace(/-+$/g, '') || 'reconstruction'
}

function rawObject(mesh) {
  const geometry = createRawStage3Geometry(mesh)
  const material = new MeshStandardMaterial({
    color: '#c4cba8',
    roughness: 0.75,
    metalness: 0,
    side: DoubleSide,
  })
  const object = new Mesh(geometry, material)
  object.name = 'Pixel2Mesh Stage 3'
  object.updateMatrixWorld(true)
  return object
}

/** Exporters read a fresh raw mesh with identity transform; viewer state is never consulted. */
export async function serializeStage3(mesh, format, { objectName = '', sourceFilename = '' } = {}) {
  if (format !== 'obj' && format !== 'glb') throw new Error('Unsupported mesh format')
  const object = rawObject(mesh)
  const started = performance.now()
  try {
    const data = format === 'obj'
      ? new OBJExporter().parse(object)
      : await new GLTFExporter().parseAsync(object, { binary: true })
    if (format === 'glb' && !(data instanceof ArrayBuffer)) throw new Error('Invalid binary GLB')
    const blob = new Blob([data], {
      type: format === 'obj' ? 'text/plain;charset=utf-8' : 'model/gltf-binary',
    })
    if (!blob.size) throw new Error('Empty mesh export')
    return {
      blob,
      filename: `${exportStem(objectName, sourceFilename)}-stage3.${format}`,
      sizeBytes: blob.size,
      serializationMs: performance.now() - started,
    }
  } finally {
    object.geometry.dispose()
    object.material.dispose()
  }
}

/** Starts a browser download; the UI should not claim the OS saved the file. */
export function triggerDownload({ blob, filename }, { documentRef = document, urlApi = URL, schedule = setTimeout } = {}) {
  const href = urlApi.createObjectURL(blob)
  const anchor = documentRef.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.hidden = true
  try {
    documentRef.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    schedule(() => urlApi.revokeObjectURL(href), 1500)
  }
}
