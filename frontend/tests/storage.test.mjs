import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarPath, artifactPath, signedImageUrl } from '../src/lib/storage.js'

const A = '11111111-1111-4111-8111-111111111111'
const R = '22222222-2222-4222-8222-222222222222'

test('generated private paths never include raw filenames', () => {
  assert.equal(artifactPath(A, R, 'source', 'image/jpeg'), `${A}/${R}/source.jpg`)
  assert.equal(artifactPath(A, R, 'glb'), `${A}/${R}/stage3.glb`)
  assert.equal(avatarPath(A, R, 'image/webp'), `${A}/${R}.webp`)
  assert.throws(() => artifactPath('../victim', R, 'glb'))
})

test('signed image URL uses private bucket and short TTL', async () => {
  const calls = []
  const client = { storage: { from(bucket) { calls.push(bucket); return { createSignedUrl: async (path, ttl) => {
    calls.push(path, ttl); return { data: { signedUrl: 'https://example.test/private' }, error: null }
  } } } } }
  const url = await signedImageUrl('avatars', `${A}/${R}.webp`, 120, { client })
  assert.equal(url, 'https://example.test/private')
  assert.deepEqual(calls, ['avatars', `${A}/${R}.webp`, 120])
})
