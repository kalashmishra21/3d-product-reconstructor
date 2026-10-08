import test from 'node:test'
import assert from 'node:assert/strict'
import { serializeArtifactSet, parseStage3Artifact } from '../src/reconstruction/meshPersistence.js'

function validMesh() {
  return {
    status: 'complete', model: 'Pixel2Mesh', stage: 3,
    vertices_count: 2466, faces_count: 4928, latency_ms: 1100, model_init_ms: 0,
    vertices: Array.from({ length: 2466 }, (_, i) => [i / 1000, (i % 37) / 100, (i % 11) / 50]),
    faces: Array.from({ length: 4928 }, (_, i) => [i % 2464, (i + 1) % 2464, (i + 2) % 2464]),
  }
}

test('one real-shape mesh becomes three raw artifacts and JSON roundtrips exactly', async () => {
  const oldReader = globalThis.FileReader
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.() }, (error) => this.onerror?.(error)) }
  }
  try {
    const mesh = validMesh()
    const before = structuredClone(mesh)
    const set = await serializeArtifactSet(mesh, { objectName: 'Chair', sourceFilename: 'chair.png' })
    assert.equal(set.obj.filename, 'chair-stage3.obj')
    assert.equal(set.glb.filename, 'chair-stage3.glb')
    assert.ok(set.json.sizeBytes > 0 && set.obj.sizeBytes > 0 && set.glb.sizeBytes > 0)
    assert.equal((await set.obj.blob.text()).match(/^v /gm)?.length, 2466)
    assert.equal((await set.obj.blob.text()).match(/^f /gm)?.length, 4928)
    const binary = new DataView(await set.glb.blob.arrayBuffer())
    assert.equal(binary.getUint32(0, true), 0x46546c67)
    const restored = await parseStage3Artifact(set.json.blob)
    assert.deepEqual(restored.vertices, before.vertices)
    assert.deepEqual(restored.faces, before.faces)
    assert.deepEqual(mesh, before)
  } finally { globalThis.FileReader = oldReader }
})

test('invalid data and unknown schema versions do not reopen as mesh', async () => {
  const invalid = validMesh(); invalid.vertices[0][0] = Infinity
  await assert.rejects(serializeArtifactSet(invalid, {}), /MESH DATA INVALID/)
  await assert.rejects(parseStage3Artifact(new Blob([JSON.stringify({ schema_version: 2, ...validMesh() })])), /Unsupported mesh artifact/)
  await assert.rejects(parseStage3Artifact(new Blob(['not JSON'])), /Invalid mesh artifact/)
})
