import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectImageFile, validateImageFile, MAX_IMAGE_BYTES } from '../src/reconstruction/image.js'
import { preflightImage, preflightErrorMessage } from '../src/lib/preflight.js'
import { inferImage, inferenceErrorMessage } from '../src/lib/inference.js'
import { deriveObjectName, validateMeshResponse, formatMilliseconds } from '../src/reconstruction/mesh.js'

function imageFile(type = 'image/png', size = 128, name = 'object.png') {
  const file = new Blob([new Uint8Array(size)], { type })
  Object.defineProperty(file, 'name', { value: name })
  return file
}

test('accepted image decodes to local metadata', async () => {
  const file = imageFile()
  assert.deepEqual(await inspectImageFile(file, async () => ({ width: 800, height: 600 })), {
    file, width: 800, height: 600, format: 'PNG',
  })
  const replacement = imageFile('image/jpeg', 200, 'replacement.jpg')
  assert.equal((await inspectImageFile(replacement, async () => ({ width: 400, height: 400 }))).format, 'JPEG')
})

test('unsupported, empty, oversized, undecodable, and invalid dimensions are rejected', async () => {
  assert.match(validateImageFile(imageFile('image/gif')), /Unsupported/)
  assert.match(validateImageFile(imageFile('image/png', 0)), /empty/)
  assert.match(validateImageFile({ name: 'too-large.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /10 MB/)
  await assert.rejects(inspectImageFile(imageFile(), async () => { throw new Error('decoder rejected') }), /Unable to decode/)
  await assert.rejects(inspectImageFile(imageFile(), async () => ({ width: 0, height: 4 })), /dimensions are invalid/)
  await assert.rejects(inspectImageFile(imageFile(), async () => ({ width: 6000, height: 6000 })), /safe limit/)
})

test('preflight sends multipart and runtime bearer token without leaking it in the result', async () => {
  const file = imageFile()
  let checked = false
  const response = { status: 'ready', width: 800, height: 600, format: 'PNG', size_bytes: 128 }
  const result = await preflightImage(file, {
    sessionProvider: async () => ({ access_token: 'test-runtime-token' }),
    client: { post: async (path, body, options) => {
      checked = true
      assert.equal(path, '/api/v1/reconstructions/preflight')
      assert.equal(body.get('image').name, 'object.png')
      assert.equal(options.headers.Authorization, 'Bearer test-runtime-token')
      assert.equal(options.timeout, 30000)
      return { data: response }
    } },
  })
  assert.equal(checked, true)
  assert.deepEqual(result, response)
  assert.equal(JSON.stringify(result).includes('test-runtime-token'), false)
})

test('preflight rejects absent session and maps API failures to safe messages', async () => {
  await assert.rejects(preflightImage(imageFile(), { sessionProvider: async () => null }), /session has ended/)
  assert.match(preflightErrorMessage({ response: { status: 413 } }), /limit/)
  assert.match(preflightErrorMessage({ response: { status: 415 } }), /format/)
  assert.match(preflightErrorMessage({ response: { status: 422 } }), /decode/)
  assert.match(preflightErrorMessage({ response: { status: 401 } }), /Sign in/)
  assert.equal(preflightErrorMessage({ message: 'secret-token' }).includes('secret-token'), false)
})

test('inference sends the selected image with the runtime Supabase token and returns validated real mesh data', async () => {
  const file = imageFile()
  const response = {
    status: 'complete', model: 'Pixel2Mesh', stage: 3,
    vertices_count: 2466, faces_count: 4928, latency_ms: 982.5,
    vertices: Array.from({ length: 2466 }, () => [0, 0, 0]),
    faces: Array.from({ length: 4928 }, () => [0, 1, 2]),
  }
  const result = await inferImage(file, {
    sessionProvider: async () => ({ access_token: 'runtime-test-token' }),
    client: { post: async (path, body, options) => {
      assert.equal(path, '/api/v1/reconstructions/infer')
      assert.equal(body.get('image').name, 'object.png')
      assert.equal(options.headers.Authorization, 'Bearer runtime-test-token')
      assert.equal(options.timeout, 180000)
      return { data: response }
    } },
  })
  assert.deepEqual({ ...result, total_ms: undefined }, {
    status: 'complete', model: 'Pixel2Mesh', stage: 3,
    vertices_count: 2466, faces_count: 4928, latency_ms: 982.5,
    model_init_ms: 0, total_ms: undefined, vertices: response.vertices, faces: response.faces,
  })
  assert.equal(JSON.stringify(result).includes('runtime-test-token'), false)
  assert.equal(result.vertices.length, 2466)
  assert.equal(result.faces.length, 4928)
})

test('inference refuses missing auth and malformed output with safe errors', async () => {
  await assert.rejects(inferImage(imageFile(), { sessionProvider: async () => null }), /session has ended/)
  await assert.rejects(inferImage(imageFile(), {
    sessionProvider: async () => ({ access_token: 'runtime-test-token' }),
    client: { post: async () => ({ data: { status: 'complete', stage: 3 } }) },
  }), /unexpected mesh response/)
  assert.match(inferenceErrorMessage({ response: { status: 503 } }), /unavailable/)
  assert.match(inferenceErrorMessage({ response: { status: 502 } }), /invalid mesh/)
  assert.equal(inferenceErrorMessage({ message: 'runtime-test-token' }).includes('runtime-test-token'), false)
})

test('object names come from meaningful filenames but never invent generic labels', () => {
  assert.equal(deriveObjectName('whiteboard.png'), 'Whiteboard')
  assert.equal(deriveObjectName('office-chair.jpg'), 'Office Chair')
  assert.equal(deriveObjectName('input.png'), '')
  assert.equal(deriveObjectName('IMG_1234.jpg'), '')
})

test('mesh response validation rejects bad counts, vertices, faces, indices, and non-finite values', () => {
  const valid = {
    status: 'complete', model: 'Pixel2Mesh', stage: 3,
    vertices_count: 2466, faces_count: 4928, latency_ms: 10,
    model_init_ms: 0, vertices: Array.from({ length: 2466 }, () => [0, 0, 0]), faces: Array.from({ length: 4928 }, () => [0, 1, 2]),
  }
  assert.equal(validateMeshResponse(valid), '')
  assert.equal(validateMeshResponse({ ...valid, vertices: valid.vertices.slice(1) }), 'MESH DATA INVALID')
  assert.equal(validateMeshResponse({ ...valid, vertices: [[Infinity, 0, 0], ...valid.vertices.slice(1)] }), 'MESH DATA INVALID')
  assert.equal(validateMeshResponse({ ...valid, faces: [[0, 1, 2466], ...valid.faces.slice(1)] }), 'MESH DATA INVALID')
  assert.equal(validateMeshResponse({ ...valid, faces: [[0, 1, 2.2], ...valid.faces.slice(1)] }), 'MESH DATA INVALID')
  assert.equal(formatMilliseconds(2385.8), '2,386 ms')
  assert.equal(formatMilliseconds(0), '0.0 ms')
})
