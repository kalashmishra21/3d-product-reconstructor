import assert from 'node:assert/strict'
import test from 'node:test'
import { createRawStage3Geometry } from '../src/reconstruction/geometry.js'
import { exportStem, serializeStage3, triggerDownload } from '../src/reconstruction/export.js'

function validMesh() {
  return {
    status: 'complete', model: 'Pixel2Mesh', stage: 3,
    vertices_count: 2466, faces_count: 4928, latency_ms: 1000,
    vertices: Array.from({ length: 2466 }, (_, index) => [index / 1000, (index % 37) / 100, (index % 11) / 50]),
    faces: Array.from({ length: 4928 }, (_, index) => [index % 2464, (index + 1) % 2464, (index + 2) % 2464]),
  }
}

test('safe filenames use the edited name, meaningful source, or neutral fallback', () => {
  assert.equal(exportStem('Whiteboard'), 'whiteboard')
  assert.equal(exportStem('  Office / Chair: 03  '), 'office-chair-03')
  assert.equal(exportStem('', 'office-chair.jpg'), 'office-chair')
  assert.equal(exportStem('', 'IMG_1234.jpg'), 'reconstruction')
  assert.equal(exportStem('', 'student@example.com.png'), 'reconstruction')
  assert.equal(exportStem('student@example.com'), 'reconstruction')
  assert.equal(exportStem('', 'd84e0b62-480a-4cd6-8de5-38748461d56b.png'), 'reconstruction')
  assert.equal(exportStem('../../'), 'reconstruction')
  assert.ok(exportStem('a'.repeat(200)).length <= 64)
})

test('raw geometry and OBJ export preserve Stage-3 coordinates and indexed topology', async () => {
  const mesh = validMesh()
  const original = structuredClone(mesh.vertices)
  const geometry = createRawStage3Geometry(mesh)
  assert.equal(geometry.getAttribute('position').count, 2466)
  assert.equal(geometry.getIndex().count, 4928 * 3)
  geometry.translate(10, 20, 30) // viewer-style display transform touches only this copy
  geometry.dispose()
  assert.deepEqual(mesh.vertices, original)

  const result = await serializeStage3(mesh, 'obj', { objectName: 'Whiteboard' })
  assert.equal(result.filename, 'whiteboard-stage3.obj')
  assert.ok(result.sizeBytes > 0)
  const lines = (await result.blob.text()).split(/\r?\n/)
  const vertices = lines.filter((line) => line.startsWith('v '))
  const faces = lines.filter((line) => line.startsWith('f '))
  assert.equal(vertices.length, 2466)
  assert.equal(faces.length, 4928)
  for (const index of [0, 17, 2465]) {
    const parsed = vertices[index].split(/\s+/).slice(1).map(Number)
    parsed.forEach((value, axis) => assert.ok(Math.abs(value - mesh.vertices[index][axis]) < 1e-5))
  }
  for (const index of [0, 100, 4927]) {
    const parsed = faces[index].split(/\s+/).slice(1).map((field) => Number(field.split('/')[0]))
    assert.deepEqual(parsed, mesh.faces[index].map((vertexIndex) => vertexIndex + 1))
  }
  assert.deepEqual(mesh.vertices, original)
})

test('binary GLB contains the same raw positions and 4,928 indexed triangles', async () => {
  const previousReader = globalThis.FileReader
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      }, (error) => this.onerror?.(error))
    }
  }
  try {
    const mesh = validMesh()
    const result = await serializeStage3(mesh, 'glb', { sourceFilename: 'office-chair.jpg' })
    assert.equal(result.filename, 'office-chair-stage3.glb')
    const buffer = await result.blob.arrayBuffer()
    const view = new DataView(buffer)
    assert.equal(view.getUint32(0, true), 0x46546c67) // glTF magic
    assert.equal(view.getUint32(4, true), 2)
    assert.equal(view.getUint32(8, true), buffer.byteLength)
    const jsonLength = view.getUint32(12, true)
    assert.equal(view.getUint32(16, true), 0x4e4f534a)
    const gltf = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)).trim())
    const primitive = gltf.meshes[0].primitives[0]
    const positions = gltf.accessors[primitive.attributes.POSITION]
    const indices = gltf.accessors[primitive.indices]
    assert.equal(positions.count, 2466)
    assert.equal(indices.count, 4928 * 3)
    assert.equal(primitive.mode ?? 4, 4) // TRIANGLES
    const binStart = 20 + jsonLength + 8
    const positionView = gltf.bufferViews[positions.bufferView]
    const offset = binStart + (positionView.byteOffset ?? 0) + (positions.byteOffset ?? 0)
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Math.abs(view.getFloat32(offset + axis * 4, true) - mesh.vertices[0][axis]) < 1e-5)
    }
    assert.deepEqual(mesh.faces[0], [0, 1, 2])
    assert.ok(result.sizeBytes > 0)
  } finally {
    globalThis.FileReader = previousReader
  }
})

test('invalid mesh cannot serialize and download URLs are revoked', async () => {
  const invalid = validMesh()
  invalid.faces[0][0] = 2466
  await assert.rejects(serializeStage3(invalid, 'obj'), /MESH DATA INVALID/)
  await assert.rejects(serializeStage3(invalid, 'glb'), /MESH DATA INVALID/)

  let clicked = false
  let removed = false
  let revoked = ''
  let scheduled
  const documentRef = {
    body: { append() {} },
    createElement: () => ({ click() { clicked = true }, remove() { removed = true } }),
  }
  const urlApi = {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: (url) => { revoked = url },
  }
  triggerDownload({ blob: new Blob(['mesh']), filename: 'mesh.obj' }, {
    documentRef, urlApi, schedule: (callback) => { scheduled = callback },
  })
  assert.equal(clicked, true)
  assert.equal(removed, true)
  scheduled()
  assert.equal(revoked, 'blob:test')
})
