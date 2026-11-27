import assert from 'node:assert/strict'
import test from 'node:test'
import { inferTriposrImage, triposrErrorMessage, validateTriposrPrediction } from '../src/lib/triposr.js'
import { exportTriposrMesh } from '../src/reconstruction/triposrExport.js'

const image = new Blob(['image bytes'], { type: 'image/jpeg' })
Object.defineProperties(image, { name: { value: 'speaker.jpg' }, size: { value: 11 } })

function prediction() {
  return {
    schema_version: 3, status: 'complete', model: 'TripoSR', engine: 'stabilityai/TripoSR',
    model_version: '429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee',
    output_type: 'colored_triangle_mesh', vertices_count: 3, faces_count: 1,
    latency_ms: 100, model_init_ms: 9000, resolution: 128,
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]],
    vertex_colors: [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]],
  }
}

test('TripoSR prediction validator accepts variable colored triangle geometry', () => {
  assert.equal(validateTriposrPrediction(prediction()), true)
  const mismatch = prediction(); mismatch.vertices_count = 2
  assert.equal(validateTriposrPrediction(mismatch), false)
  const badFace = prediction(); badFace.faces = [[0, 1, 3]]
  assert.equal(validateTriposrPrediction(badFace), false)
  const wrongEngine = prediction(); wrongEngine.model_version = '0'.repeat(64)
  assert.equal(validateTriposrPrediction(wrongEngine), false)
})

test('authenticated request sends one image and no camera metadata', async () => {
  let call
  const result = await inferTriposrImage(image, {
    sessionProvider: async () => ({ access_token: 'private-runtime-token' }),
    client: { post: async (...args) => { call = args; return { data: prediction() } } },
  })
  assert.equal(call[0], '/api/v1/triposr/reconstruct')
  assert.equal(call[1].get('image').name, 'speaker.jpg')
  assert.equal(call[1].has('camera'), false)
  assert.equal(call[2].headers.Authorization, 'Bearer private-runtime-token')
  assert.equal(call[2].timeout, 240000)
  assert.equal(result.model, 'TripoSR')
  assert.equal(JSON.stringify(result).includes('private-runtime-token'), false)
})

test('auth, unavailable model, and malformed output fail with safe messages', async () => {
  await assert.rejects(inferTriposrImage(image, { sessionProvider: async () => null }), /session has ended/)
  await assert.rejects(inferTriposrImage(image, {
    sessionProvider: async () => ({ access_token: 'x' }),
    client: { post: async () => ({ data: { status: 'complete' } }) },
  }), /invalid TripoSR geometry/)
  assert.match(triposrErrorMessage({ response: { status: 503 } }), /offline or busy/)
  assert.equal(triposrErrorMessage({ message: 'do-not-echo-secret' }).includes('do-not-echo-secret'), false)
})

test('TripoSR GLB export contains variable triangle geometry and vertex colors', async () => {
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
    const result = await exportTriposrMesh(prediction(), 'glb')
    assert.equal(result.filename, 'triposr-predicted-mesh.glb')
    const buffer = await result.blob.arrayBuffer()
    const header = new DataView(buffer)
    assert.equal(header.getUint32(0, true), 0x46546c67)
    assert.equal(header.getUint32(4, true), 2)
    assert.equal(header.getUint32(8, true), buffer.byteLength)
    const jsonLength = header.getUint32(12, true)
    const gltf = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)).trim())
    const primitive = gltf.meshes[0].primitives[0]
    assert.equal(gltf.accessors[primitive.attributes.POSITION].count, 3)
    assert.equal(gltf.accessors[primitive.attributes.COLOR_0].count, 3)
    assert.equal(gltf.accessors[primitive.indices].count, 3)
    assert.ok(result.blob.size > 0)
  } finally {
    globalThis.FileReader = previousReader
  }
})
