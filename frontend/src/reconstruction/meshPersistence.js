import { serializeStage3 } from './export.js'
import { validateMeshResponse } from './mesh.js'

/** Persist only the verified raw model response, never viewport-transformed geometry. */
export async function serializeArtifactSet(mesh, { objectName = '', sourceFilename = '' } = {}) {
  if (validateMeshResponse(mesh)) throw new Error('MESH DATA INVALID')
  const envelope = {
    schema_version: 1,
    status: 'complete',
    model: mesh.model,
    stage: mesh.stage,
    vertices_count: mesh.vertices_count,
    faces_count: mesh.faces_count,
    latency_ms: mesh.latency_ms,
    model_init_ms: mesh.model_init_ms ?? 0,
    total_ms: mesh.total_ms ?? null,
    vertices: mesh.vertices,
    faces: mesh.faces,
  }
  const jsonBlob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
  const options = { objectName, sourceFilename }
  const obj = await serializeStage3(mesh, 'obj', options)
  const glb = await serializeStage3(mesh, 'glb', options)
  return { json: { blob: jsonBlob, sizeBytes: jsonBlob.size }, obj, glb }
}

/** Reject unknown schemas and malformed/corrupt persisted geometry before mounting Three.js. */
export async function parseStage3Artifact(blob) {
  let parsed
  try { parsed = JSON.parse(await blob.text()) }
  catch { throw new Error('Invalid mesh artifact') }
  if (parsed?.schema_version !== 1) throw new Error('Unsupported mesh artifact version')
  if (validateMeshResponse(parsed)) throw new Error('MESH DATA INVALID')
  return parsed
}
