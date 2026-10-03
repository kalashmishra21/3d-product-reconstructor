import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectImageFile, validateImageFile, MAX_IMAGE_BYTES } from '../src/reconstruction/image.js'
import { preflightImage, preflightErrorMessage } from '../src/lib/preflight.js'

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
